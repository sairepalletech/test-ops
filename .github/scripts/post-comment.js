#!/usr/bin/env node
/**
 * post-comment.js
 *
 * Generates structured comment bodies for all IssueOps workflow events.
 * Centralises comment formatting so workflows stay thin and comments
 * stay consistent. Workflows call this, capture stdout, and post via API.
 *
 * Usage:
 *   node post-comment.js --event <event-name> --data '<json>'
 *
 * Events and required data fields:
 *
 *   task-received        { epic_number, epic_title, vertical, priority, sla, pod_owner, affected_system, today }
 *   task-blocked-epic    { epic_number, epic_title }
 *   task-no-epic         {}
 *   task-epic-not-found  { epic_number }
 *   epic-received        { vertical, actor, today }
 *   epic-approved        { epic_id, actor, today, vertical, priority }
 *   epic-rejected        { reason, actor, today }
 *   unauthorized         { actor, action }
 *   accepted             { actor, today }
 *   deferred             { actor, reason, today }
 *   duplicate            { actor, dup_number, today }
 *   rejected-task        { actor, reason, today }
 *   started              { actor, today, wip_warning }
 *   blocked              { actor, today, reason }
 *   unblocked            { actor, today, resolution }
 *   validated            { actor, today }
 *   approved-validation  { actor, today, note }
 *   feedback             { actor, today, gaps }
 *   rejected-validation  { actor, today, reason }
 *   depends-on           { actor, today, dep_number, issue_number }
 *   dep-notice           { issue_number, dep_number }
 *   dep-resolved         { dep_number, dep_title, today }
 *   wip-warning          { actor, count, limit, others }
 *   epic-progress        { closed_number, completed, total, pct, open_list }
 *   epic-complete        { epic_id, today, total }
 *   task-released        { epic_number, epic_id }
 *   critical-activated   { mentions, today }
 *   timeline-update      { actor, update, now }
 *
 * Output:
 *   Prints the comment markdown body to stdout.
 *   Caller posts it via GitHub API.
 *
 * Exit codes:
 *   0 = success
 *   1 = unknown event
 *   2 = missing required data fields
 */

'use strict';

const args = process.argv.slice(2);
const FOOTER = '\n\n---\n*Automated by CI/CD IssueOps | ci-cd-team*';

let event = null;
let rawData = '{}';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--event') event = args[++i];
  else if (args[i] === '--data') rawData = args[++i];
}

if (!event) {
  console.error('Usage: node post-comment.js --event <name> --data \'<json>\'');
  process.exit(2);
}

let d = {};
try {
  d = JSON.parse(rawData);
} catch (e) {
  console.error(`Invalid JSON in --data: ${e.message}`);
  process.exit(2);
}

function table(rows) {
  return ['| Field | Value |', '|-------|-------|',
    ...rows.map(([k, v]) => `| **${k}** | ${v} |`)
  ].join('\n');
}

const comments = {

  'task-received': () => [
    '## ✅ Task Received',
    '',
    table([
      ['Linked Epic', `#${d.epic_number} — ${d.epic_title}`],
      ['Status', 'In review'],
      ['Vertical', d.vertical || 'Not specified'],
      ['Priority', d.priority || 'Not specified'],
      ['SLA', d.sla || 'Standard — 3 business days from /start'],
      ['Affected System', d.affected_system || 'Not specified'],
      ['Received', d.today],
    ]),
    '',
    d.pod_owner
      ? `${d.pod_owner} has been notified as pod owner for **${d.vertical}**.`
      : `No pod owner configured for ${d.vertical} in CODEOWNERS — please assign manually.`,
    '',
    '**Next step:** Pod owner will post `/accept`, `/defer`, `/duplicate #N`, or `/reject <reason>`.',
    '',
    d.priority === 'Critical'
      ? '> 🚨 **Critical** — fast-tracked to sprint. Pod owner response expected within **30 minutes**.'
      : '',
  ].filter(l => l !== null).join('\n') + FOOTER,

  'task-blocked-epic': () => [
    '## ⏳ Task Held — Parent Epic Pending Approval',
    '',
    table([
      ['Parent Epic', `#${d.epic_number} — ${d.epic_title}`],
      ['Epic Status', '`status/pending-approval`'],
    ]),
    '',
    'This task will be **automatically released** once the Epic is approved. No action needed.',
  ].join('\n') + FOOTER,

  'task-no-epic': () => [
    '## ⛔ Task Blocked — No Valid Parent Epic',
    '',
    'No valid parent Epic number was found in the **Parent Epic Number** field.',
    '',
    '**To fix:** Edit this issue and enter a valid approved Epic number (e.g. `#10`).',
  ].join('\n') + FOOTER,

  'task-epic-not-found': () => [
    `## ⛔ Task Blocked — Epic #${d.epic_number} Not Found`,
    '',
    `Issue #${d.epic_number} does not exist in this repository.`,
    'Please edit the Parent Epic Number field with a valid issue number.',
  ].join('\n') + FOOTER,

  'epic-received': () => [
    '## 📋 Epic Received — Pending Approval',
    '',
    table([
      ['Vertical detected', d.vertical || 'Not yet determined'],
      ['Submitted by', `@${d.actor}`],
      ['Submitted at', d.today],
    ]),
    '',
    '**Maintainer actions:**',
    '',
    '| Command | Effect |',
    '|---------|--------|',
    '| `/approve` | Activates the Epic — labels applied, Epic ID generated, moved to backlog |',
    '| `/reject <reason>` | Closes the Epic with reason documented |',
    '',
    '> Only maintainers with **write access** can approve or reject.',
  ].join('\n') + FOOTER,

  'epic-approved': () => [
    '## ✅ Epic Approved',
    '',
    table([
      ['Epic ID', `\`${d.epic_id}\``],
      ['Approved by', `@${d.actor}`],
      ['Approved on', d.today],
      ['Vertical', d.vertical],
      ['Priority', d.priority],
      ['Status', 'Moved to backlog'],
    ]),
    '',
    `This Epic is now **active**. Tasks can be linked using \`#${d.issue_number || '?'}\` as the Parent Epic Number.`,
    '',
    '**Labels applied:**',
    `\`epic\` \`OKR\` \`${d.year || new Date().getFullYear()}\` \`status/backlog\` \`vertical/${d.vertical_slug || d.vertical}\` \`priority/${(d.priority || '').toLowerCase()}\``,
  ].join('\n') + FOOTER,

  'epic-rejected': () => [
    '## ❌ Epic Rejected',
    '',
    table([
      ['Reason', d.reason || 'No reason provided'],
      ['Rejected by', `@${d.actor}`],
      ['Date', d.today],
    ]),
    '',
    'Epic closed. If concerns are addressed, a new Epic can be submitted.',
  ].join('\n') + FOOTER,

  'unauthorized': () =>
    `@${d.actor} — you do not have write access to run \`${d.action || 'this command'}\`. Only repository maintainers can do this.` + FOOTER,

  'accepted': () => [
    '## ✅ Task Accepted',
    '',
    table([
      ['Accepted by', `@${d.actor}`],
      ['Date', d.today],
      ['Status', 'Moved to backlog'],
    ]),
    '',
    'Task is now in the backlog and will be pulled into the next sprint planning session.',
  ].join('\n') + FOOTER,

  'deferred': () => [
    '## ⏱️ Task Deferred',
    '',
    table([
      ['Deferred by', `@${d.actor}`],
      ['Reason', d.reason || 'No reason provided'],
      ['Date', d.today],
    ]),
    '',
    'Task remains in backlog for future sprint consideration.',
  ].join('\n') + FOOTER,

  'duplicate': () => [
    `## 🔁 Marked as Duplicate of #${d.dup_number}`,
    '',
    table([
      ['Marked by', `@${d.actor}`],
      ['Duplicate of', `#${d.dup_number}`],
      ['Date', d.today],
    ]),
    '',
    `Please follow #${d.dup_number} for tracking this work.`,
  ].join('\n') + FOOTER,

  'rejected-task': () => [
    '## ❌ Task Rejected',
    '',
    table([
      ['Rejected by', `@${d.actor}`],
      ['Reason', d.reason || 'No reason provided'],
      ['Date', d.today],
    ]),
    '',
    'Task closed. If concerns are addressed, a new task can be submitted.',
  ].join('\n') + FOOTER,

  'started': () => [
    '## 🚀 Task Started',
    '',
    table([
      ['Started by', `@${d.actor}`],
      ['Start date', d.today],
      ['Status', 'In progress — SLA clock now running'],
    ]),
    '',
    d.wip_warning ? `> ⚠️ **WIP Warning:** ${d.wip_warning}` : '',
    '',
    'Use `/block <reason>` if you hit a blocker. Use `/validate` when complete.',
  ].filter(l => l !== null).join('\n') + FOOTER,

  'blocked': () => [
    '## 🚧 Task Blocked',
    '',
    table([
      ['Blocked by', `@${d.actor}`],
      ['Date blocked', d.today],
      ['Reason', d.reason || 'No reason provided'],
    ]),
    '',
    '**Team lead and Epic owner have been notified.**',
    'Use `/unblock <resolution>` when the blocker is cleared.',
    '',
    '> ⚠️ SLA clock continues running while blocked.',
  ].join('\n') + FOOTER,

  'unblocked': () => [
    '## ✅ Task Unblocked',
    '',
    table([
      ['Unblocked by', `@${d.actor}`],
      ['Date', d.today],
      ['Resolution', d.resolution || 'Blocker resolved'],
    ]),
    '',
    'Task is back **in progress**. SLA clock continues.',
  ].join('\n') + FOOTER,

  'validated': () => [
    '## 🔍 Task Ready for Validation',
    '',
    table([
      ['Submitted by', `@${d.actor}`],
      ['Date', d.today],
      ['Status', 'Awaiting sign-off'],
    ]),
    '',
    '**Reviewer:** please check against the Expected Outcome field and post:',
    '- `/approve-validation [note]` — outcome met',
    '- `/feedback <gaps>` — gaps found, return with feedback',
    '- `/reject-validation <reason>` — outcome not met, return to in-progress',
  ].join('\n') + FOOTER,

  'approved-validation': () => [
    '## ✅ Task Validated and Complete',
    '',
    table([
      ['Validated by', `@${d.actor}`],
      ['Date', d.today],
      ...(d.note ? [['Note', d.note]] : []),
    ]),
    '',
    'Task is **done**. Sprint velocity updated. Epic progress updated.',
  ].join('\n') + FOOTER,

  'feedback': () => [
    '## 💬 Validation Feedback',
    '',
    table([
      ['Feedback from', `@${d.actor}`],
      ['Date', d.today],
      ['Gaps identified', d.gaps || 'See comment thread for details'],
    ]),
    '',
    'Task stays in **validation** with `status/feedback-required`.',
    'Please address the gaps and post `/validate` again.',
  ].join('\n') + FOOTER,

  'rejected-validation': () => [
    '## ❌ Validation Rejected — Returned to In Progress',
    '',
    table([
      ['Rejected by', `@${d.actor}`],
      ['Date', d.today],
      ['Reason', d.reason || 'Outcome not met'],
    ]),
    '',
    'Task returned to **in-progress**. SLA clock continues.',
    'Address the rejection reason and post `/validate` when ready.',
  ].join('\n') + FOOTER,

  'depends-on': () => [
    '## 🔗 Dependency Registered',
    '',
    table([
      ['This task', `#${d.issue_number}`],
      ['Depends on', `#${d.dep_number}`],
      ['Registered by', `@${d.actor}`],
      ['Date', d.today],
    ]),
    '',
    '> ⏸️ **SLA clock is paused** while dependency #' + d.dep_number + ' is open.',
    'Clock resumes when #' + d.dep_number + ' is closed.',
  ].join('\n') + FOOTER,

  'dep-notice': () => [
    '## 🔗 Dependency Notice',
    '',
    `Task #${d.issue_number} is waiting on this issue to complete.`,
    `When this issue closes, #${d.issue_number} will be notified automatically.`,
  ].join('\n') + FOOTER,

  'dep-resolved': () => [
    '## 🔓 Dependency Resolved',
    '',
    table([
      ['Dependency closed', `#${d.dep_number} — ${d.dep_title || ''}`],
      ['Date', d.today],
    ]),
    '',
    '**SLA clock has resumed.** Post `/start` if you are ready to proceed.',
    '',
    '> If other dependencies remain open, the SLA clock stays paused until all are resolved.',
  ].join('\n') + FOOTER,

  'wip-warning': () => [
    '## ⚠️ WIP Limit Warning',
    '',
    `@${d.actor} — you now have **${d.count} in-progress item(s)** (WIP limit is ${d.limit}).`,
    '',
    '**Current in-progress:**',
    (d.others || []).map(i => `- #${i.number} — ${i.title}`).join('\n') || '*(none listed)*',
    '',
    'Consider finishing or parking an existing item before continuing. This is a warning, not a block.',
  ].join('\n') + FOOTER,

  'epic-progress': () => [
    '## 📈 Epic Progress Update',
    '',
    `Task **#${d.closed_number}** has been completed.`,
    '',
    table([
      ['Completed tasks', `${d.completed} of ${d.total} (${d.pct}%)`],
      ['Still open', d.open_list || '0'],
    ]),
  ].join('\n') + FOOTER,

  'epic-complete': () => [
    '## 🎉 Epic Complete — All Tasks Delivered',
    '',
    table([
      ['Epic ID', `\`${d.epic_id}\``],
      ['Completed', d.today],
      ['Tasks delivered', `${d.total} of ${d.total}`],
      ['OKR tag', 'Preserved for year-end reporting'],
    ]),
    '',
    '**All child tasks have been validated and closed.**',
  ].join('\n') + FOOTER,

  'task-released': () => [
    '## 🔓 Task Released',
    '',
    `Parent Epic #${d.epic_number} (\`${d.epic_id}\`) has been approved.`,
    'This task has been moved to **status/review** and is ready for pod owner triage.',
  ].join('\n') + FOOTER,

  'critical-activated': () => [
    '## 🚨 Critical Issue — Fast Lane Activated',
    '',
    d.mentions ? `${d.mentions}` : '',
    '',
    table([
      ['Priority', 'Critical'],
      ['Fast lane', 'Bypassed backlog — moved directly to sprint'],
      ['SLA', '1 calendar day from issue creation'],
      ['SLA start', d.today],
      ['Response expected', 'Within 30 minutes'],
    ]),
    '',
    '### Required actions',
    '1. Pod owner — acknowledge within 30 minutes',
    '2. Post `/start` to begin work immediately',
    '3. Post `/update <status>` every 30 minutes until resolved',
    '4. Post `/validate` when complete',
    '',
    '> ⏱️ Issue will be flagged `status/overdue` by tomorrow\'s digest if not resolved.',
  ].filter(l => l !== null).join('\n') + FOOTER,

  'timeline-update': () =>
    `## 🕐 Critical Timeline Update — ${d.now}\n\n**@${d.actor}:** ${d.update || 'Status update posted'}` + FOOTER,

};

const fn = comments[event];
if (!fn) {
  console.error(`Unknown event: "${event}"`);
  console.error(`Valid events: ${Object.keys(comments).join(', ')}`);
  process.exit(1);
}

console.log(fn());
process.exit(0);
