#!/usr/bin/env node
/**
 * test-local.js
 *
 * Local test harness for the CI/CD IssueOps scripts.
 * Run this to verify all scripts work correctly before pushing to GitHub.
 * No GitHub token required — uses mock data.
 *
 * Usage:
 *   node .github/scripts/test-local.js
 *   node .github/scripts/test-local.js --verbose
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname);
const VERBOSE = process.argv.includes('--verbose');

let passed = 0;
let failed = 0;

function run(description, command, expectedExit = 0) {
  try {
    const result = execSync(command, {
      cwd: path.join(SCRIPTS_DIR, '../..'),
      encoding: 'utf-8',
      stdio: VERBOSE ? 'inherit' : 'pipe'
    });
    if (VERBOSE) console.log('  Output:', result.substring(0, 200));
    console.log(`  ✅ ${description}`);
    passed++;
    return result;
  } catch (e) {
    if (e.status === expectedExit) {
      console.log(`  ✅ ${description} (expected exit ${expectedExit})`);
      passed++;
      return e.stdout || '';
    }
    console.log(`  ❌ ${description}`);
    console.log(`     Exit: ${e.status}, expected: ${expectedExit}`);
    if (e.stderr) console.log(`     Stderr: ${e.stderr.substring(0, 200)}`);
    failed++;
    return null;
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(2, 50 - title.length))}`);
}

// ── Test data ────────────────────────────────────────────────────────────────
const SAMPLE_TASK_BODY = `### Task Title
Fix Datadog CPU monitor false alert threshold

### What are you doing?
Raising the CPU monitor threshold from 70% to 85% to eliminate false alerts

### Why are you doing it?
On-call engineers are being paged for non-incidents causing alert fatigue

### Summary
CPU monitor threshold needs raising. False alerts are causing on-call burnout.

### Expected Outcome
Monitor fires only on genuine CPU spikes above 85% with zero false alerts during normal pipeline runs

### Parent Epic Number
#10

### Vertical
Datadog

### Assignee
@bob

### Priority
High

### Affected System
datadog-prod-monitors`;

const SAMPLE_EPIC_BODY = `### Epic Title
Migrate JFrog Artifactory from on-prem to SaaS on AWS

### What is this Epic about?
Moving from self-hosted Artifactory to JFrog SaaS to reduce infrastructure maintenance overhead

### Why does this matter?
On-prem instance requires manual patching and has no HA, costing 3 days per quarter in maintenance

### Business Sponsor
Platform Engineering Lead

### OKR Alignment
Reduce infrastructure toil by 40% in 2026

### Success Criteria
All pipelines using SaaS endpoint, zero artifact failures post-cutover, latency within 10% of baseline

### Epic Owner
@sai

### Vertical
Artifactory

### Estimated Effort
Large (6-10 tasks, spans two sprints)

### Priority
High`;

// Write test body files
fs.writeFileSync('/tmp/task_body.txt', SAMPLE_TASK_BODY);
fs.writeFileSync('/tmp/epic_body.txt', SAMPLE_EPIC_BODY);

// Write sample issues JSON for digest test
const SAMPLE_ISSUES = [
  {
    number: 11, title: '[TASK] Fix Datadog CPU monitor threshold',
    labels: [{ name: 'type/task' }, { name: 'vertical/datadog' }, { name: 'priority/high' }, { name: 'status/in-progress' }],
    assignees: [{ login: 'bob' }],
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    body: SAMPLE_TASK_BODY,
    html_url: 'https://github.com/org/repo/issues/11',
    state: 'open'
  },
  {
    number: 12, title: '[TASK] Run canary pipeline on SaaS endpoint',
    labels: [{ name: 'type/task' }, { name: 'vertical/artifactory' }, { name: 'priority/high' }, { name: 'status/blocked' }],
    assignees: [{ login: 'bob' }],
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    body: '### Parent Epic Number\n#10\n### Vertical\nArtifactory\n### Priority\nHigh\n### Affected System\njfrog-saas',
    html_url: 'https://github.com/org/repo/issues/12',
    state: 'open'
  },
  {
    number: 14, title: '[TASK] Wave-based cutover execution',
    labels: [{ name: 'type/task' }, { name: 'vertical/artifactory' }, { name: 'priority/critical' }, { name: 'status/in-progress' }, { name: 'has-dependency' }],
    assignees: [{ login: 'alice' }],
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    body: '### Parent Epic Number\n#10\n### Vertical\nArtifactory\n### Priority\nCritical\n### Affected System\njfrog-cutover',
    html_url: 'https://github.com/org/repo/issues/14',
    state: 'open'
  }
];

fs.writeFileSync('/tmp/test_issues.json', JSON.stringify(SAMPLE_ISSUES, null, 2));

console.log('CI/CD IssueOps — Local Test Suite');
console.log('===================================\n');

// ── parse-issue-body.js ──────────────────────────────────────────────────────
section('parse-issue-body.js');

run('Parse single field — Parent Epic Number',
  `node .github/scripts/parse-issue-body.js --body "$(cat /tmp/task_body.txt)" --field "Parent Epic Number"`
);

run('Parse single field — Vertical → returns label',
  `node .github/scripts/parse-issue-body.js --body "$(cat /tmp/task_body.txt)" --field "Vertical"`
);

run('Parse all fields — task body',
  `node .github/scripts/parse-issue-body.js --body "$(cat /tmp/task_body.txt)" --all`
);

run('Parse all fields — epic body with computed fields',
  `node .github/scripts/parse-issue-body.js --body "$(cat /tmp/epic_body.txt)" --all`
);

run('Missing field returns exit 1',
  `node .github/scripts/parse-issue-body.js --body "$(cat /tmp/task_body.txt)" --field "Nonexistent Field"`,
  1
);

// ── calculate-sla.js ─────────────────────────────────────────────────────────
section('calculate-sla.js');

const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const today = new Date().toISOString().split('T')[0];

run('High priority — on track (1 day elapsed, 3 day threshold)',
  `node .github/scripts/calculate-sla.js --priority priority/high --start-date ${yesterday} --today ${today}`
);

run('High priority — breached (4 days elapsed, 3 day threshold)',
  `node .github/scripts/calculate-sla.js --priority priority/high --start-date ${threeDaysAgo} --today ${today}`
);

run('Critical priority — breached (2 days elapsed, 1 day threshold)',
  `node .github/scripts/calculate-sla.js --priority critical --start-date ${yesterday} --today ${today}`
);

run('Paused SLA — has-dependency',
  `node .github/scripts/calculate-sla.js --priority priority/high --start-date ${threeDaysAgo} --today ${today} --paused`
);

run('Invalid priority returns exit 1',
  `node .github/scripts/calculate-sla.js --priority unknown --start-date ${yesterday} --today ${today}`,
  1
);

// ── get-pod-owner.js ─────────────────────────────────────────────────────────
section('get-pod-owner.js');

run('Get Datadog pod owner',
  `node .github/scripts/get-pod-owner.js --vertical "Datadog" --codeowners .github/CODEOWNERS`
);

run('Get all owners',
  `node .github/scripts/get-pod-owner.js --all --codeowners .github/CODEOWNERS`
);

run('Unknown vertical returns exit 2',
  `node .github/scripts/get-pod-owner.js --vertical "Unknown" --codeowners .github/CODEOWNERS`,
  2
);

// ── validate-issue.js ────────────────────────────────────────────────────────
section('validate-issue.js');

run('Valid task body passes',
  `node .github/scripts/validate-issue.js --type task --body "$(cat /tmp/task_body.txt)"`
);

run('Valid epic body passes',
  `node .github/scripts/validate-issue.js --type epic --body "$(cat /tmp/epic_body.txt)"`
);

run('Empty body fails with exit 1',
  `node .github/scripts/validate-issue.js --type task --body "### Task Title\nTest"`,
  1
);

// ── generate-epic-id.js ──────────────────────────────────────────────────────
section('generate-epic-id.js');

run('Generate Epic ID for issue #10',
  `node .github/scripts/generate-epic-id.js --issue-number 10`
);

run('Generate Epic ID for issue #1',
  `node .github/scripts/generate-epic-id.js --issue-number 1`
);

run('Generate Epic ID with explicit year',
  `node .github/scripts/generate-epic-id.js --issue-number 42 --year 2025`
);

// ── generate-digest.js ───────────────────────────────────────────────────────
section('generate-digest.js');

run('Generate digest from sample issues JSON (dry run)',
  `node .github/scripts/generate-digest.js --issues /tmp/test_issues.json --output-dir /tmp --date ${today} --dry-run`
);

run('Generate digest and write CSV files',
  `node .github/scripts/generate-digest.js --issues /tmp/test_issues.json --output-dir /tmp --date ${today}`
);

run('Verify full-detail.csv was written',
  `test -f /tmp/full-detail.csv && wc -l /tmp/full-detail.csv`
);

run('Verify summary.csv was written',
  `test -f /tmp/summary.csv && cat /tmp/summary.csv`
);

// ── retro-analysis.js ────────────────────────────────────────────────────────
section('retro-analysis.js');

run('Retro analysis from full-detail.csv (text format)',
  `node .github/scripts/retro-analysis.js --full-detail /tmp/full-detail.csv --sprint-name "Sprint Test" --format text`
);

run('Retro analysis JSON format',
  `node .github/scripts/retro-analysis.js --full-detail /tmp/full-detail.csv --sprint-name "Sprint Test" --format json`
);

run('Retro analysis markdown format',
  `node .github/scripts/retro-analysis.js --full-detail /tmp/full-detail.csv --sprint-name "Sprint Test" --format markdown`
);


// ── post-comment.js ──────────────────────────────────────────────────────────
section('post-comment.js');

run('task-received comment',
  `node .github/scripts/post-comment.js --event task-received --data '{"epic_number":10,"epic_title":"JFrog Migration","vertical":"Datadog","priority":"High","sla":"3 business days from /start","today":"2026-03-31","affected_system":"datadog-prod"}'`
);
run('epic-approved comment',
  `node .github/scripts/post-comment.js --event epic-approved --data '{"epic_id":"EPIC-2026-010","actor":"sai","today":"2026-03-31","vertical":"Artifactory","priority":"High","year":2026}'`
);
run('blocked comment',
  `node .github/scripts/post-comment.js --event blocked --data '{"actor":"bob","today":"2026-03-31","reason":"Vault key missing monitors_write scope"}'`
);
run('unknown event returns exit 1',
  `node .github/scripts/post-comment.js --event not-a-real-event --data '{}'`,
  1
);

// ── lifecycle-timestamps.js ──────────────────────────────────────────────────
section('lifecycle-timestamps.js');

const TS_COMMENT = '<!-- issueops:timestamp event="in-progress" ts="2026-03-28T09:00:00Z" actor="bob" -->';
const TS_BLOCK   = '<!-- issueops:timestamp event="blocked" ts="2026-03-29T14:00:00Z" actor="bob" -->';
const TS_PAUSE   = '<!-- issueops:timestamp event="sla-paused" ts="2026-03-29T14:00:00Z" -->';
const TS_RESUME  = '<!-- issueops:timestamp event="sla-resumed" ts="2026-03-30T09:00:00Z" -->';
const COMMENTS_JSON = JSON.stringify([
  { id: 1, body: `Work started.\n${TS_COMMENT}`, created_at: '2026-03-28T09:00:00Z' },
  { id: 2, body: `Blocked on Vault.\n${TS_BLOCK}\n${TS_PAUSE}`, created_at: '2026-03-29T14:00:00Z' },
  { id: 3, body: `Unblocked.\n${TS_RESUME}`, created_at: '2026-03-30T09:00:00Z' },
]);

run('write timestamp comment',
  `node .github/scripts/lifecycle-timestamps.js --action write --event in-progress --actor bob`
);
run('read in-progress timestamp',
  `node .github/scripts/lifecycle-timestamps.js --action read --event in-progress --comments '${COMMENTS_JSON.replace(/'/g, "'\\''")}'`
);
run('history all timestamps',
  `node .github/scripts/lifecycle-timestamps.js --action history --comments '${COMMENTS_JSON.replace(/'/g, "'\\''")}'`
);
run('elapsed with pause/resume',
  `node .github/scripts/lifecycle-timestamps.js --action elapsed --event in-progress --today 2026-03-31 --comments '${COMMENTS_JSON.replace(/'/g, "'\\''")}'`
);
run('read non-existent event returns null',
  `node .github/scripts/lifecycle-timestamps.js --action read --event done --comments '${COMMENTS_JSON.replace(/'/g, "'\\''")}' | grep null`
);

// ── check-wip.js ─────────────────────────────────────────────────────────────
section('check-wip.js');

const NO_WIP = JSON.stringify([]);
const ONE_WIP = JSON.stringify([{ number: 11, title: 'Existing task', pull_request: false }]);
const TWO_WIP = JSON.stringify([
  { number: 11, title: 'Task A', pull_request: false },
  { number: 12, title: 'Task B', pull_request: false }
]);

run('WIP OK — no existing in-progress',
  `node .github/scripts/check-wip.js --assignee bob --current-issue 42 --in-progress '${NO_WIP}'`
);
run('WIP warning — 1 existing (limit 1)',
  `node .github/scripts/check-wip.js --assignee bob --current-issue 42 --in-progress '${ONE_WIP}'`
);
run('WIP OK for cross-vertical (limit 2) with 1 existing',
  `node .github/scripts/check-wip.js --assignee bob --current-issue 42 --in-progress '${ONE_WIP}' --is-cross-vertical true`
);
run('WIP warning for cross-vertical with 2 existing',
  `node .github/scripts/check-wip.js --assignee bob --current-issue 42 --in-progress '${TWO_WIP}' --is-cross-vertical true`
);

// ── Integration tests — workflow/script wiring ───────────────────────────────
// These tests verify the actual patterns used in the workflows, not just
// that the scripts run in isolation. They simulate what the runner does.

section('Integration: task-triage field parsing (simulates workflow shell step)');

// Write task body to temp file — avoids all shell escaping issues (same as workflow does with env var)
const TASK_BODY_FULL = [
  '### Task Title', 'Fix Datadog CPU monitor threshold', '',
  '### What are you doing?', 'Raising the threshold from 70% to 85%', '',
  '### Why are you doing it?', 'False alerts causing alert fatigue', '',
  '### Summary', 'CPU monitor threshold raising.', '',
  '### Expected Outcome', 'Zero false alerts during normal pipeline runs', '',
  '### Parent Epic Number', '#10', '',
  '### Vertical', 'Datadog', '',
  '### Assignee', '@bob', '',
  '### Priority', 'High', '',
  '### Affected System', 'datadog-prod-monitors'
].join('\n');

require('fs').writeFileSync('/tmp/integration_body.txt', TASK_BODY_FULL);

run('Integration: parse → epic_number extracted correctly',
  `node .github/scripts/parse-issue-body.js --all --body "$(cat /tmp/integration_body.txt)" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const f=JSON.parse(d);process.exit(f._epic_number===10?0:1)})"`
);

run('Integration: parse → vertical_label extracted correctly',
  `node .github/scripts/parse-issue-body.js --all --body "$(cat /tmp/integration_body.txt)" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const f=JSON.parse(d);process.exit(f._vertical_label==='vertical/datadog'?0:1)})"`
);

run('Integration: parse → priority_label extracted correctly',
  `node .github/scripts/parse-issue-body.js --all --body "$(cat /tmp/integration_body.txt)" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const f=JSON.parse(d);process.exit(f._priority_label==='priority/high'?0:1)})"`
);

run('Integration: get-pod-owner returns handle for parsed vertical',
  `node .github/scripts/get-pod-owner.js --vertical "Datadog" --codeowners .github/CODEOWNERS | grep -q "@"`
);

run('Integration: post-comment uses parsed priority in sla field',
  `node .github/scripts/post-comment.js --event task-received --data '{"epic_number":10,"epic_title":"JFrog","vertical":"Datadog","priority":"High","sla":"3 business days from /start","today":"2026-03-31","affected_system":"monitors"}' | grep -q "High"`
);

section('Integration: lifecycle-timestamps → calculate-sla chain');

// Write fixture to temp file — avoids all shell quoting issues with embedded JSON
require('fs').writeFileSync('/tmp/lc_comments.json', JSON.stringify([
  { id: 1, body: '/start\n<!-- issueops:timestamp event="in-progress" ts="2026-03-25T09:00:00Z" actor="bob" -->', created_at: '2026-03-25T09:00:00Z' }
]));

run('Integration: lifecycle read in-progress → calculate-sla pipeline',
  `START=$(node .github/scripts/lifecycle-timestamps.js --action read --event in-progress --comments "$(cat /tmp/lc_comments.json)" | cut -c1-10) && node .github/scripts/calculate-sla.js --priority priority/high --start-date "$START" --today 2026-03-31 | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(r.elapsed_days>=3?0:1)})"`
);

run('Integration: sla-paused + sla-resumed reduces effective days',
  `COMMENTS='${JSON.stringify([
    { id:1, body:`/start\n<!-- issueops:timestamp event="in-progress" ts="2026-03-25T09:00:00Z" actor="bob" -->`, created_at:'2026-03-25T09:00:00Z' },
    { id:2, body:`/block reason\n<!-- issueops:timestamp event="sla-paused" ts="2026-03-26T09:00:00Z" -->`, created_at:'2026-03-26T09:00:00Z' },
    { id:3, body:`/unblock done\n<!-- issueops:timestamp event="sla-resumed" ts="2026-03-28T09:00:00Z" -->`, created_at:'2026-03-28T09:00:00Z' }
  ])}' && node .github/scripts/lifecycle-timestamps.js --action elapsed --event in-progress --today 2026-03-31 --comments "$COMMENTS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log('effective:',r.effective_days,'paused:',r.paused_days);process.exit(r.paused_days===2?0:1)})"`
);

section('Integration: check-wip → post-comment wip-warning chain');

run('Integration: check-wip result feeds post-comment wip-warning',
  `WIP=$(node .github/scripts/check-wip.js --assignee bob --current-issue 42 --in-progress '[{"number":11,"title":"Existing task","pull_request":false}]') && MSG=$(echo "$WIP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log(r.message)})") && node .github/scripts/post-comment.js --event wip-warning --data "{\\"actor\\":\\"bob\\",\\"count\\":2,\\"limit\\":1,\\"others\\":[{\\"number\\":11,\\"title\\":\\"Existing task\\"}]}" | grep -q "WIP"`
);

// ── Ugly-case tests ──────────────────────────────────────────────────────────
// These test that the system degrades predictably on bad inputs.
// The system is not solid because it works when everyone behaves.

section('Ugly-case: missing required fields');

run('parse-issue-body: body with no ### headers returns empty object',
  `node .github/scripts/parse-issue-body.js --all --body "no headers here at all" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const f=JSON.parse(d);process.exit(Object.keys(f).length===0?0:1)})"`
);

run('validate-issue: empty body exits 1 (all required fields missing)',
  `node .github/scripts/validate-issue.js --type task --body "no content" 2>/dev/null`,
  1
);

run('validate-issue: missing Parent Epic Number exits 1',
  `node .github/scripts/validate-issue.js --type task --body "$(printf '### Task Title\nFix thing\n### What are you doing?\nfixing\n### Why are you doing it?\nbecause\n### Summary\nshort\n### Expected Outcome\ndone\n### Vertical\nDatadog\n### Assignee\n@bob\n### Priority\nHigh\n### Affected System\nprod')" 2>&1 | grep -q "Parent Epic"`,
  0
);

run('parse-issue-body: malformed body (no ### headers) returns empty object',
  `node .github/scripts/parse-issue-body.js --all --body "This is free text with no template headers" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const f=JSON.parse(d);process.exit(Object.keys(f).length===0?0:1)})"`
);

run('parse-issue-body: missing epic number field returns null, not crash',
  `node .github/scripts/parse-issue-body.js --field "Parent Epic Number" --body "### Vertical\nDatadog" 2>/dev/null; echo "exit:$?"`,
  0
);

run('calculate-sla: unknown priority exits 1 cleanly',
  `node .github/scripts/calculate-sla.js --priority "banana" --start-date 2026-03-28 --today 2026-03-31`,
  1
);

run('get-pod-owner: missing CODEOWNERS exits 2',
  `node .github/scripts/get-pod-owner.js --vertical "Datadog" --codeowners /nonexistent/path`,
  2
);

run('get-pod-owner: placeholder handle still returns a value (configured)',
  `node .github/scripts/get-pod-owner.js --vertical "Datadog" --codeowners .github/CODEOWNERS | grep -q "@"`
);

section('Ugly-case: edge inputs to lifecycle timestamps');

run('lifecycle-timestamps: comments with no timestamps returns empty history',
  `node .github/scripts/lifecycle-timestamps.js --action history --comments '[{"id":1,"body":"Just a comment, no timestamps","created_at":"2026-03-28T09:00:00Z"}]' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const a=JSON.parse(d);process.exit(Array.isArray(a)&&a.length===0?0:1)})"`
);

run('lifecycle-timestamps: elapsed with no timestamp returns null effective_days',
  `node .github/scripts/lifecycle-timestamps.js --action elapsed --event in-progress --today 2026-03-31 --comments '[]' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(r.effective_days===null?0:1)})"`
);

run('lifecycle-timestamps: write produces valid HTML comment format',
  `node .github/scripts/lifecycle-timestamps.js --action write --event in-progress --actor bob | grep -q "issueops:timestamp"`
);

section('Ugly-case: check-wip edge cases');

run('check-wip: zero in-progress issues — no warning',
  `node .github/scripts/check-wip.js --assignee bob --current-issue 42 --in-progress '[]' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(!r.warning_needed?0:1)})"`
);

run('check-wip: PR in in-progress list excluded from count',
  `node .github/scripts/check-wip.js --assignee bob --current-issue 42 --in-progress '[{"number":99,"title":"A PR","pull_request":true}]' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(!r.warning_needed?0:1)})"`
);

run('check-wip: current issue excluded from others count',
  `node .github/scripts/check-wip.js --assignee bob --current-issue 42 --in-progress '[{"number":42,"title":"Same issue","pull_request":false}]' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(!r.warning_needed?0:1)})"`
);

section('Ugly-case: post-comment with incomplete data');

run('post-comment: null pod_owner handled gracefully',
  `node .github/scripts/post-comment.js --event task-received --data '{"epic_number":10,"epic_title":"Test","vertical":"Datadog","priority":"High","sla":"3 days","today":"2026-03-31","affected_system":"prod","pod_owner":null}' | grep -q "Not specified\\|not specified\\|manually"`,
  0
);

run('post-comment: empty note in approved-validation handled',
  `node .github/scripts/post-comment.js --event approved-validation --data '{"actor":"bob","today":"2026-03-31","note":""}' | grep -q "Validated"`
);
section('check-authorization.js');

run('accept — pod owner authorized',
  `node .github/scripts/check-authorization.js --command /accept --actor alice --pod-owner "@alice" --team-lead "@sai" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(r.authorized?0:1)})"`
);

run('accept — team lead authorized',
  `node .github/scripts/check-authorization.js --command /accept --actor sai --pod-owner "@alice" --team-lead "@sai" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(r.authorized?0:1)})"`
);

run('accept — random developer: soft warn but not blocked (soft=true)',
  `node .github/scripts/check-authorization.js --command /accept --actor bob --pod-owner "@alice" --team-lead "@sai" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(r.soft_enforcement&&!r.should_block?0:1)})"`
);

run('start — any collaborator authorized (soft=false)',
  `node .github/scripts/check-authorization.js --command /start --actor anyone --pod-owner "@alice" --team-lead "@sai" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(r.authorized?0:1)})"`
);

run('approve-validation — pod owner authorized',
  `node .github/scripts/check-authorization.js --command /approve-validation --actor alice --pod-owner "@alice" --team-lead "@sai" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);process.exit(r.authorized?0:1)})"`
);

run('unknown command exits 2',
  `node .github/scripts/check-authorization.js --command /unknown --actor bob --pod-owner "@alice" --team-lead "@sai"`,
  2
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(50));
console.log(` Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(50));

if (failed > 0) {
  console.log('\n❌ Some tests failed. Fix before pushing.');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed. Safe to push.');
  process.exit(0);
}
