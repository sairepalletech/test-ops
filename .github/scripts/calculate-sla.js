#!/usr/bin/env node
/**
 * calculate-sla.js
 *
 * Calculates SLA status for a GitHub issue based on its priority label
 * and the date tracking started.
 *
 * Usage:
 *   node calculate-sla.js \
 *     --priority priority/high \
 *     --start-date 2026-03-28 \
 *     --today 2026-03-31 \
 *     [--paused]
 *
 * Output: JSON with fields:
 *   {
 *     priority:         "high",
 *     threshold_days:   3,
 *     clock_type:       "business",
 *     elapsed_days:     2,
 *     days_until_breach: 1,
 *     at_risk:          false,
 *     breached:         false,
 *     paused:           false,
 *     status:           "on-track" | "at-risk" | "breached" | "paused"
 *   }
 *
 * Exit codes:
 *   0 = success
 *   1 = invalid priority label
 *   2 = invalid arguments
 */

'use strict';

const args = process.argv.slice(2);

function usage() {
  console.error([
    'Usage: node calculate-sla.js',
    '  --priority <priority/critical|high|medium|low>',
    '  --start-date <YYYY-MM-DD>',
    '  --today <YYYY-MM-DD>',
    '  [--paused]     # SLA clock is paused (has-dependency label present)'
  ].join('\n'));
  process.exit(2);
}

// Parse CLI args
let priority = null;
let startDateStr = null;
let todayStr = null;
let paused = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--priority') priority = args[++i];
  else if (args[i] === '--start-date') startDateStr = args[++i];
  else if (args[i] === '--today') todayStr = args[++i];
  else if (args[i] === '--paused') paused = true;
}

if (!priority || !startDateStr || !todayStr) usage();

// SLA configuration
const SLA_CONFIG = {
  'priority/critical': { days: 1,  clockType: 'calendar', label: 'Critical' },
  'critical':          { days: 1,  clockType: 'calendar', label: 'Critical' },
  'priority/high':     { days: 3,  clockType: 'business', label: 'High' },
  'high':              { days: 3,  clockType: 'business', label: 'High' },
  'priority/medium':   { days: 7,  clockType: 'business', label: 'Medium' },
  'medium':            { days: 7,  clockType: 'business', label: 'Medium' },
  'priority/low':      { days: 14, clockType: 'business', label: 'Low' },
  'low':               { days: 14, clockType: 'business', label: 'Low' },
};

const config = SLA_CONFIG[priority.toLowerCase()];
if (!config) {
  console.error(`Unknown priority: "${priority}"`);
  console.error(`Valid values: ${Object.keys(SLA_CONFIG).join(', ')}`);
  process.exit(1);
}

const startDate = new Date(startDateStr + 'T00:00:00Z');
const today = new Date(todayStr + 'T00:00:00Z');

if (isNaN(startDate.getTime())) {
  console.error(`Invalid start-date: "${startDateStr}"`);
  process.exit(2);
}
if (isNaN(today.getTime())) {
  console.error(`Invalid today: "${todayStr}"`);
  process.exit(2);
}

/**
 * Count business days between two dates (start inclusive, end exclusive)
 */
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

/**
 * Count calendar days between two dates
 */
function calendarDaysBetween(start, end) {
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
}

// Calculate elapsed days
const elapsed = config.clockType === 'calendar'
  ? calendarDaysBetween(startDate, today)
  : businessDaysBetween(startDate, today);

const daysUntilBreach = config.days - elapsed;
const atRiskThreshold = Math.floor(config.days * 0.75);

// Determine status
let status;
if (paused) {
  status = 'paused';
} else if (elapsed > config.days) {
  status = 'breached';
} else if (elapsed >= atRiskThreshold) {
  status = 'at-risk';
} else {
  status = 'on-track';
}

const result = {
  priority:           config.label.toLowerCase(),
  threshold_days:     config.days,
  clock_type:         config.clockType,
  elapsed_days:       elapsed,
  days_until_breach:  daysUntilBreach,
  at_risk:            status === 'at-risk',
  breached:           status === 'breached',
  paused:             paused,
  status:             status,
  start_date:         startDateStr,
  today:              todayStr,
  labels_to_apply:    [],
  labels_to_remove:   [],
};

// Label recommendations
if (status === 'breached') {
  result.labels_to_apply.push('status/overdue');
} else {
  result.labels_to_remove.push('status/overdue');
}

console.log(JSON.stringify(result, null, 2));
process.exit(0);
