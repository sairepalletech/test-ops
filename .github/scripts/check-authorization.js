#!/usr/bin/env node
/**
 * check-authorization.js
 *
 * Defines which commands require which roles, and validates
 * whether a given actor is authorized to run a command.
 *
 * This is the single source of truth for command authorization.
 * task-triage.yml calls this before executing any command.
 *
 * Usage:
 *   node check-authorization.js \
 *     --command /accept \
 *     --actor bob \
 *     --pod-owner "@alice" \
 *     --team-lead "@sai" \
 *     --is-assignee true
 *
 * Output: JSON
 *   {
 *     "command": "/accept",
 *     "actor": "bob",
 *     "authorized": true,
 *     "required_role": "pod-owner",
 *     "reason": "Actor is the pod owner for this vertical"
 *   }
 *
 * Exit codes:
 *   0 = authorized
 *   1 = not authorized
 *   2 = unknown command or bad args
 *
 * Authorization model:
 *   write-access   — checked by GitHub API (epic commands)
 *   pod-owner      — must match CODEOWNERS pod owner OR team lead
 *   team-lead      — must match the * owner in CODEOWNERS
 *   developer      — any collaborator (assignee or anyone posting)
 *   assignee       — must be the current assignee of the issue
 *
 * Design note: task commands are "social model" — not hard API locks.
 * Any collaborator can technically post any command. The authorization
 * check here adds a structured warning and documents who *should* act.
 * Hard enforcement would require organization membership checks which
 * add latency and complexity for limited benefit on a 15-person team.
 */

'use strict';

const args = process.argv.slice(2);

let command = null;
let actor = null;
let podOwner = null;
let teamLead = null;
let isAssignee = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--command')    command   = args[++i];
  if (args[i] === '--actor')      actor     = args[++i];
  if (args[i] === '--pod-owner')  podOwner  = args[++i];
  if (args[i] === '--team-lead')  teamLead  = args[++i];
  if (args[i] === '--is-assignee') isAssignee = args[++i] === 'true';
}

if (!command || !actor) {
  console.error('Usage: node check-authorization.js --command /accept --actor <handle> [--pod-owner @handle] [--team-lead @handle] [--is-assignee true]');
  process.exit(2);
}

// Normalize handles — strip @ for comparison
const normalize = h => (h || '').replace('@', '').toLowerCase().trim();

const actorN     = normalize(actor);
const podOwnerN  = normalize(podOwner);
const teamLeadN  = normalize(teamLead);

// ── Authorization rules ───────────────────────────────────────────────────

const RULES = {
  // Triage gate commands — pod owner or team lead
  '/accept': {
    required_role: 'pod-owner-or-team-lead',
    description: 'Accept a task into the backlog',
    check: () => actorN === podOwnerN || actorN === teamLeadN,
    reason_pass: 'Actor is the pod owner or team lead',
    reason_fail: `Only the pod owner (${podOwner || 'not configured'}) or team lead (${teamLead || 'not configured'}) may accept tasks`,
    soft: true  // warn but do not block — social model
  },
  '/defer': {
    required_role: 'pod-owner-or-team-lead',
    description: 'Defer a task to a future sprint',
    check: () => actorN === podOwnerN || actorN === teamLeadN,
    reason_pass: 'Actor is the pod owner or team lead',
    reason_fail: `Only the pod owner (${podOwner || 'not configured'}) or team lead (${teamLead || 'not configured'}) may defer tasks`,
    soft: true
  },
  '/duplicate': {
    required_role: 'pod-owner-or-team-lead',
    description: 'Mark as duplicate',
    check: () => actorN === podOwnerN || actorN === teamLeadN,
    reason_pass: 'Actor is the pod owner or team lead',
    reason_fail: `Only the pod owner or team lead may mark duplicates`,
    soft: true
  },
  '/reject': {
    required_role: 'pod-owner-or-team-lead',
    description: 'Reject a task',
    check: () => actorN === podOwnerN || actorN === teamLeadN,
    reason_pass: 'Actor is the pod owner or team lead',
    reason_fail: `Only the pod owner (${podOwner || 'not configured'}) or team lead (${teamLead || 'not configured'}) may reject tasks`,
    soft: true
  },

  // Execution commands — any collaborator (developer self-service)
  '/start': {
    required_role: 'any-collaborator',
    description: 'Start working on a task',
    check: () => true,
    reason_pass: 'Any collaborator may start work',
    reason_fail: '',
    soft: false
  },
  '/block': {
    required_role: 'any-collaborator',
    description: 'Mark as blocked',
    check: () => true,
    reason_pass: 'Any collaborator may report a blocker',
    reason_fail: '',
    soft: false
  },
  '/unblock': {
    required_role: 'any-collaborator',
    description: 'Clear a blocker',
    check: () => true,
    reason_pass: 'Any collaborator may resolve a blocker',
    reason_fail: '',
    soft: false
  },
  '/validate': {
    required_role: 'any-collaborator',
    description: 'Submit for validation',
    check: () => true,
    reason_pass: 'Any collaborator may submit for validation',
    reason_fail: '',
    soft: false
  },
  '/depends-on': {
    required_role: 'any-collaborator',
    description: 'Register a dependency',
    check: () => true,
    reason_pass: 'Any collaborator may register a dependency',
    reason_fail: '',
    soft: false
  },
  '/update': {
    required_role: 'any-collaborator',
    description: 'Post a timeline update (Critical issues)',
    check: () => true,
    reason_pass: 'Any collaborator may post timeline updates',
    reason_fail: '',
    soft: false
  },

  // Validation commands — pod owner or team lead
  '/approve-validation': {
    required_role: 'pod-owner-or-team-lead',
    description: 'Approve validation and close task',
    check: () => actorN === podOwnerN || actorN === teamLeadN,
    reason_pass: 'Actor is the pod owner or team lead',
    reason_fail: `Only the pod owner (${podOwner || 'not configured'}) or team lead (${teamLead || 'not configured'}) may approve validation`,
    soft: true
  },
  '/feedback': {
    required_role: 'pod-owner-or-team-lead',
    description: 'Return with feedback gaps',
    check: () => actorN === podOwnerN || actorN === teamLeadN,
    reason_pass: 'Actor is the pod owner or team lead',
    reason_fail: `Only the pod owner or team lead may give validation feedback`,
    soft: true
  },
  '/reject-validation': {
    required_role: 'pod-owner-or-team-lead',
    description: 'Reject validation',
    check: () => actorN === podOwnerN || actorN === teamLeadN,
    reason_pass: 'Actor is the pod owner or team lead',
    reason_fail: `Only the pod owner (${podOwner || 'not configured'}) or team lead (${teamLead || 'not configured'}) may reject validation`,
    soft: true
  },
};

// Normalize command — strip args
const cmd = command.trim().split(/\s+/)[0].toLowerCase();
const rule = RULES[cmd];

if (!rule) {
  console.error(`Unknown command: "${cmd}"`);
  console.error(`Known commands: ${Object.keys(RULES).join(', ')}`);
  process.exit(2);
}

const authorized = rule.check();
const result = {
  command: cmd,
  actor,
  authorized,
  required_role: rule.required_role,
  soft_enforcement: rule.soft,
  reason: authorized ? rule.reason_pass : rule.reason_fail,
  // soft=true: warn but don't block (social model for pod owners)
  // soft=false: any-collaborator commands, always pass
  should_block: !authorized && !rule.soft,
  warning_message: (!authorized && rule.soft)
    ? `⚠️ Role check: @${actor} — ${rule.reason_fail}. Proceeding because enforcement is advisory on this team size.`
    : null
};

console.log(JSON.stringify(result, null, 2));
process.exit(authorized ? 0 : (rule.soft ? 0 : 1));
