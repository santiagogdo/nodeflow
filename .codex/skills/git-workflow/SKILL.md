---
name: git-workflow
description: Git workflow. Use when working in this repo and asked to create branches, write Conventional Commit messages, commit/push staged changes, or open/draft PRs via gh (targeting develop).
---

# Git Workflow

## Overview

Use this skill to perform git/gh tasks in this repo while enforcing Conventional
Commits and Conventional Branch naming. Default PR base is `develop` unless the
user specifies otherwise.

## Workflow Decision Tree

- If the user asks for a commit message only, follow **Commit Message Only**.
- If the user asks to commit and/or push, follow **Commit + Push**.
- If the user asks to open or draft a PR, follow **PR (Open or Draft)**.

## Core Rules

1. Never stage files; operate only on already staged changes.
2. Always inspect staged changes; if nothing is staged, ask the user to stage
   files.
3. Use Conventional Commits for commit messages. See
   `references/conventional-commits.md`.
4. Use Conventional Branch naming when creating a branch. See
   `references/conventional-branches.md`.
5. Default PR base is `develop`. If unsure, ask the user.
6. Use `gh` to open PRs; PR title is the commit subject line; PR body is
   detailed.
7. If a git/gh command requires elevated permissions (network, non-workspace
   paths), request approval.
8. Never push directly to `main`, `master`, or `develop`.
9. If currently on `main`, `master`, or `develop`, create a new Conventional
   Branch before any commit+push workflow.

## Workflows

### Commit Message Only

- Run `git status -b` and `git diff --staged` to understand staged changes.
- Draft a Conventional Commit message for staged changes only.
- Ask for missing context (scope, breaking change, ticket id) when needed.

### Commit + Push (Staged Changes Only)

- Confirm staged-only rule is satisfied.
- If the current branch is `main`, `master`, or `develop`, create a new branch
  using Conventional Branch naming before committing.
- Create the Conventional Commit message, then run `git commit`.
- Push the current branch with `git push`.
- Never push directly to `main`, `master`, or `develop`.
- Do not stage or modify unstaged files.

### PR (Open or Draft)

- If the current branch is `main`, `master`, or `develop`, create a new branch
  using Conventional Branch naming.
- Ensure a commit exists; if not, run **Commit + Push** first.
- Create the PR with
  `gh pr create --base develop --title "<commit title>" --body "<detailed description>"`.
- Add `--draft` for a draft PR.
- PR body should include: summary, key changes, tests (or “not run”),
  risks/notes, and screenshots when relevant.
- Use `assets/pr-template.md` as the default PR body template and fill in all
  sections.

## References

- `references/conventional-commits.md`
- `references/conventional-branches.md`
- `references/pr-guidelines.md`

## Assets

- `assets/pr-template.md`
