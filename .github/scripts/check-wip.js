#!/usr/bin/env node
/**
 * check-wip.js
 *
 * Single canonical WIP check. Called by task-triage.yml on /start
 * AND by wip-enforcement.yml on status/in-progress label applied.
 * Eliminates the duplicate WIP logic that existed in both places.
 *
 * Usage:
 *   node check-wip.js \
 *     --assignee bob \
 *     --current-issue 42 \
 *     --in-progress '[{"number":11,"title":"Fix monitor"},...]' \
 *     --is-cross-vertical false
 *
 * Output: JSON
 *   {
 *     "assignee": "bob",
 *     "current_count": 1,
 *     "limit": 1,
 *     "exceeds_limit": false,
 *     "warning_needed": false,
 *     "others": [{ "number": 11, "title": "..." }],
 *     "message": "..."
 *   }
 *
 * Exit codes:
 *   0 = within limit (may still have warning)
 *   0 = exceeds limit (warning_needed = true, caller decides what to do)
 */

'use strict';

const args = process.argv.slice(2);
let assignee = null;
let currentIssue = null;
let inProgressJson = '[]';
let isCrossVertical = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--assignee') assignee = args[++i];
  else if (args[i] === '--current-issue') currentIssue = parseInt(args[++i]);
  else if (args[i] === '--in-progress') inProgressJson = args[++i];
  else if (args[i] === '--is-cross-vertical') isCrossVertical = args[++i] === 'true';
}

if (!assignee) {
  console.error('Usage: node check-wip.js --assignee <handle> --current-issue <N> --in-progress <json>');
  process.exit(2);
}

let inProgress = [];
try {
  inProgress = JSON.parse(inProgressJson);
} catch (e) {
  console.error(`Invalid JSON in --in-progress: ${e.message}`);
  process.exit(2);
}

// Exclude the current issue from the count
const others = inProgress.filter(i =>
  i.number !== currentIssue && !i.pull_request
).map(i => ({ number: i.number, title: (i.title || '').substring(0, 60) }));

const limit = isCrossVertical ? 2 : 1;
const currentCount = others.length + 1; // +1 for the current issue
const exceedsLimit = others.length >= limit;

let message = '';
if (exceedsLimit) {
  message = `@${assignee} now has ${currentCount} in-progress items (WIP limit is ${limit}). ` +
    `Consider finishing #${others.map(o => o.number).join(', #')} before continuing.`;
}

const result = {
  assignee,
  current_issue: currentIssue,
  current_count: currentCount,
  limit,
  exceeds_limit: exceedsLimit,
  warning_needed: exceedsLimit,
  is_cross_vertical: isCrossVertical,
  others,
  message,
};

console.log(JSON.stringify(result, null, 2));
process.exit(0);
