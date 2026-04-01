# Repair Runbook — CI/CD IssueOps Platform

This runbook is for when something looks wrong. Read the symptom, follow the steps.
If you cannot fix it with these steps, manually correct labels — do not fight the system.

---

## Quick reference: inspection commands

```bash
# Check lifecycle history for any issue
gh issue view N --json comments -q '.comments' | \
  node .github/scripts/lifecycle-timestamps.js --action history --comments "$(cat)"

# Check who the pod owner is for a vertical
node .github/scripts/get-pod-owner.js --vertical "Datadog" --codeowners .github/CODEOWNERS

# Check all pod owners
node .github/scripts/get-pod-owner.js --all --codeowners .github/CODEOWNERS

# Run local test suite to verify scripts are intact
node .github/scripts/test-local.js

# Check SLA status for an issue
node .github/scripts/calculate-sla.js \
  --priority priority/high \
  --start-date 2026-03-28 \
  --today $(date +%Y-%m-%d)

# Run reconcile (dry run — no changes)
# GitHub Actions → Reconcile Issue State → Run workflow → issue_number: N
```

---

## Symptom: Issue is in the wrong column on the board

**Cause:** A workflow-owned status label was manually added, removed, or a workflow failed silently.

**Diagnosis:**
1. Check the issue labels — which `status/*` label is currently applied?
2. Check the comment history — what was the last IssueOps command posted?
3. Run `reconcile-issue.yml` with `dry_run=true` — does it report a discrepancy?

**Fix (option A — use reconcile):**
```
GitHub Actions → Reconcile Issue State → Run workflow
  issue_number: N
  force_status: <correct status>
  dry_run: false
```

**Fix (option B — manual label correction):**
1. Remove the incorrect `status/*` label
2. Apply the correct `status/*` label
3. Post a comment explaining what happened (for audit trail)

---

## Symptom: SLA overdue label is wrong (applied when not breached, or missing when breached)

**Cause:** SLA clock is using `updated_at` as fallback because no lifecycle timestamp was found. This happens for pre-existing issues or issues where the workflow failed during `/start`.

**Diagnosis:**
```bash
# Check if lifecycle timestamp exists for this issue
gh issue view N --json comments -q '.comments' | \
  node .github/scripts/lifecycle-timestamps.js --action read --event in-progress --comments "$(cat)"
# Output: ISO timestamp, or "null"
```

**Fix if null (missing timestamp):**
1. The issue was started before this system was deployed, or the `/start` comment was posted directly without the workflow firing
2. Manually post a timestamp comment on the issue:
```
<!-- issueops:timestamp event="in-progress" ts="<YYYY-MM-DDT09:00:00Z>" actor="<handle>" -->
```
3. Run `daily-digest.yml` manually (`workflow_dispatch`) to recalculate SLA

**Fix if timestamp exists but label is wrong:**
1. Run `daily-digest.yml` manually — it will recalculate and correct the label
2. If the label is manually out of sync, apply/remove `status/overdue` directly

---

## Symptom: Pod owner is not being tagged on new tasks

**Cause:** CODEOWNERS entry is missing, path pattern does not match, or the vertical dropdown value does not match the expected string.

**Diagnosis:**
```bash
node .github/scripts/get-pod-owner.js --all --codeowners .github/CODEOWNERS
```
Expected output includes a `handle` for each vertical. `null` means the entry is missing.

**Fix:**
1. Edit `.github/CODEOWNERS`
2. Ensure the path pattern exactly matches `.github/verticals/<slug>/` — note the trailing slash
3. Ensure the vertical name in the dropdown (in `task.yml`) matches what `get-pod-owner.js` expects

Vertical name to path slug mapping:
```
Datadog           → datadog
Artifactory       → artifactory
GitHub Platform   → github-platform
JIRA & Wiki       → jira-wiki
TFE               → tfe
GitLab Pipelines  → gitlab-pipelines
```

---

## Symptom: `has-dependency` label is present but dependency already closed

**Cause:** `dependency-resolution.yml` fires on issue close and checks for references in the body. If the reference format did not match (e.g., body was edited after `/depends-on` was posted), the notification was missed.

**Fix:**
1. Manually remove the `has-dependency` label
2. Post a timestamp comment to resume the SLA clock:
```
<!-- issueops:timestamp event="sla-resumed" ts="<YYYY-MM-DDT09:00:00Z>" -->
```
3. Optionally post `/unblock` if the issue is blocked for other reasons too

---

## Symptom: Workflow is not firing on issue open

**Cause:** Issue was not created from the template (blank issue), template field parsing failed, or the issue type labels were not applied.

**Diagnosis:**
1. Check the issue labels — does it have `type/task` or `type/epic`?
2. If no type label: the issue was not created from a template. Apply the label manually.
3. Check GitHub Actions for the workflow run — did it fail?

**Fix:**
1. Apply the correct type label manually (`type/task`, `type/epic`, or `type/bug`)
2. The triage workflow will not re-fire — trigger it manually by posting a `/accept` or waiting for the pod owner to triage
3. If the body is missing required fields, edit the issue to add them

---

## Symptom: Issue closed but Epic was not updated

**Cause:** `epic-completion.yml` fires on issue close and looks for a `#N` reference in the issue body. If the `Parent Epic Number` field was missing or malformed, the Epic was not updated.

**Diagnosis:**
```bash
gh issue view N --json body -q '.body' | \
  node .github/scripts/parse-issue-body.js --field "Parent Epic Number" --body "$(cat)"
```

**Fix:**
1. Edit the task issue body to add a valid `Parent Epic Number`
2. Reopen and close the issue to trigger `epic-completion.yml` again
3. Or manually check/close the Epic if all tasks are done

---

## Symptom: test-local.js is failing

**Steps:**
1. Run with `--verbose` flag:
```bash
node .github/scripts/test-local.js --verbose
```
2. Look at which section fails — script issue or test harness issue?
3. If a script has changed its output format, the test fixture needs updating
4. If a script is broken, fix the script

Never push when `test-local.js` has failures.

---

## Symptom: A whole workflow is silently failing

GitHub Actions workflows do not post on the issue by default when they fail — they just show as red in the Actions tab.

**How to detect:**
- Check the Actions tab for workflow runs with red status
- Look at the workflow run logs for the specific step that failed
- Common failures: rate limit hit, GITHUB_TOKEN permissions missing, issue body parse returning empty

**What to do:**
1. Go to Actions → find the failing run → read the logs
2. For transient failures (rate limit, network): re-run the workflow
3. For persistent failures: check if the issue body format changed, or if a script dependency is missing

**Prevention:** Run `test-local.js` before merging any changes to workflows or scripts.

---

## Symptom: The standup digest is posting but the board data looks wrong

**Cause:** Standup reads live label state. If labels drifted, the digest reflects the drift.

**Fix:**
1. Run `reconcile-issue.yml` on any suspicious issues
2. Manually correct label state
3. Re-run `standup-check.yml` via `workflow_dispatch` to post a fresh digest

---

## When to avoid manual label edits

**Do not manually edit these labels:**
- `status/overdue` — managed exclusively by `daily-digest.yml`
- `status/blocked-pending-epic` — managed by `epic-triage.yml`
- `has-dependency` — managed by `task-triage.yml`

**Safe to manually edit:**
- `priority/*` labels — if priority genuinely changed
- `status/backlog`, `status/sprint` — for sprint planning corrections
- `vertical/*` labels — if issue was filed under wrong vertical
- `type/*` labels — if created outside template

---

## Emergency recovery: wipe and reset an issue

If an issue is in a completely broken state and reconcile cannot fix it:

1. Note the current state and intended state
2. Remove ALL `status/*` labels
3. Apply the single correct `status/*` label for the current state
4. Post a comment explaining the manual intervention
5. Include a timestamp comment if the SLA clock needs to be reset:
```
<!-- issueops:timestamp event="in-progress" ts="<YYYY-MM-DDT09:00:00Z>" actor="<handle>" -->
```
6. Run `test-local.js` to verify the scripts are still healthy
