# Label State Authority

This document defines **who owns each label** and **what to do when state drifts**.
Print this. Put it on the wall. If in doubt, refer here.

---

## The Rule

Labels in this repository are divided into two categories:

- **Workflow-owned labels** — applied and removed only by GitHub Actions workflows
- **Human-touchable labels** — safe for humans to apply or change directly

**If you manually change a workflow-owned label, state will drift.**
The system will not break immediately, but reports will be wrong and the
daily digest will calculate incorrect SLA values.

---

## Workflow-Owned Labels — Do Not Touch Manually

| Label | Applied by | Removed by |
|-------|-----------|-----------|
| `status/pending-approval` | `epic-triage.yml` on Epic open | `epic-triage.yml` on `/approve` |
| `status/review` | `task-triage.yml` on task open | `task-triage.yml` on `/accept` or `/defer` |
| `status/blocked-pending-epic` | `task-triage.yml` when Epic pending | `epic-triage.yml` when Epic approved |
| `status/in-progress` | `task-triage.yml` on `/start` | `task-triage.yml` on `/block`, `/validate`, `/reject-validation` |
| `status/blocked` | `task-triage.yml` on `/block` | `task-triage.yml` on `/unblock` |
| `status/feedback-required` | `task-triage.yml` on `/feedback` | `task-triage.yml` on `/validate` |
| `status/validation` | `task-triage.yml` on `/validate` | `task-triage.yml` on `/approve-validation`, `/reject-validation` |
| `status/done` | `task-triage.yml` on `/approve-validation` | Never removed |
| `status/overdue` | `daily-digest.yml` on SLA breach | `daily-digest.yml` when SLA no longer breached |
| `has-dependency` | `task-triage.yml` on `/depends-on` | `dependency-resolution.yml` when dependency closes |
| `epic` | `epic-triage.yml` on `/approve` | Never removed |
| `OKR` | `epic-triage.yml` on `/approve` | Never removed |
| `2026` | `epic-triage.yml` on `/approve` | Never removed |
| `standup-digest` | `standup-check.yml` on issue creation | Never removed |

---

## Human-Touchable Labels — Safe to Apply Directly

| Label | When to apply | Who applies |
|-------|--------------|-------------|
| `type/epic` | Applied by Epic template | Template auto-applies |
| `type/task` | Applied by Task template | Template auto-applies |
| `type/bug` | Applied by Bug template | Template auto-applies |
| `type/request` | Applied manually | Any team member |
| `type/change` | Applied manually | Any team member |
| `priority/critical` | Can be updated if priority changes | Pod owner or team lead |
| `priority/high` | Can be updated if priority changes | Pod owner or team lead |
| `priority/medium` | Can be updated if priority changes | Pod owner or team lead |
| `priority/low` | Can be updated if priority changes | Pod owner or team lead |
| `vertical/*` | Applied by triage workflow but can be corrected | Pod owner or team lead |
| `status/backlog` | Applied by triage on `/accept` — can be re-applied after accidental removal | Pod owner |
| `status/sprint` | Applied at sprint planning — can be applied manually | Team lead |

---

## What Happens When State Drifts

### Symptom: Issue is in wrong board column

**Cause:** A workflow-owned status label was manually removed or applied.

**Fix:** Run the reconcile workflow:
```
GitHub Actions → Reconcile Issue State → Run workflow → Issue number: N
```

Or manually restore the correct label. Check the issue comment history
to determine which state it should be in.

---

### Symptom: SLA calculation is wrong

**Cause:** `updated_at` was touched by a non-status-change action (comment, edit),
or a lifecycle timestamp comment is missing.

**Fix:** The lifecycle timestamps embedded in workflow comments
(`<!-- issueops:timestamp event="in-progress" ts="..." -->`) are the real source
of truth. Run:

```bash
# Check lifecycle history for an issue
gh issue view N --json comments -q '.comments[].body' | \
  node .github/scripts/lifecycle-timestamps.js \
  --action history \
  --comments "$(gh issue view N --json comments -q '.comments')"
```

If timestamps are missing (e.g. issue was created before this system was deployed),
the daily digest will fall back to `updated_at`. This is documented and expected
for pre-existing issues.

---

### Symptom: Issue is open but marked done

**Cause:** `/approve-validation` was posted and issue was closed, then someone
reopened it.

**Fix:** Reopened issues are not automatically handled. Use the reconcile workflow
or manually correct labels and repost the relevant command.

---

### Symptom: has-dependency label present but dependency already closed

**Cause:** `dependency-resolution.yml` missed the issue (body format didn't match
the expected reference pattern).

**Fix:** Manually remove `has-dependency` and post `/unblock` or `/start` as appropriate.
The SLA clock will resume from that point.

---

## The Reconcile Workflow

A dedicated `reconcile-issue.yml` workflow handles state drift.

```
GitHub Actions → Reconcile Issue State → Run workflow
  Input: issue_number (required)
  Input: force_status (optional — override to specific status)
```

The reconcile workflow:
1. Reads the issue's comment history for lifecycle timestamps
2. Reads the current labels
3. Compares what the labels say vs what the history says
4. Reports the discrepancy
5. Optionally corrects to the history-derived state

---

## State Transition Diagram

```
CREATED
  │
  ▼
status/pending-approval   ← Epic only
  │
  ├─ /approve ──────────────────────────────────────────▶ status/backlog
  └─ /reject ──────────────────────────────────────────▶ [CLOSED]

status/review             ← Task only (after triage)
  │
  ├─ /accept ──────────────────────────────────────────▶ status/backlog
  ├─ /defer ───────────────────────────────────────────▶ status/backlog (with note)
  ├─ /duplicate #N ────────────────────────────────────▶ [CLOSED as duplicate]
  └─ /reject ──────────────────────────────────────────▶ [CLOSED]

status/backlog
  │
  └─ sprint planning ──────────────────────────────────▶ status/sprint

status/sprint
  │
  └─ /start ───────────────────────────────────────────▶ status/in-progress

status/in-progress
  │
  ├─ /block ───────────────────────────────────────────▶ status/blocked
  └─ /validate ────────────────────────────────────────▶ status/validation

status/blocked
  │
  └─ /unblock ─────────────────────────────────────────▶ status/in-progress

status/validation
  │
  ├─ /approve-validation ──────────────────────────────▶ status/done → [CLOSED]
  ├─ /feedback ────────────────────────────────────────▶ status/feedback-required
  └─ /reject-validation ───────────────────────────────▶ status/in-progress

status/feedback-required
  │
  └─ /validate ────────────────────────────────────────▶ status/validation

status/done → [CLOSED]
```

---

## Who Can Do What

| Action | Required role |
|--------|--------------|
| `/approve` or `/reject` an Epic | Write access to repository |
| `/accept`, `/defer`, `/duplicate`, `/reject` a task | Any collaborator (pod owner by convention) |
| `/start`, `/block`, `/unblock`, `/validate`, `/depends-on` | Any collaborator (developer by convention) |
| `/approve-validation`, `/feedback`, `/reject-validation` | Any collaborator (pod owner or TL by convention) |
| Apply `priority/*` labels | Pod owner or team lead |
| Apply `vertical/*` labels | Pod owner or team lead |
| Run reconcile workflow | Write access to repository |
| Run create-labels workflow | Write access to repository |

> **Note:** Triage commands are not technically access-controlled beyond write access
> (except Epic approve/reject). The access model relies on team discipline and pod
> ownership. If you need hard enforcement, add an authorization check using
> `get-pod-owner.js` output to validate the commenter matches the expected pod owner.

---

## Source-of-Truth Map

Every piece of state has exactly one authority. Two places describing the same truth means one of them will rot.

| State Concern | Source of Truth | Who Writes It | Who May Read It |
|---------------|----------------|---------------|-----------------|
| Lifecycle state (current status) | `status/*` label | Workflows only | Everyone |
| Elapsed lifecycle time | `<!-- issueops:timestamp -->` comments via `lifecycle-timestamps.js` | Workflows only | Reporting scripts |
| SLA clock start (non-critical) | `in-progress` timestamp comment | `task-triage.yml` on `/start` | `daily-digest.yml` |
| SLA clock start (critical) | `issue.created_at` | GitHub (immutable) | `daily-digest.yml` |
| SLA clock pause/resume | `sla-paused` / `sla-resumed` timestamp comments | `task-triage.yml` on `/depends-on` / `/unblock` | `lifecycle-timestamps.js --action elapsed` |
| Pod owner | `CODEOWNERS` file via `get-pod-owner.js` | Team lead commits | Triage workflows, Copilot skills |
| Dependency status | `has-dependency` label + dep-notice comment | `task-triage.yml` on `/depends-on` | `dependency-resolution.yml`, board |
| WIP limit policy | `check-wip.js` | Script (single source) | `task-triage.yml`, `wip-enforcement.yml` |
| Epic ID | `<!-- issueops:timestamp -->` comment on Epic | `epic-triage.yml` on `/approve` | Sprint reports |
| Comment formatting | `post-comment.js` | Script (single source) | All workflows |

---

## State Transition Matrix

| Current State | Allowed Trigger | Next State | Who Triggers | Notes |
|---------------|----------------|------------|--------------|-------|
| (new issue) | Issue opened with `type/epic` | `status/pending-approval` | Template auto-label | Epic workflow fires |
| `status/pending-approval` | `/approve` | `status/backlog` | Write access only | Labels applied, Epic ID generated |
| `status/pending-approval` | `/reject <reason>` | Closed | Write access only | Reason documented |
| (new issue) | Issue opened with `type/task` | `status/review` | `task-triage.yml` | Epic validated first |
| (new issue, Epic pending) | Issue opened with `type/task` | `status/blocked-pending-epic` | `task-triage.yml` | Released when Epic approved |
| `status/review` | `/accept` | `status/backlog` | Pod owner | Task enters Icebox |
| `status/review` | `/defer <reason>` | `status/backlog` | Pod owner | Reason noted |
| `status/review` | `/duplicate #N` | Closed | Pod owner | Linked to N |
| `status/review` | `/reject <reason>` | Closed | Pod owner | Reason documented |
| `status/backlog` | Sprint planning (manual) | `status/sprint` | Team lead | No workflow trigger |
| `status/sprint` | `/start` | `status/in-progress` | Developer | SLA clock starts, WIP checked |
| `status/backlog` | `/start` (shortcut) | `status/in-progress` | Developer | SLA clock starts, WIP checked |
| `status/in-progress` | `/block <reason>` | `status/blocked` | Developer | SLA continues, team lead tagged |
| `status/in-progress` | `/validate` | `status/validation` | Developer | Reviewer tagged |
| `status/in-progress` | `/depends-on #N` | `has-dependency` added | Developer | SLA clock pauses |
| `status/blocked` | `/unblock <resolution>` | `status/in-progress` | Developer | SLA resumes |
| `status/validation` | `/approve-validation` | `status/done` → Closed | Pod owner / TL | Sprint velocity +1 |
| `status/validation` | `/feedback <gaps>` | `status/feedback-required` | Pod owner / TL | Developer re-works |
| `status/validation` | `/reject-validation <reason>` | `status/in-progress` | Pod owner / TL | SLA continues |
| `status/feedback-required` | `/validate` | `status/validation` | Developer | Re-enters review queue |
| `status/in-progress` (Critical) | SLA breach (daily digest) | `status/overdue` added | `daily-digest.yml` | Auto-stamped, not a state change |
| Any open state | `reconcile-issue.yml` | Corrected state | Write access | Dry run default |
| Closed | Reopened manually | Labels NOT restored | Human | See reopened-issue section below |

---

## Reopened Issue Behavior

Reopening a closed issue is a known edge case. Current behavior (documented, not automated):

1. Labels are **not** automatically restored when an issue is reopened — GitHub removes no labels on reopen, so the `status/done` label remains.
2. Lifecycle timestamps in comments are **still present** — the history is intact.
3. The SLA clock is **not** automatically restarted — the old `done` timestamp remains.

**Manual recovery steps for a reopened issue:**
1. Run `reconcile-issue.yml` with `dry_run=true` to see the discrepancy
2. Manually remove `status/done` and apply the appropriate status label
3. If work needs to restart, post `/start` to stamp a new `in-progress` timestamp
4. The old lifecycle history remains in comments — that is correct, it is a historical record

**Why this is not automated:** Reopened issues are rare and the right behavior depends on context (fixing a bug vs re-doing work). Automating it incorrectly would be worse than requiring a manual recovery step.

