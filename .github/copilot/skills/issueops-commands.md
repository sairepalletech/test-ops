---
name: IssueOps Commands
description: >
  Execute any IssueOps slash command on a GitHub issue using natural language.
  Use when a developer wants to start work, block an issue, validate, approve,
  reject, register a dependency, or perform any IssueOps lifecycle action
  without remembering exact slash command syntax.
triggers:
  - start working on
  - I am starting
  - pick up issue
  - block issue
  - I am blocked
  - unblock issue
  - submit for review
  - ready for validation
  - approve this task
  - validate issue
  - reject validation
  - give feedback on
  - depends on issue
  - accept task
  - defer task
  - duplicate issue
  - reject task
  - approve epic
  - reject epic
  - mark as done
  - complete task
---

# IssueOps Commands Skill

## What this skill does

Translates natural language into the correct slash command and posts it on the
right GitHub issue using the GitHub MCP server. The developer describes what
they want — the skill figures out the command, formats it correctly, confirms
with a preview, and posts it.

---

## Command reference — what maps to what

Use this table to determine which command to run based on what the developer says.

### Epic commands

| Developer says | Command to post | Who is allowed |
|----------------|-----------------|----------------|
| approve this epic, activate epic, epic looks good | `/approve` | Write access only — check first |
| reject epic, close epic, not ready | `/reject <reason>` | Write access only — check first |

### Triage gate commands (pod owner accepting new tasks)

| Developer says | Command to post |
|----------------|-----------------|
| accept this task, looks good, add to backlog | `/accept` |
| defer this, not this sprint, come back later | `/defer <reason>` |
| this already exists, duplicate of | `/duplicate #N` |
| reject this task, not valid, close it | `/reject <reason>` |

### Execution commands (developer working a task)

| Developer says | Command to post |
|----------------|-----------------|
| start working, pick it up, beginning issue, I will take this | `/start` |
| I am blocked, cannot proceed, stuck, need help | `/block <reason>` |
| unblocked, resolved, can proceed now, fixed the blocker | `/unblock <resolution>` |
| ready for review, done, finished, submit for validation | `/validate` |
| depends on, waiting for, blocked by another issue | `/depends-on #N` |

### Validation commands (pod owner or team lead reviewing)

| Developer says | Command to post |
|----------------|-----------------|
| approve validation, looks good, done, complete, close it | `/approve-validation` |
| feedback, not quite right, gaps found, needs work | `/feedback <gaps>` |
| reject validation, outcome not met, send back | `/reject-validation <reason>` |

---

## Step 1 — Identify the issue number

If the developer mentioned an issue number, use it directly.

If not, ask:
> "Which issue number? (e.g. #42)"

If they said something like "my current task" or "the thing I am working on",
use the GitHub MCP server to find open issues assigned to them with
`status/in-progress`. If exactly one is found, use it and confirm.
If multiple are found, list them and ask which one.

---

## Step 2 — Check access for Epic commands

For `/approve` and `/reject` on an Epic, check if the actor has write access
to the repository using the GitHub MCP server before posting.

If they do not have write access:
> "You need write access to approve or reject Epics. This command can only
> be posted by a repository maintainer."

Stop here — do not post the command.

---

## Step 3 — Gather required information

For commands that need additional input, ask before posting.

**For `/block`** — ask:
```
To document this blocker clearly:
1. What specifically is blocking you?
2. What have you already tried?
3. What needs to happen to unblock?
```
Format the reason as:
`[Blocking]: <what> | [Tried]: <attempts> | [Needed]: <action>`

**For `/unblock`** — ask:
```
What resolved the blocker? (one sentence)
```

**For `/reject` or `/reject-validation`** — ask:
```
What is the reason for rejecting? (this is documented permanently)
```

**For `/feedback`** — ask:
```
What specific gaps need to be addressed before this can be approved?
```

**For `/defer`** — ask:
```
Why is this being deferred? (optional but recommended for backlog grooming)
```

**For `/duplicate #N`** — confirm the duplicate issue number:
```
Which issue number is this a duplicate of?
```

**For `/depends-on #N`** — confirm the dependency issue number:
```
Which issue number does this depend on?
```

**For `/approve-validation`** — ask for an optional note:
```
Any note for the audit trail? (e.g. "Verified threshold at 85%, PR #234 reviewed")
Optional — press enter to skip.
```

**For `/approve` on an Epic** — no extra info needed, just confirm.

**For `/start`** — no extra info needed. But check WIP first (see Step 4).

**For `/accept`** — no extra info needed.

**For `/validate`** — no extra info needed.

---

## Step 4 — WIP check for /start

Before posting `/start`, use the GitHub MCP server to check if the developer
already has any open issues with `status/in-progress` assigned to them.

If WIP count > 0:
```
⚠️ WIP Warning: You already have N in-progress item(s):
  #N — <title>

The WIP limit is 1 per developer. Still want to start #[new issue]?
(It will go to in-progress alongside your existing item — the workflow
will post a warning on the issue automatically.)
```

Wait for confirmation before posting.

If WIP == 0: proceed to Step 5 without warning.

---

## Step 5 — Show preview and confirm

Always show a preview before posting. Format it clearly:

```
Ready to post on issue #N — <issue title>:

  /<command> <reason if applicable>

Shall I post this now?
```

For longer reasons (block, feedback, reject), show the full formatted text
so the developer can edit before confirming.

Wait for a yes or affirmative response. If they want to change the reason,
update and show preview again.

---

## Step 6 — Post using GitHub MCP server

Post the comment on the issue with the exact command text.

The command must be the first thing on the comment — no preamble, no explanation.

**Correct:**
```
/block [Blocking]: Vault key missing monitors_write scope | [Tried]: Verified scopes, got 403 | [Needed]: Vault admin to update Datadog service account
```

**Wrong:**
```
I need to block this issue because...
/block reason here
```

---

## Step 7 — Confirm what happened

After posting, tell the developer what the workflow will do automatically:

| Command posted | What the workflow does automatically |
|----------------|--------------------------------------|
| `/approve` | Labels applied, Epic ID generated, backlog status set, blocked tasks released |
| `/reject` | Epic closed, reason documented |
| `/accept` | status/backlog applied, task enters Icebox |
| `/defer` | Task stays in backlog with reason |
| `/duplicate #N` | Task closed, linked to #N |
| `/reject` (task) | Task closed, reason documented |
| `/start` | status/in-progress applied, SLA clock starts, assignee set |
| `/block` | status/blocked applied, status/in-progress removed, team lead notified |
| `/unblock` | status/in-progress reapplied, resolution documented |
| `/validate` | status/validation applied, reviewer tagged |
| `/approve-validation` | Issue closed, status/done, Epic child count updated |
| `/feedback` | status/feedback-required applied, developer tagged |
| `/reject-validation` | status/in-progress reapplied, SLA clock continues |
| `/depends-on #N` | has-dependency label applied, SLA clock paused, notice posted on #N |

---

## Syntax rules the skill must follow

These are hard rules — the workflows use exact string matching.

1. Command must start at the beginning of the comment — no leading text
2. Commands are case-sensitive — always lowercase
3. `/approve` is for Epics — `/approve-validation` is for tasks — never confuse them
4. `/reject` on an Epic closes the Epic — `/reject-validation` returns task to in-progress
5. `/reject` (no suffix) on a task closes it permanently
6. For `/depends-on` the issue number must include the # symbol: `/depends-on #42`
7. For `/duplicate` the issue number must include the # symbol: `/duplicate #38`

---

## Natural language to command mapping — extended examples

| Developer says | Command |
|----------------|---------|
| "I am done with issue 42" | `/validate` on #42 |
| "Kick off issue 15" | `/start` on #15 |
| "I cannot move forward on 23, the network team hasn't opened the port" | `/block` on #23 with reason |
| "The port is open, I can continue on 23" | `/unblock` on #23 with resolution |
| "Task 19 is waiting for task 12 to finish" | `/depends-on #12` on #19 |
| "This looks like a duplicate of 7" | `/duplicate #7` |
| "The outcome was met, ship it" | `/approve-validation` |
| "Not quite right — the threshold is 90% not 85%" | `/feedback` with gap description |
| "Send it back, the v2 migration was not done" | `/reject-validation` with reason |
| "Accept the Datadog task that came in" | `/accept` on the relevant task |
| "The Epic for JFrog looks good, approve it" | `/approve` on the Epic (check write access first) |

---

## What not to do

- Never post a command without showing the preview first
- Never post `/approve-validation` on an Epic — that command is for tasks only
- Never post `/approve` on a task — that command is for Epics only (use `/accept`)
- Never guess the issue number — always confirm
- Never skip the WIP check before posting `/start`
- Never post a command with preamble text before it — the workflow needs it first on the line
- Never post `/reject` on a task if the developer said "reject the validation" — use `/reject-validation`
