#!/usr/bin/env node
/**
 * validate-issue.js
 *
 * Validates that a GitHub issue body contains all required fields
 * for a given issue type (epic or task). Used as a pre-check step
 * in triage workflows to catch incomplete submissions early.
 *
 * Usage:
 *   node validate-issue.js --type epic --body "$(cat body.txt)"
 *   node validate-issue.js --type task --body "$(cat body.txt)"
 *
 * Output:
 *   JSON with validation result:
 *   {
 *     valid: true/false,
 *     type: "epic" | "task",
 *     missing_fields: [],
 *     found_fields: {},
 *     errors: []
 *   }
 *
 * Exit codes:
 *   0 = valid
 *   1 = validation failed (missing required fields)
 *   2 = invalid arguments
 */

'use strict';

const args = process.argv.slice(2);

function usage() {
  console.error('Usage: node validate-issue.js --type <epic|task|bug> --body "<text>"');
  process.exit(2);
}

let issueType = null;
let body = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type') issueType = args[++i];
  else if (args[i] === '--body') body = args[++i];
}

if (!issueType || !body) usage();

// Required fields per issue type
const REQUIRED_FIELDS = {
  epic: [
    'Epic Title',
    'What is this Epic about?',
    'Why does this matter?',
    'Business Sponsor',
    'OKR Alignment',
    'Success Criteria',
    'Epic Owner',
    'Vertical',
    'Estimated Effort',
    'Priority',
  ],
  task: [
    'Task Title',
    'What are you doing?',
    'Why are you doing it?',
    'Summary',
    'Expected Outcome',
    'Parent Epic Number',
    'Vertical',
    'Priority',
    'Affected System',
  ],
  bug: [
    'Bug Title',
    'What is happening?',
    'What should happen?',
    'Steps to reproduce',
    'Vertical',
    'Priority',
    'Affected System',
  ],
};

// Valid values per field
const VALID_VALUES = {
  Vertical: [
    'Datadog', 'Artifactory', 'GitHub Platform',
    'JIRA & Wiki', 'TFE', 'GitLab Pipelines', 'Cross-vertical'
  ],
  Priority: ['Critical', 'High', 'Medium', 'Low'],
  'Estimated Effort': [
    'Small (1-2 tasks, fits in one sprint)',
    'Medium (3-5 tasks, fits in one sprint)',
    'Large (6-10 tasks, spans two sprints)',
    'XL (10+ tasks, spans multiple sprints)',
    'Small', 'Medium', 'Large', 'XL',
  ],
};

if (!REQUIRED_FIELDS[issueType]) {
  console.error(`Unknown issue type: "${issueType}". Valid: epic, task, bug`);
  process.exit(2);
}

/**
 * Extract all field values from the issue body
 */
function parseFields(text) {
  const fields = {};
  const pattern = /###\s+(.+?)\s*\n+([\s\S]+?)(?=\n###|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (value && value !== '_No response_') {
      fields[key] = value;
    }
  }
  return fields;
}

/**
 * Check if a field value is valid
 */
function validateValue(fieldName, value) {
  const validSet = VALID_VALUES[fieldName];
  if (!validSet) return true; // No validation constraint
  return validSet.some(v => value.includes(v));
}

// Run validation
const required = REQUIRED_FIELDS[issueType];
const foundFields = parseFields(body);
const missingFields = [];
const invalidFields = [];
const errors = [];

for (const field of required) {
  // Try exact match and case-insensitive match
  const found = foundFields[field]
    || Object.entries(foundFields).find(([k]) => k.toLowerCase() === field.toLowerCase())?.[1];

  if (!found || found.trim() === '') {
    missingFields.push(field);
  } else if (!validateValue(field, found)) {
    invalidFields.push({
      field,
      value: found,
      valid_values: VALID_VALUES[field],
    });
  }
}

// Additional validation for specific fields
if (foundFields['Parent Epic Number']) {
  const epicVal = foundFields['Parent Epic Number'];
  const hasNumber = /\d+/.test(epicVal);
  if (!hasNumber) {
    errors.push('Parent Epic Number must contain a valid issue number (e.g. #10 or 10)');
  }
}

if (foundFields['Epic Owner']) {
  const ownerVal = foundFields['Epic Owner'];
  if (!ownerVal.startsWith('@') && !/^[a-zA-Z0-9-]+$/.test(ownerVal)) {
    errors.push('Epic Owner should be a GitHub handle (e.g. @username)');
  }
}

if (foundFields['Documentation Link']) {
  const linkVal = foundFields['Documentation Link'];
  if (linkVal && !linkVal.startsWith('http') && linkVal !== 'N/A') {
    errors.push('Documentation Link should be a valid URL starting with http');
  }
}

const valid = missingFields.length === 0 && invalidFields.length === 0 && errors.length === 0;

const result = {
  valid,
  type: issueType,
  missing_fields: missingFields,
  invalid_fields: invalidFields,
  errors,
  found_fields: foundFields,
  field_count: {
    required: required.length,
    found: required.length - missingFields.length,
    missing: missingFields.length,
  }
};

console.log(JSON.stringify(result, null, 2));

if (!valid) {
  if (missingFields.length > 0) {
    process.stderr.write(`Missing required fields: ${missingFields.join(', ')}\n`);
  }
  if (invalidFields.length > 0) {
    process.stderr.write(`Invalid field values: ${invalidFields.map(f => f.field).join(', ')}\n`);
  }
  if (errors.length > 0) {
    process.stderr.write(`Validation errors: ${errors.join('; ')}\n`);
  }
  process.exit(1);
}

process.exit(0);
