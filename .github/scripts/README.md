# .github/scripts — IssueOps Helper Scripts

These Node.js scripts are the utility layer shared by GitHub Actions workflows
and Copilot skills. They handle field parsing, SLA calculation, CSV generation,
and validation — logic that would be repeated or hard to test inline in workflow YAML.

---

## Why scripts instead of inline workflow JavaScript?

Inline `actions/github-script` code is hard to unit test, hard to version separately,
and becomes unreadable beyond ~50 lines. These scripts can be:

- Tested locally with `node script.js --args`
- Imported by other scripts
- Linted independently
- Run by Copilot CLI skills without triggering a GitHub Actions workflow

---

## Scripts

### `parse-issue-body.js`

Extracts field values from a GitHub Issue template body. Handles the
`### Field Name\n\nValue` format that all three templates produce.

```bash
# Get a single field
node .github/scripts/parse-issue-body.js \
  --body "$(gh issue view 42 --json body -q .body)" \
  --field "Parent Epic Number"
# Output: 10

# Get all fields as JSON
node .github/scripts/parse-issue-body.js \
  --body "$(gh issue view 42 --json body -q .body)" \
  --all
```

Computed fields automatically added:
- `_epic_number` — integer extracted from Parent Epic Number
- `_vertical_label` — e.g. `vertical/datadog` from "Datadog"
- `_priority_label` — e.g. `priority/high` from "High"
- `_epic_owner_handle` — GitHub handle without @

---

### `calculate-sla.js`

Calculates SLA status for an issue given its priority and start date.

```bash
node .github/scripts/calculate-sla.js \
  --priority priority/high \
  --start-date 2026-03-28 \
  --today 2026-03-31

# Output:
# {
#   "priority": "high",
#   "threshold_days": 3,
#   "elapsed_days": 3,
#   "days_until_breach": 0,
#   "at_risk": true,
#   "breached": false,
#   "status": "at-risk"
# }

# With paused SLA (has-dependency label present)
node .github/scripts/calculate-sla.js \
  --priority priority/high \
  --start-date 2026-03-28 \
  --today 2026-03-31 \
  --paused
```

Statuses:
- `on-track` — within SLA window
- `at-risk` — past 75% of threshold
- `breached` — exceeded threshold
- `paused` — has-dependency label present, clock stopped

---

### `get-pod-owner.js`

Reads CODEOWNERS and returns the pod owner handle for a vertical.

```bash
# Get owner for one vertical
node .github/scripts/get-pod-owner.js --vertical "Datadog"
# Output: @alice

# Get all owners
node .github/scripts/get-pod-owner.js --all
# Output: JSON map of vertical -> { handle, label, configured }

# Custom CODEOWNERS path
node .github/scripts/get-pod-owner.js \
  --vertical "TFE" \
  --codeowners /path/to/CODEOWNERS
```

---

### `validate-issue.js`

Validates that an issue body contains all required fields for its type.

```bash
# Validate a task issue
node .github/scripts/validate-issue.js \
  --type task \
  --body "$(gh issue view 42 --json body -q .body)"

# Validate an epic issue
node .github/scripts/validate-issue.js \
  --type epic \
  --body "$(gh issue view 10 --json body -q .body)"
```

Exit code 0 = valid, 1 = validation failed, 2 = bad arguments.
Output is JSON with `valid`, `missing_fields`, `invalid_fields`, `errors`.

---

### `generate-digest.js`

Generates `full-detail.csv` and `summary.csv` from a JSON file of GitHub issues.
Used by the daily-digest workflow but also runnable locally for testing.

```bash
# Fetch issues and generate digest locally
gh issue list --json number,title,labels,assignees,createdAt,updatedAt,body,url \
  --state open --limit 200 > /tmp/issues.json

node .github/scripts/generate-digest.js \
  --issues /tmp/issues.json \
  --output-dir /tmp \
  --date 2026-03-31

# Dry run — shows what would be written without writing files
node .github/scripts/generate-digest.js \
  --issues /tmp/issues.json \
  --output-dir /tmp \
  --dry-run
```

Output files:
- `full-detail.csv` — one row per open issue with all SLA data
- `summary.csv` — five-number summary for standup digest
- `label-changes.json` — which issues need status/overdue applied or removed

---

### `generate-epic-id.js`

Generates the Epic ID string from an issue number.

```bash
node .github/scripts/generate-epic-id.js --issue-number 10
# Output: EPIC-2026-010

node .github/scripts/generate-epic-id.js --issue-number 10 --year 2025
# Output: EPIC-2025-010
```

---

## Running scripts locally (useful for testing)

```bash
# Install no dependencies needed — pure Node.js built-ins only

# Test parse-issue-body against a live issue
gh issue view 42 --json body -q .body | \
  node .github/scripts/parse-issue-body.js --body "$(cat)" --all

# Test SLA calculation
node .github/scripts/calculate-sla.js \
  --priority priority/critical \
  --start-date $(date -d "2 days ago" +%Y-%m-%d) \
  --today $(date +%Y-%m-%d)

# Validate a specific issue
node .github/scripts/validate-issue.js \
  --type task \
  --body "$(gh issue view 42 --json body -q .body)"

# Get all pod owners
node .github/scripts/get-pod-owner.js --all
```

---

## Dependencies

**None.** All scripts use only Node.js built-in modules (`fs`, `path`).
No `npm install` required. They work anywhere Node.js 16+ is available,
including GitHub Actions `ubuntu-latest` runners.
