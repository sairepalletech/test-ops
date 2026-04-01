#!/usr/bin/env node
/**
 * generate-digest.js
 *
 * Generates full-detail.csv and summary.csv from GitHub issues data.
 * Called by daily-digest.yml as a standalone script step, making the
 * workflow easier to test locally and maintain separately from Actions logic.
 *
 * Usage:
 *   node generate-digest.js \
 *     --issues issues.json \
 *     --closed-today closed.json \
 *     --output-dir /tmp \
 *     --date 2026-03-31
 *
 * Input files:
 *   issues.json      - Array of GitHub issue objects (open issues)
 *   closed-today.json - Array of GitHub issue objects closed today (optional)
 *
 * Output files:
 *   <output-dir>/full-detail.csv
 *   <output-dir>/summary.csv
 */

'use strict';

// NOTE ON SLA ACCURACY:
// This script is the local/offline standalone tool for testing and CSV generation.
// It uses issue.updated_at as a proxy for "when did work start" — which is an
// approximation. The authoritative source for SLA timing is lifecycle-timestamps.js
// reading hidden <!-- issueops:timestamp --> comments embedded by the workflows.
// The daily-digest.yml workflow uses that authoritative source.
// This script is suitable for local testing, trend analysis, and retro inputs —
// but not for precise SLA enforcement decisions.

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

function usage() {
  console.error([
    'Usage: node generate-digest.js',
    '  --issues <path/to/issues.json>',
    '  --output-dir <directory>',
    '  [--closed-today <path/to/closed.json>]',
    '  [--date YYYY-MM-DD]',
    '  [--dry-run]',
  ].join('\n'));
  process.exit(2);
}

let issuesPath = null;
let closedTodayPath = null;
let outputDir = '/tmp';
let dateStr = new Date().toISOString().split('T')[0];
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--issues') issuesPath = args[++i];
  else if (args[i] === '--closed-today') closedTodayPath = args[++i];
  else if (args[i] === '--output-dir') outputDir = args[++i];
  else if (args[i] === '--date') dateStr = args[++i];
  else if (args[i] === '--dry-run') dryRun = true;
}

if (!issuesPath) usage();

// SLA configuration
const SLA_CONFIG = {
  'priority/critical': { days: 1,  calendar: true  },
  'priority/high':     { days: 3,  calendar: false },
  'priority/medium':   { days: 7,  calendar: false },
  'priority/low':      { days: 14, calendar: false },
};

function businessDaysBetween(start, end) {
  let count = 0;
  const current = new Date(start);
  while (current < end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function calendarDaysBetween(start, end) {
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
}

function escapeCsv(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Load issues
let issues = [];
try {
  issues = JSON.parse(fs.readFileSync(issuesPath, 'utf-8'));
} catch (e) {
  console.error(`Could not read issues file: ${issuesPath}`);
  process.exit(2);
}

// Load closed today (optional)
let closedToday = [];
if (closedTodayPath && fs.existsSync(closedTodayPath)) {
  try {
    closedToday = JSON.parse(fs.readFileSync(closedTodayPath, 'utf-8'));
  } catch (e) {
    console.warn(`Could not read closed-today file: ${closedTodayPath}`);
  }
}

const today = new Date(dateStr + 'T12:00:00Z');

// Process issues
const fullRows = [];
const overdue = [];
const needsOverdueRemoved = [];

let inProgressCount = 0;
let blockedCount = 0;
let validationCount = 0;
let slaBreachedCount = 0;
let newTodayCount = 0;

for (const issue of issues) {
  // Skip PRs
  if (issue.pull_request) continue;

  const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
  const createdAt = new Date(issue.created_at);
  // updated_at kept for display only — lifecycle timestamps are the SLA clock source
  const updatedAt = new Date(issue.updated_at); // display/fallback only

  const typeLabel = labels.find(l => l.startsWith('type/')) || 'unknown';
  const verticalLabel = labels.find(l => l.startsWith('vertical/')) || 'unknown';
  const priorityLabel = labels.find(l => l.startsWith('priority/')) || null;
  const statusLabel = labels.find(l => l.startsWith('status/')) || 'unknown';

  const assignee = (issue.assignees || []).map(a => a.login || a).join('; ') || 'unassigned';

  // Extract Epic parent from body
  const bodyText = issue.body || '';
  const epicMatch = bodyText.match(/###\s*Parent Epic Number\s*\n+([^\n]+)/);
  const epicParent = epicMatch
    ? (epicMatch[1].trim().match(/#?(\d+)/)?.[1] || 'none')
    : 'none';

  const daysOpen = calendarDaysBetween(createdAt, today);
  const daysInStatus = calendarDaysBetween(updatedAt, today);
  const hasDependency = labels.includes('has-dependency');
  const isInProgress = labels.includes('status/in-progress');
  const isBlocked = labels.includes('status/blocked');
  const alreadyOverdue = labels.includes('status/overdue');
  const isCritical = priorityLabel === 'priority/critical';

  // SLA calculation
  let slaBreached = false;
  let daysUntilBreach = 'N/A';

  if (priorityLabel && SLA_CONFIG[priorityLabel] && !hasDependency) {
    const config = SLA_CONFIG[priorityLabel];
    // For scripts running locally, lifecycle timestamps require fetching comments
    // which is not available in the standalone script context.
    // generate-digest.js is the local/standalone tool — it uses updatedAt as a
    // best-effort fallback. The daily-digest.yml workflow uses lifecycle-timestamps.js
    // for accurate SLA timing when running against live GitHub data.
    // Document this clearly so the distinction is explicit.
    const clockStart = isCritical ? createdAt : updatedAt; // best-effort for local use
    const elapsed = config.calendar
      ? calendarDaysBetween(clockStart, today)
      : businessDaysBetween(clockStart, today);

    if (isInProgress || isCritical) {
      const remaining = config.days - elapsed;
      daysUntilBreach = remaining;
      if (elapsed > config.days) {
        slaBreached = true;
      }
    }
  }

  // Track what needs label changes
  if (slaBreached && !alreadyOverdue) {
    overdue.push(issue.number);
  } else if (!slaBreached && alreadyOverdue) {
    needsOverdueRemoved.push(issue.number);
  }

  // Counters
  if (isInProgress) inProgressCount++;
  if (isBlocked) blockedCount++;
  if (labels.includes('status/validation')) validationCount++;
  if (slaBreached || alreadyOverdue) slaBreachedCount++;
  if (createdAt.toISOString().split('T')[0] === dateStr) newTodayCount++;

  fullRows.push([
    issue.number,
    escapeCsv(issue.title),
    typeLabel.replace('type/', ''),
    verticalLabel.replace('vertical/', ''),
    escapeCsv(assignee),
    (priorityLabel || 'none').replace('priority/', ''),
    statusLabel.replace('status/', ''),
    epicParent,
    createdAt.toISOString().split('T')[0],
    daysOpen,
    daysInStatus,
    updatedAt.toISOString().split('T')[0],
    slaBreached,
    daysUntilBreach,
    isBlocked,
    hasDependency,
    issue.html_url || '',
  ]);
}

// Sort by days_open descending
fullRows.sort((a, b) => b[9] - a[9]);

// Sprint health
const sprintIssues = fullRows.filter(r => ['sprint', 'in-progress'].includes(r[6]));
const sprintOnTrack = sprintIssues.filter(r => r[12] === false).length;
const sprintHealth = sprintIssues.length > 0
  ? Math.round((sprintOnTrack / sprintIssues.length) * 100)
  : 100;

// Generate full-detail.csv
const fullHeaders = [
  'issue_number', 'title', 'type', 'vertical', 'assignee',
  'priority', 'status', 'epic_parent', 'date_opened',
  'days_open', 'days_in_current_status', 'last_activity_date',
  'sla_breached', 'days_until_breach', 'blocked', 'has_dependency', 'url'
].join(',');

const fullCsvLines = [fullHeaders, ...fullRows.map(r => r.join(','))];
const fullCsv = fullCsvLines.join('\n');

// Generate summary.csv
const closedTodayCount = closedToday.filter(i => {
  if (!i.closed_at) return false;
  return new Date(i.closed_at).toISOString().split('T')[0] === dateStr;
}).length;

const summaryRows = [
  ['metric', 'count'],
  ['report_date', dateStr],
  ['new_today', newTodayCount],
  ['in_progress', inProgressCount],
  ['blocked', blockedCount],
  ['awaiting_validation', validationCount],
  ['closed_today', closedTodayCount],
  ['sla_breached', slaBreachedCount],
  ['sprint_health_percent', sprintHealth],
  ['total_open', fullRows.length],
];
const summaryCsv = summaryRows.map(r => r.join(',')).join('\n');

// Write files
if (!dryRun) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(path.join(outputDir, 'full-detail.csv'), fullCsv, 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'summary.csv'), summaryCsv, 'utf-8');
  console.log(`Written: ${path.join(outputDir, 'full-detail.csv')} (${fullRows.length} rows)`);
  console.log(`Written: ${path.join(outputDir, 'summary.csv')}`);
} else {
  console.log('[DRY RUN] Would write full-detail.csv and summary.csv');
  console.log('[DRY RUN] Summary:', JSON.stringify({
    new_today: newTodayCount,
    in_progress: inProgressCount,
    blocked: blockedCount,
    validation: validationCount,
    sla_breached: slaBreachedCount,
    sprint_health: sprintHealth,
    total: fullRows.length,
  }, null, 2));
}

// Output label change recommendations to stdout as JSON
// Workflows can consume this to apply/remove labels
const labelChanges = {
  apply_overdue: overdue,
  remove_overdue: needsOverdueRemoved,
  summary: {
    new_today: newTodayCount,
    in_progress: inProgressCount,
    blocked: blockedCount,
    validation: validationCount,
    sla_breached: slaBreachedCount,
    sprint_health_percent: sprintHealth,
    total_open: fullRows.length,
    closed_today: closedTodayCount,
    report_date: dateStr,
  }
};

// Write label changes to a separate file for workflow consumption
if (!dryRun) {
  fs.writeFileSync(
    path.join(outputDir, 'label-changes.json'),
    JSON.stringify(labelChanges, null, 2),
    'utf-8'
  );
}

console.log(JSON.stringify(labelChanges.summary, null, 2));
process.exit(0);
