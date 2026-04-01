# CI/CD Team IssueOps Platform

A GitHub-native operating model for a CI/CD platform team. Uses GitHub Issues,
GitHub Projects, GitHub Actions, and Copilot Skills to run a bi-weekly Scrum process
entirely inside GitHub — no JIRA, no external tools, no magic.

**What it is:** A structured intake system, automated state machine, and daily digest
for a 15-person team running 6 CI/CD verticals.

**What it is not:** A self-healing system or something that runs without disciplined
human participation.

**Pilot-ready:** Yes.
**Production-hardened:** Not yet. Read the honest limitations section.

---

## How it works

Every piece of work is a GitHub Issue with structured fields. Workflows fire on
issue events, read fields via scripts, apply labels, and route to pod owners.
State changes happen through slash commands in issue comments. A scheduled digest
runs every morning. The board reflects whatever the labels say — accurately when
the team uses the commands correctly, inaccurately when they don't.

The system helps enforce discipline. It does not replace it.

---

## File structure

```
.github/
├── CODEOWNERS                           # Pod owner routing — edit this first
├── STATE-AUTHORITY.md                   # Label ownership and drift recovery
├── labels.yml                           # All 34 labels defined
├── ISSUE_TEMPLATE/
│   ├── epic.yml  task.yml  bug.yml  config.yml
├── scripts/                             # Node.js helpers — zero npm dependencies
│   ├── parse-issue-body.js              # Field extraction
│   ├── validate-issue.js                # Required field validation
│   ├── get-pod-owner.js                 # CODEOWNERS lookup
│   ├── calculate-sla.js                 # SLA threshold calculation
│   ├── lifecycle-timestamps.js          # Real lifecycle timing
│   ├── post-comment.js                  # Centralised comment formatting
│   ├── check-wip.js                     # Canonical WIP limit check
│   ├── generate-epic-id.js              # EPIC-YYYY-NNN format
│   ├── generate-digest.js               # CSV generation
│   ├── retro-analysis.js                # Sprint metrics
│   └── test-local.js                    # Test harness
└── workflows/
    ├── yaml-lint.yml                    # Shared lint gate
    ├── epic-triage.yml                  # Epic /approve /reject
    ├── task-triage.yml                  # All 12 task commands
    ├── daily-digest.yml                 # SLA + CSV artifacts
    ├── standup-check.yml                # Morning digest
    ├── critical-fast-lane.yml           # Fast-track priority/critical
    ├── wip-enforcement.yml              # WIP warning (uses check-wip.js)
    ├── dependency-resolution.yml        # Notify on dep close
    ├── epic-completion.yml              # Auto-close Epic
    ├── sprint-ceremonies.yml            # Planning/review/retro
    ├── reconcile-issue.yml              # Fix label drift
    └── create-labels.yml               # Bootstrap labels
```

---

## Quick start

**Step 1** — Bootstrap labels:
`GitHub Actions → Create Labels → Run workflow → type YES`

**Step 2** — Update CODEOWNERS with real GitHub handles for each vertical pod owner.

**Step 3** — Create a GitHub Project with 4 saved views: Daily Board, Sprint Health,
Epic Progress, By Vertical.

**Step 4** — Run the test harness:
```bash
node .github/scripts/test-local.js
```

**Step 5** — Create one Epic and one Task manually to verify the full workflow fires.

---

## IssueOps commands

### Epic (write access required)
`/approve` — activate Epic  
`/reject <reason>` — close Epic

### Task triage gate (pod owner)
`/accept` `/defer <reason>` `/duplicate #N` `/reject <reason>`

### Task execution (developer)
`/start` `/block <reason>` `/unblock <resolution>` `/validate` `/depends-on #N` `/update <status>`

### Validation (pod owner or team lead)
`/approve-validation [note]` `/feedback <gaps>` `/reject-validation <reason>`

---

## SLA framework

| Priority | Clock starts | Threshold |
|----------|-------------|-----------|
| `priority/critical` | Issue creation | 1 calendar day |
| `priority/high` | `/start` | 3 business days |
| `priority/medium` | `/start` | 7 business days |
| `priority/low` | `/start` | 14 business days |

SLA clock **pauses** when `has-dependency` is applied, resumes when dependency closes.
Timing uses real `<!-- issueops:timestamp -->` comments embedded in workflow posts —
not the unreliable `updated_at` field.

---

## Known limitations

1. **Labels are the state machine — humans can break it.** See `STATE-AUTHORITY.md` for
   which labels to never touch manually. Use `reconcile-issue.yml` to fix drift.

2. **SLA timing is best-effort for issues pre-dating this system.** Old issues have no
   lifecycle timestamps; the digest falls back to `updated_at` for those.

3. **The critical fast lane is not a full incident process.** It fast-tracks and notifies.
   It does not have acknowledgment breach detection or automated escalation ladders.

4. **Copilot skills make inference mistakes.** Always review the preview before confirming.

5. **This is v1.5, not a hardened operating system.** Works well with a disciplined team.
   Degrades with users who skip commands or route issues through Slack instead.

---

## Rollout waves

**Wave 1 (Sprint 1) — Ship these only:**
Pod owners in CODEOWNERS, labels bootstrapped, Project with 4 views, team walkthrough,
one full Epic→Task flow end to end, test-local.js passing.

**Wave 2 (Sprint 3) — After Wave 1 is habit:**
Copilot skills deployed, sprint ceremonies workflow in use, reconcile workflow tested.

**Wave 3 (Sprint 5+) — After Wave 2 is habit:**
Retro analysis from CSV artifacts, anomaly detection tuned.

**Never ship:** automated capacity blocking, more than 8 skills, per-vertical CSV digests.

---

## The one metric that matters

**Triage cycle time** — created → `status/backlog`.
Under 4 hours: healthy. Over 24 hours: something is broken.

---

## Local development

```bash
# Test all scripts — no GitHub token needed
node .github/scripts/test-local.js

# Check lifecycle history for any issue
node .github/scripts/lifecycle-timestamps.js \
  --action history \
  --comments "$(gh issue view 42 --json comments -q '.comments')"

# Run SLA check
node .github/scripts/calculate-sla.js \
  --priority priority/high \
  --start-date 2026-03-28 \
  --today 2026-03-31
```

> **Governance rule:** Each wave ships only after the previous wave runs without
> complaints for one full sprint cycle. The process serves the team.
