---
name: Start Work
description: >
  Posts /start on an issue and marks it as in-progress. Use when a developer says
  they are starting work on an issue, picking it up, or beginning a task.
triggers:
  - I am starting issue
  - picking up issue
  - starting work on
  - I will take
  - assigning to myself
  - beginning issue
---

# Start Work Skill

## What this skill does

Finds the issue the developer wants to start, checks their WIP count, confirms with
them, and posts `/start` as a comment on their behalf using the GitHub MCP server.

---

## Step 1 — Identify the issue

If the developer mentioned an issue number, use it.
If not, ask: "Which issue number are you starting? (e.g. #42)"

---

## Step 2 — Check WIP

Use the GitHub MCP server to check if the developer has any open issues with
`status/in-progress` already assigned to them.

If WIP > 0:
```
⚠️ You already have an in-progress item: #N — <title>

WIP limit is 1 per developer. Are you sure you want to start #[new issue]?
If yes, consider whether to park or hand off #N first.
```

If WIP == 0: proceed directly.

---

## Step 3 — Confirm and post

Show a one-line confirmation:
```
Ready to post /start on #[N] — [title]. Proceed?
```

After confirmation, use the GitHub MCP server to post a comment:
```
/start
```

Confirm back: "Done — #N is now in-progress. SLA clock has started. Use /block if you hit a blocker, /validate when complete."
