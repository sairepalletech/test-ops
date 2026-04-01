---
name: Create IssueOps Task
description: >
  Automatically fills in and submits a CI/CD team task issue using the IssueOps
  intake form. Use when a developer says they want to create a task, raise a ticket,
  log work, or add something to the CI/CD backlog.
triggers:
  - create a task
  - raise a ticket
  - log a task
  - new task for
  - add to backlog
  - create cicd task
  - open a ticket
  - log work
---

# Create IssueOps Task Skill

## What this skill does

Gathers context, fills in the task template fields, shows a preview, and submits
the task issue directly using the GitHub MCP server. The developer should never
need to open the GitHub UI.

---

## Step 1 — Infer context from the environment

Before asking any questions, check:

- **Repository name** → infer the affected system
- **Current branch name** → infer what the work is about
- **Open files or recent commits** → infer vertical and Epic

**Vertical inference rules:**

| File/context signals | Inferred vertical |
|---------------------|-------------------|
| datadog, dd-, metrics, monitors, dashboards | Datadog |
| artifactory, jfrog, npm-registry, docker-registry, artifact | Artifactory |
| .github/, actions, runners, EMU, enterprise, org-settings, copilot | GitHub Platform |
| jira, confluence, wiki, atlassian | JIRA & Wiki |
| terraform, tfe, tfcloud, .tf files | TFE |
| gitlab, .gitlab-ci, gitlab-runner | GitLab Pipelines |

---

## Step 2 — Find a matching Epic

Use the GitHub MCP server to search open issues with:
- Label: `type/epic`
- Label: `status/backlog` (approved Epics only)
- Filter by inferred vertical if possible

If multiple Epics found, show the developer a short list and ask them to pick one.
If no approved Epic found for the vertical, tell the developer:
> "There is no approved Epic for the **[vertical]** vertical yet. You or your team lead
> will need to create and approve one first. Would you like me to start an Epic intake instead?"

---

## Step 3 — Ask only what you cannot infer

Ask in a single message — never one question at a time.

**If most context is missing:**
```
I can create that task for you. Quick questions:
- What are you trying to do? (one or two sentences)
- Why — what problem does this solve?
- What does done look like? (one sentence)
- Priority — Critical, High, Medium, or Low?
```

**If vertical and system are already known:**
```
Creating a [vertical] task against Epic #[N]. Quick questions:
- What specifically needs to change?
- Why — what is broken or needed?
- What does done look like?
- Priority?
```

---

## Step 4 — Infer Priority from language if not stated

| Developer language signals | Inferred priority |
|---------------------------|------------------|
| broken, down, failing, urgent, blocked, production, outage, critical | Critical |
| soon, this week, needed, important, impacting team | High |
| improvement, cleanup, refactor, nice to have, when you get a chance | Low |
| (everything else) | Medium |

---

## Step 5 — Show preview before submitting

Before calling the GitHub MCP server, show the developer a complete preview:

```
Here is what I will submit:

Title:            [TASK] <generated title>
What:             <what you are doing>
Why:              <why you are doing it>
Summary:          <two sentence summary>
Expected Outcome: <definition of done>
Parent Epic:      #<number> — <Epic title>
Vertical:         <vertical>
Priority:         <priority>
Affected System:  <system>
Assignee:         <handle or "unassigned — pod owner will assign">

Does this look right? I will submit it now.
```

Wait for confirmation. If they want changes, update and show preview again.
If they say yes or any affirmative, proceed.

---

## Step 6 — Submit using GitHub MCP server

Create the issue with:
- Title: `[TASK] <title>`
- Labels: `type/task`
- Body formatted to exactly match the task.yml field structure:

```
### Task Title
<title>

### What are you doing?
<what>

### Why are you doing it?
<why>

### Summary
<summary>

### Expected Outcome
<outcome>

### Parent Epic Number
#<epic_number>

### Vertical
<vertical>

### Assignee
<assignee or leave blank>

### Priority
<priority>

### Affected System
<system>
```

---

## Step 7 — Confirm submission

After the issue is created, share:
- Issue number and URL
- Current status label (status/review if Epic approved, status/blocked-pending-epic if Epic pending)
- SLA based on priority
- One-line next step: "Your task is in review. The pod owner for [vertical] will triage it."

---

## WIP check

Before submitting, check if the developer already has an open issue with `status/in-progress`.
If yes, warn:
> "⚠️ You already have an in-progress issue (#N). The WIP limit is 1 per developer.
> Do you still want to submit this task? It will go to review/backlog, not immediately to in-progress."

---

## Never do these

- Never submit without showing the preview first
- Never guess the Epic number without searching
- Never create with a missing required field — always ask
- Never skip the confirmation even if the developer says "just do it"
