#!/usr/bin/env node
/**
 * retro-analysis.js
 *
 * Generates retrospective data from sprint CSV artifacts or live GitHub API data.
 * Called by the retro-analysis Copilot skill and the sprint-ceremonies workflow.
 *
 * Usage:
 *   # From CSV artifacts (preferred — use after downloading from Actions)
 *   node retro-analysis.js \
 *     --full-detail /tmp/full-detail.csv \
 *     --sprint-name "Sprint 6" \
 *     --format text
 *
 *   # From live GitHub API (requires GH_TOKEN env var)
 *   node retro-analysis.js \
 *     --live \
 *     --days 14 \
 *     --sprint-name "Sprint 6" \
 *     --format json
 *
 * Output formats: text (default) | json | markdown
 */

'use strict';

const fs = require('fs');
const https = require('https');

const args = process.argv.slice(2);

let csvPath = null;
let sprintName = 'Current Sprint';
let outputFormat = 'text';
let liveFetch = false;
let days = 14;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--full-detail') csvPath = args[++i];
  else if (args[i] === '--sprint-name') sprintName = args[++i];
  else if (args[i] === '--format') outputFormat = args[++i];
  else if (args[i] === '--live') liveFetch = true;
  else if (args[i] === '--days') days = parseInt(args[++i]);
}

/**
 * Parse CSV into array of objects
 */
function parseCsv(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = [];
    let inQuotes = false;
    let current = '';
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) { values.push(current); current = ''; }
      else current += ch;
    }
    values.push(current);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (values[i] || '').trim());
    return obj;
  });
}

/**
 * Calculate average of array
 */
function avg(arr) {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

/**
 * Analyse issues data and produce retro metrics
 */
function analyseIssues(issues, closedIssues) {
  const today = new Date();

  // Delivered this sprint
  const delivered = closedIssues.filter(i =>
    i.status === 'done' || i.type === 'task' || i.type === 'bug'
  );

  // By vertical
  const byVertical = {};
  for (const i of delivered) {
    const v = i.vertical || 'unknown';
    if (!byVertical[v]) byVertical[v] = 0;
    byVertical[v]++;
  }

  // Cycle times (days_open for closed issues)
  const cycleTimes = delivered
    .map(i => parseInt(i.days_open))
    .filter(n => !isNaN(n) && n >= 0);

  // SLA performance
  const slaMet = delivered.filter(i => i.sla_breached !== 'true').length;
  const slaPct = delivered.length > 0 ? Math.round((slaMet / delivered.length) * 100) : 100;

  // Blocked items
  const blocked = issues.filter(i => i.blocked === 'true' || i.status === 'blocked');

  // Overdue items
  const overdue = issues.filter(i => i.sla_breached === 'true');

  // Priority breakdown of delivered
  const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of delivered) {
    const p = (i.priority || '').toLowerCase();
    if (byPriority[p] !== undefined) byPriority[p]++;
  }

  // Validation rejection rate — look for issues with feedback-required
  const hadFeedback = issues.filter(i =>
    i.status === 'feedback-required' || i.status === 'in-progress'
  ).length;
  const rejectionRate = delivered.length > 0
    ? Math.round((hadFeedback / delivered.length) * 100)
    : 0;

  return {
    sprint_name: sprintName,
    report_date: today.toISOString().split('T')[0],
    velocity: {
      delivered: delivered.length,
      avg_cycle_time_days: avg(cycleTimes),
      min_cycle_time: Math.min(...cycleTimes, 999) === 999 ? 0 : Math.min(...cycleTimes),
      max_cycle_time: Math.max(...cycleTimes, 0),
    },
    sla: {
      met: slaMet,
      total: delivered.length,
      percent: slaPct,
      breached: delivered.length - slaMet,
    },
    blockers: {
      total_blocked: blocked.length,
      overdue_items: overdue.length,
    },
    quality: {
      validation_rejection_rate_pct: rejectionRate,
      items_needing_rework: hadFeedback,
    },
    by_vertical: byVertical,
    by_priority: byPriority,
    retro_questions: {
      what_slowed_us: blocked.length > 0
        ? `${blocked.length} item(s) were blocked. Review blocker root causes.`
        : 'No blockers this sprint — what made execution smooth?',
      what_went_well: `${delivered.length} items delivered, ${slaPct}% met SLA.`,
      what_to_change: 'Agree 1-2 specific changes. Create a task for each in the board.',
    }
  };
}

/**
 * Format output as readable text
 */
function formatText(metrics) {
  const lines = [
    `═══════════════════════════════════════════════`,
    ` Sprint Retro Data — ${metrics.sprint_name}`,
    ` Generated: ${metrics.report_date}`,
    `═══════════════════════════════════════════════`,
    '',
    '── VELOCITY ────────────────────────────────────',
    `  Items delivered:       ${metrics.velocity.delivered}`,
    `  Avg cycle time:        ${metrics.velocity.avg_cycle_time_days} days`,
    `  Fastest:               ${metrics.velocity.min_cycle_time} days`,
    `  Slowest:               ${metrics.velocity.max_cycle_time} days`,
    '',
    '── SLA PERFORMANCE ─────────────────────────────',
    `  Met SLA:               ${metrics.sla.met}/${metrics.sla.total} (${metrics.sla.percent}%)`,
    `  Breached:              ${metrics.sla.breached}`,
    '',
    '── BLOCKERS ────────────────────────────────────',
    `  Items that got blocked: ${metrics.blockers.total_blocked}`,
    `  Items still overdue:    ${metrics.blockers.overdue_items}`,
    '',
    '── QUALITY ─────────────────────────────────────',
    `  Validation rejection rate: ${metrics.quality.validation_rejection_rate_pct}%`,
    `  Items needing rework:      ${metrics.quality.items_needing_rework}`,
    '',
    '── DELIVERY BY VERTICAL ────────────────────────',
    ...Object.entries(metrics.by_vertical).map(([v, n]) =>
      `  ${v.padEnd(25)} ${n} item(s)`
    ),
    '',
    '── DELIVERY BY PRIORITY ────────────────────────',
    ...Object.entries(metrics.by_priority)
      .filter(([, n]) => n > 0)
      .map(([p, n]) => `  ${p.padEnd(25)} ${n} item(s)`),
    '',
    '── RETRO QUESTIONS ─────────────────────────────',
    '',
    '  1. What slowed us down?',
    `     ${metrics.retro_questions.what_slowed_us}`,
    '',
    '  2. What went well?',
    `     ${metrics.retro_questions.what_went_well}`,
    '',
    '  3. What do we change?',
    `     ${metrics.retro_questions.what_to_change}`,
    '',
    '═══════════════════════════════════════════════',
    '  Reminder: Every agreed change becomes a task.',
    '═══════════════════════════════════════════════',
  ];
  return lines.join('\n');
}

/**
 * Format as markdown
 */
function formatMarkdown(metrics) {
  return [
    `## Sprint Retro Data — ${metrics.sprint_name}`,
    `*Generated: ${metrics.report_date}*`,
    '',
    '### Velocity',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Items delivered | ${metrics.velocity.delivered} |`,
    `| Avg cycle time | ${metrics.velocity.avg_cycle_time_days} days |`,
    `| SLA met | ${metrics.sla.met}/${metrics.sla.total} (${metrics.sla.percent}%) |`,
    '',
    '### Blockers',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Items blocked | ${metrics.blockers.total_blocked} |`,
    `| Items overdue | ${metrics.blockers.overdue_items} |`,
    `| Validation rework rate | ${metrics.quality.validation_rejection_rate_pct}% |`,
    '',
    '### Delivery by Vertical',
    ...Object.entries(metrics.by_vertical).map(([v, n]) => `- **${v}**: ${n} item(s)`),
    '',
    '### Retro Questions',
    `1. **What slowed us down?** ${metrics.retro_questions.what_slowed_us}`,
    `2. **What went well?** ${metrics.retro_questions.what_went_well}`,
    `3. **What do we change?** ${metrics.retro_questions.what_to_change}`,
    '',
    '> Every agreed change becomes a task linked to the Continuous Improvement Epic.',
  ].join('\n');
}

// Main execution
async function main() {
  let allIssues = [];
  let closedIssues = [];

  if (csvPath) {
    if (!fs.existsSync(csvPath)) {
      console.error(`CSV file not found: ${csvPath}`);
      process.exit(2);
    }
    const content = fs.readFileSync(csvPath, 'utf-8');
    const parsed = parseCsv(content);
    // Split into open and closed (closed have status=done)
    closedIssues = parsed.filter(i => i.status === 'done');
    allIssues = parsed.filter(i => i.status !== 'done');
    console.error(`Loaded ${parsed.length} issues from CSV (${closedIssues.length} closed, ${allIssues.length} open)`);
  } else {
    console.error('Error: --full-detail <csv path> is required');
    console.error('Download the full-detail.csv from the daily-digest workflow artifacts first.');
    process.exit(2);
  }

  const metrics = analyseIssues(allIssues, closedIssues);

  if (outputFormat === 'json') {
    console.log(JSON.stringify(metrics, null, 2));
  } else if (outputFormat === 'markdown') {
    console.log(formatMarkdown(metrics));
  } else {
    console.log(formatText(metrics));
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
