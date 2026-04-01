#!/usr/bin/env node
/**
 * lifecycle-timestamps.js
 *
 * Reads and writes real lifecycle timestamps from issue comment history.
 * This replaces the unreliable updated_at proxy for SLA tracking.
 *
 * The source of truth for "when did this issue enter state X" is a structured
 * timestamp comment posted by workflows. This script reads those comments
 * and extracts the real transition times.
 *
 * Comment format written by workflows:
 *   <!-- issueops:timestamp event="in-progress" ts="2026-03-31T09:00:00Z" actor="bob" -->
 *
 * Usage:
 *   node lifecycle-timestamps.js --action read --comments '[...]' --event in-progress
 *   node lifecycle-timestamps.js --action write --event in-progress --actor bob
 *   node lifecycle-timestamps.js --action history --comments '[...]'
 *
 * Actions:
 *   read      Extract the most recent timestamp for a specific event
 *   history   Return full lifecycle history as JSON array
 *   write     Generate the HTML comment string to embed in a workflow comment
 *             (caller includes it in the comment body — invisible to humans)
 *   elapsed   Calculate days elapsed since the most recent event timestamp
 *
 * Output:
 *   read:     ISO timestamp string or "null"
 *   history:  JSON array of { event, ts, actor }
 *   write:    HTML comment string to embed
 *   elapsed:  JSON { event, started_at, days_elapsed, business_days_elapsed }
 */

'use strict';

const args = process.argv.slice(2);

let action = null;
let commentsJson = '[]';
let event = null;
let actor = null;
let today = new Date().toISOString();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--action') action = args[++i];
  else if (args[i] === '--comments') commentsJson = args[++i];
  else if (args[i] === '--event') event = args[++i];
  else if (args[i] === '--actor') actor = args[++i];
  else if (args[i] === '--today') today = args[++i] + 'T12:00:00Z';
}

if (!action) {
  console.error('Usage: node lifecycle-timestamps.js --action <read|write|history|elapsed> [options]');
  process.exit(2);
}

// Valid lifecycle events
const VALID_EVENTS = [
  'created', 'review', 'backlog', 'sprint',
  'in-progress', 'blocked', 'unblocked',
  'validation', 'feedback-required', 'done',
  'dependency-registered', 'dependency-resolved',
  'sla-paused', 'sla-resumed',
];

// Regex to extract timestamp comments
const TS_PATTERN = /<!--\s*issueops:timestamp\s+event="([^"]+)"\s+ts="([^"]+)"(?:\s+actor="([^"]+)")?\s*-->/g;

function parseTimestamps(commentsArray) {
  const timestamps = [];
  for (const comment of commentsArray) {
    const body = comment.body || comment;
    let match;
    const pattern = new RegExp(TS_PATTERN.source, 'g');
    while ((match = pattern.exec(body)) !== null) {
      timestamps.push({
        event: match[1],
        ts: match[2],
        actor: match[3] || null,
        comment_id: comment.id || null,
        comment_created_at: comment.created_at || null,
      });
    }
  }
  // Sort by timestamp ascending
  timestamps.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return timestamps;
}

function calendarDays(start, end) {
  return Math.max(0, Math.floor((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)));
}

function businessDays(start, end) {
  let count = 0;
  const current = new Date(start);
  const endDate = new Date(end);
  while (current < endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// ── Actions ──────────────────────────────────────────────────────────────────

if (action === 'write') {
  if (!event) {
    console.error('--event is required for --action write');
    process.exit(2);
  }
  const ts = new Date().toISOString();
  const actorPart = actor ? ` actor="${actor}"` : '';
  console.log(`<!-- issueops:timestamp event="${event}" ts="${ts}"${actorPart} -->`);
  process.exit(0);
}

let comments = [];
try {
  comments = JSON.parse(commentsJson);
  if (!Array.isArray(comments)) comments = [];
} catch (e) {
  console.error(`Invalid JSON in --comments: ${e.message}`);
  process.exit(2);
}

const timestamps = parseTimestamps(comments);

if (action === 'history') {
  console.log(JSON.stringify(timestamps, null, 2));
  process.exit(0);
}

if (action === 'read') {
  if (!event) {
    console.error('--event is required for --action read');
    process.exit(2);
  }
  const matches = timestamps.filter(t => t.event === event);
  if (matches.length === 0) {
    console.log('null');
    process.exit(0);
  }
  // Return most recent
  console.log(matches[matches.length - 1].ts);
  process.exit(0);
}

if (action === 'elapsed') {
  if (!event) {
    console.error('--event is required for --action elapsed');
    process.exit(2);
  }

  // Find all paused periods (sla-paused / sla-resumed pairs)
  let totalPausedDays = 0;
  let pauseStart = null;
  for (const t of timestamps) {
    if (t.event === 'sla-paused') pauseStart = t.ts;
    else if (t.event === 'sla-resumed' && pauseStart) {
      totalPausedDays += calendarDays(pauseStart, t.ts);
      pauseStart = null;
    }
  }
  // If currently paused, count from pause start to today
  if (pauseStart) {
    totalPausedDays += calendarDays(pauseStart, today);
  }

  const matches = timestamps.filter(t => t.event === event);
  if (matches.length === 0) {
    console.log(JSON.stringify({
      event,
      started_at: null,
      days_elapsed: null,
      business_days_elapsed: null,
      paused_days: totalPausedDays,
      effective_days: null,
      error: `No timestamp found for event: ${event}`,
    }));
    process.exit(0);
  }

  const startedAt = matches[matches.length - 1].ts;
  const rawDays = calendarDays(startedAt, today);
  const rawBizDays = businessDays(startedAt, today);
  const effectiveDays = Math.max(0, rawDays - totalPausedDays);
  const effectiveBizDays = Math.max(0, rawBizDays - totalPausedDays);

  console.log(JSON.stringify({
    event,
    started_at: startedAt,
    days_elapsed: rawDays,
    business_days_elapsed: rawBizDays,
    paused_days: totalPausedDays,
    effective_days: effectiveDays,
    effective_business_days: effectiveBizDays,
    currently_paused: pauseStart !== null,
  }, null, 2));
  process.exit(0);
}

console.error(`Unknown action: "${action}". Valid: read, write, history, elapsed`);
process.exit(2);
