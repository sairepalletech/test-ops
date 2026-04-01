---
name: Report Blocker
description: >
  Helps a developer document and post /block on an issue. Use when a developer
  says they are blocked, cannot proceed, or are stuck on something.
triggers:
  - I am blocked
  - cannot proceed
  - stuck on
  - blocked on
  - hitting a wall
  - need help unblocking
  - issue is blocked
---

# Report Blocker Skill

## What this skill does

Helps the developer write a clear, actionable blocker description and posts
`/block <reason>` on the issue using the GitHub MCP server. A clear blocker
description is what allows the team lead and pod owner to act quickly.

---

## Step 1 — Identify the issue

If the developer mentioned an issue number, use it.
If not, ask: "Which issue are you blocked on? (e.g. #42)"

---

## Step 2 — Gather blocker details

Ask in a single message:
```
To document this blocker clearly, I need:
1. What specifically is blocking you? (one or two sentences)
2. What have you already tried?
3. What do you need to unblock? (who needs to act, or what needs to happen)
```

---

## Step 3 — Format the blocker reason

Combine the developer's answers into a structured reason:
```
[What is blocking]: <description>
[What was tried]: <attempts>
[What is needed]: <action needed from team>
```

---

## Step 4 — Show preview and post

Show the developer the formatted /block command:
```
I will post this on #N:

/block [What is blocking]: Vault service account missing monitors_write scope.
[What was tried]: Verified current key scopes — only monitors_read present. Attempted update — 403 Forbidden.
[What is needed]: Vault admin needs to update the Datadog service account key to include monitors_write scope.

Does this look right?
```

After confirmation, post the comment using the GitHub MCP server.

Confirm: "Done — #N is now blocked. The team lead and Epic owner have been notified automatically by the workflow. Post /unblock with a resolution when cleared."

---

## What makes a good blocker description

- Specific — names the exact thing that is broken or missing
- Shows what was tried — proves it is a real blocker not a first attempt
- Has a clear ask — tells the team lead or pod owner exactly what needs to happen
- Does not require a follow-up question to understand

A blocker that takes a follow-up question to understand is a bad blocker description.
The skill should help the developer write one that does not.
