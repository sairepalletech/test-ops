#!/usr/bin/env node
/**
 * generate-epic-id.js
 *
 * Generates a consistent Epic ID in the format EPIC-YYYY-NNN
 * where YYYY is the current year and NNN is the zero-padded issue number.
 *
 * Usage:
 *   node generate-epic-id.js --issue-number 10
 *   node generate-epic-id.js --issue-number 10 --year 2026
 *
 * Output:
 *   EPIC-2026-010
 */

'use strict';

const args = process.argv.slice(2);

let issueNumber = null;
let year = new Date().getFullYear();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--issue-number') issueNumber = parseInt(args[++i]);
  else if (args[i] === '--year') year = parseInt(args[++i]);
}

if (!issueNumber || isNaN(issueNumber)) {
  console.error('Usage: node generate-epic-id.js --issue-number <N> [--year <YYYY>]');
  process.exit(2);
}

const epicId = `EPIC-${year}-${String(issueNumber).padStart(3, '0')}`;
console.log(epicId);
process.exit(0);
