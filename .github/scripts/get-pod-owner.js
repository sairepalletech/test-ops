#!/usr/bin/env node
/**
 * get-pod-owner.js
 *
 * Reads the CODEOWNERS file and returns the pod owner GitHub handle
 * for a given CI/CD vertical. Used by task-triage.yml and other workflows
 * to route issues to the correct owner without hardcoding handles.
 *
 * Usage:
 *   node get-pod-owner.js --vertical "Datadog" [--codeowners .github/CODEOWNERS]
 *   node get-pod-owner.js --all [--codeowners .github/CODEOWNERS]
 *
 * Output:
 *   Single vertical: prints the @handle to stdout (e.g. @alice)
 *   --all:           prints JSON map of all vertical -> handle mappings
 *
 * Exit codes:
 *   0 = found
 *   1 = vertical not found in CODEOWNERS
 *   2 = CODEOWNERS file not found or invalid args
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

function usage() {
  console.error('Usage: node get-pod-owner.js --vertical "<name>" [--codeowners <path>]');
  console.error('       node get-pod-owner.js --all [--codeowners <path>]');
  process.exit(2);
}

// Parse args
let vertical = null;
let codeownersPath = '.github/CODEOWNERS';
let allOwners = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--vertical') vertical = args[++i];
  else if (args[i] === '--codeowners') codeownersPath = args[++i];
  else if (args[i] === '--all') allOwners = true;
}

if (!vertical && !allOwners) usage();

// Vertical to CODEOWNERS path mapping
const VERTICAL_PATH_MAP = {
  'Datadog':           'datadog',
  'Artifactory':       'artifactory',
  'GitHub Platform':   'github-platform',
  'JIRA & Wiki':       'jira-wiki',
  'TFE':               'tfe',
  'GitLab Pipelines':  'gitlab-pipelines',
};

// Read CODEOWNERS file
let codeownersContent;
try {
  codeownersContent = fs.readFileSync(codeownersPath, 'utf-8');
} catch (e) {
  // Try relative to repo root
  try {
    const repoRoot = process.cwd();
    codeownersContent = fs.readFileSync(path.join(repoRoot, codeownersPath), 'utf-8');
  } catch (e2) {
    console.error(`Could not read CODEOWNERS at: ${codeownersPath}`);
    console.error('Make sure to run this script from the repository root.');
    process.exit(2);
  }
}

/**
 * Parse a CODEOWNERS file and return a map of path-pattern -> [owners]
 */
function parseCODEOWNERS(content) {
  const result = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const pattern = parts[0];
    const owners = parts.slice(1);
    result[pattern] = owners;
  }
  return result;
}

/**
 * Find the pod owner for a specific vertical from parsed CODEOWNERS
 */
function findOwner(parsed, verticalName) {
  const subpath = VERTICAL_PATH_MAP[verticalName];
  if (!subpath) return null;

  // Look for .github/verticals/<subpath>/
  const targetPattern = `.github/verticals/${subpath}/`;
  for (const [pattern, owners] of Object.entries(parsed)) {
    if (pattern === targetPattern || pattern.includes(`/verticals/${subpath}/`)) {
      return owners[0] || null; // Return first owner
    }
  }
  return null;
}

const parsed = parseCODEOWNERS(codeownersContent);

if (allOwners) {
  const result = {};
  for (const verticalName of Object.keys(VERTICAL_PATH_MAP)) {
    const owner = findOwner(parsed, verticalName);
    result[verticalName] = {
      handle: owner,
      label: `vertical/${VERTICAL_PATH_MAP[verticalName]}`,
      configured: owner !== null,
    };
  }
  // Also show team lead if present
  const allEntry = parsed['*'];
  result['_team_lead'] = allEntry ? allEntry[0] : null;

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (vertical) {
  if (!VERTICAL_PATH_MAP[vertical]) {
    console.error(`Unknown vertical: "${vertical}"`);
    console.error(`Valid verticals: ${Object.keys(VERTICAL_PATH_MAP).join(', ')}`);
    process.exit(2);
  }

  const owner = findOwner(parsed, vertical);
  if (!owner) {
    console.error(`No pod owner found for vertical: "${vertical}"`);
    console.error(`Check that .github/verticals/${VERTICAL_PATH_MAP[vertical]}/ has an entry in CODEOWNERS`);
    process.exit(1);
  }

  console.log(owner);
  process.exit(0);
}
