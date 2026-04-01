# CI/CD IssueOps Agent

This repository uses custom Copilot skills for the CI/CD team IssueOps workflow.

## Repository Context

**Team:** CI/CD Platform Team — 15 members, bi-weekly Scrum
**Verticals:** Datadog | Artifactory | GitHub Platform | JIRA & Wiki | TFE | GitLab Pipelines
**Issue lifecycle:** Epic → Task → /start → /block|/validate → /approve-validation → Done
**Board:** GitHub Projects — single project, six saved vertical views
**SLA:** Critical 1 day | High 3 biz days | Medium 7 biz days | Low 14 biz days
**Sprint:** Bi-weekly — planning Monday Week 1, review/retro Friday Week 2

## Skills Available

- **issueops-commands** — Execute ANY IssueOps slash command using natural language (primary skill for all lifecycle actions)
- **create-task** — Create and submit a CI/CD team task using IssueOps
- **start-work** — Post /start on an issue and begin work (also covered by issueops-commands)
- **report-blocker** — Document and post /block on a blocked issue (also covered by issueops-commands)
- **standup-summary** — Summarize current board state for standup

## When to Use Skills

Any time a developer in this repository mentions:
- Any lifecycle action — start, block, unblock, validate, approve, reject, depends-on → **issueops-commands**
- Creating a task, logging work, raising a ticket → **create-task**
- What the team is working on, standup update → **standup-summary**

> **issueops-commands is the primary skill** — it covers all slash commands in one place.
> The individual skills (start-work, report-blocker) are retained for cases where a
> developer specifically asks for one of them by name.

## Rules

1. Every task must have a parent Epic — the skill must search for one
2. Tasks submitted against pending Epics are held automatically
3. Pod owners route from CODEOWNERS — do not guess ownership
4. The board is the contract — all updates go through issue comments
5. WIP limit is 1 per developer — warn before posting /start if WIP > 0
6. Commands must start at the beginning of the comment — no leading text
7. /approve is for Epics only — /accept is for tasks
8. /approve-validation is for tasks only — never post on an Epic
