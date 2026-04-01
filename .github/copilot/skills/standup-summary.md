---
name: Standup Summary
description: >
  Reads the current board state and returns a three-section standup summary —
  done yesterday, in progress today, blocked. Use when a developer asks what
  the team is working on, needs standup input, or wants a board health check.
triggers:
  - what is the team working on
  - standup
  - what are we doing today
  - board status
  - what is in progress
  - who is working on what
  - show me the board
  - sprint status
---

# Standup Summary Skill

## What this skill does

Uses the GitHub MCP server to read the current state of all open issues,
then formats a clean three-section standup summary. Takes 30 seconds.
No manual preparation needed.

---

## Step 1 — Fetch board state

Use the GitHub MCP server to fetch:

1. All issues with `status/in-progress` label — open
2. All issues with `status/blocked` label — open
3. All issues with `status/validation` label — open
4. All issues with `status/done` closed in the last 24 hours
5. All issues with `status/overdue` label — open

For each in-progress issue also fetch:
- Assignee GitHub handle
- Vertical label
- Priority label
- Days since `updated_at` (proxy for days in current status)
- Whether `status/overdue` is present

---

## Step 2 — Format the summary

Return exactly this structure:

```
── DONE YESTERDAY ──────────────────────────────────
  #N  <title>  @assignee  [vertical]

── IN PROGRESS TODAY ───────────────────────────────
  @alice   #N  <title>   [Datadog]    Day 2   🟢
  @bob     #N  <title>   [Artifactory] Day 4  🔴 OVERDUE
  @carol   #N  <title>   [TFE]        Day 1   🟢

── BLOCKED ─────────────────────────────────────────
  #N  <title>  @assignee  Day X blocked
  Reason: <last comment or blocker description>

── AWAITING VALIDATION ─────────────────────────────
  #N  <title>  @assignee  waiting N days

── SPRINT HEALTH ───────────────────────────────────
  In progress: N  |  Blocked: N  |  Overdue: N  |  Validation: N
```

If done yesterday is empty: `None — no issues closed in the last 24 hours`
If blocked is empty: `Clear — no blocked items 🟢`
If in progress is empty: `No items currently in progress`

---

## Step 3 — Flag items needing attention

After the summary, add a brief attention section if any of these are true:

- Any issue has `status/overdue` → "🔴 **Action needed:** N item(s) are SLA-breached"
- Any issue has been blocked for more than 3 days → "🟡 **Check:** #N blocked for X days"
- Any developer has more than 1 in-progress item → "⚠️ **WIP:** @user has N items in progress"
- Validation queue has more than 3 items → "🟡 **Review queue building:** N items awaiting sign-off"

If nothing needs attention: `✅ All clear — board is healthy`

---

## What not to do

- Do not read from the daily CSV artifact — always read live board state
- Do not show issues in status/backlog or status/sprint in the standup
- Do not include closed issues older than 24 hours in "done yesterday"
- Do not skip the attention section even if the developer did not ask for it
