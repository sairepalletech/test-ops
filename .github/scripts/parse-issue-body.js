#!/usr/bin/env node
/**
 * parse-issue-body.js
 *
 * Parses structured fields from a GitHub Issue template body.
 * Used by workflows to reliably extract field values without regex guesswork.
 *
 * Usage:
 *   node parse-issue-body.js --body "$(cat body.txt)" --field "Parent Epic Number"
 *   node parse-issue-body.js --body "$(cat body.txt)" --all
 *
 * Output:
 *   Single field: prints the value to stdout
 *   All fields:   prints JSON object to stdout
 *
 * Exit codes:
 *   0 = success
 *   1 = field not found
 *   2 = invalid arguments
 */

'use strict';

const args = process.argv.slice(2);

function usage() {
  console.error('Usage: node parse-issue-body.js --body "<text>" [--field "<name>" | --all]');
  process.exit(2);
}

// Parse CLI args
let body = null;
let fieldName = null;
let allFields = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--body') body = args[++i];
  else if (args[i] === '--field') fieldName = args[++i];
  else if (args[i] === '--all') allFields = true;
}

if (!body) usage();
if (!fieldName && !allFields) usage();

/**
 * Parse all ### Heading\nValue pairs from an issue body.
 * Handles both single-line inputs and textarea blocks.
 */
function parseAllFields(text) {
  const fields = {};
  // Match ### Field Name\n\nValue (with optional blank line after heading)
  const pattern = /###\s+(.+?)\s*\n+([\s\S]+?)(?=\n###|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    // Skip placeholder text and markdown hints
    if (value && !value.startsWith('_No response_') && value !== '') {
      fields[key] = value;
    }
  }
  return fields;
}

/**
 * Extract a single field value by name.
 */
function getField(text, name) {
  const fields = parseAllFields(text);
  // Exact match first
  if (fields[name] !== undefined) return fields[name];
  // Case-insensitive fallback
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(fields)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

/**
 * Extract Epic number from a field value like "#10", "10", "#10 some text"
 */
function extractEpicNumber(value) {
  if (!value) return null;
  const match = value.match(/#?(\d+)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Extract vertical label from vertical field value
 */
function verticalToLabel(value) {
  const map = {
    'Datadog':           'vertical/datadog',
    'Artifactory':       'vertical/artifactory',
    'GitHub Platform':   'vertical/github-platform',
    'JIRA & Wiki':       'vertical/jira-wiki',
    'TFE':               'vertical/tfe',
    'GitLab Pipelines':  'vertical/gitlab-pipelines',
    'Cross-vertical':    'vertical/cross',
  };
  if (!value) return null;
  for (const [k, v] of Object.entries(map)) {
    if (value.includes(k)) return v;
  }
  return null;
}

/**
 * Extract priority label from priority field value
 */
function priorityToLabel(value) {
  const map = {
    'Critical': 'priority/critical',
    'High':     'priority/high',
    'Medium':   'priority/medium',
    'Low':      'priority/low',
  };
  if (!value) return null;
  for (const [k, v] of Object.entries(map)) {
    if (value.includes(k)) return v;
  }
  return null;
}

// Execute
if (allFields) {
  const fields = parseAllFields(body);

  // Enrich with computed fields
  if (fields['Parent Epic Number']) {
    fields['_epic_number'] = extractEpicNumber(fields['Parent Epic Number']);
  }
  if (fields['Vertical']) {
    fields['_vertical_label'] = verticalToLabel(fields['Vertical']);
  }
  if (fields['Priority']) {
    fields['_priority_label'] = priorityToLabel(fields['Priority']);
  }
  if (fields['Epic Owner']) {
    // Normalize handle — strip @ prefix for API calls
    fields['_epic_owner_handle'] = fields['Epic Owner'].replace('@', '').trim();
  }

  console.log(JSON.stringify(fields, null, 2));
  process.exit(0);
}

if (fieldName) {
  const value = getField(body, fieldName);
  if (value === null) {
    console.error(`Field not found: "${fieldName}"`);
    process.exit(1);
  }

  // Special computed outputs
  if (fieldName === 'Parent Epic Number') {
    const num = extractEpicNumber(value);
    console.log(num !== null ? num : value);
  } else if (fieldName === 'Vertical') {
    const label = verticalToLabel(value);
    console.log(label || value);
  } else if (fieldName === 'Priority') {
    const label = priorityToLabel(value);
    console.log(label || value);
  } else {
    console.log(value);
  }
  process.exit(0);
}
