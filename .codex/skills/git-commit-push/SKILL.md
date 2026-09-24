---
name: git-commit-push
description: Commit and push staged changes using Conventional Commits. Use when asked to commit and/or push (no PR). Delegates to the git-workflow skill.
---

# Git Commit + Push

## Overview

Use the `git-workflow` skill and run the **Commit + Push** workflow.

## Steps

1. Load `git-workflow`.
2. Follow **Commit + Push (Staged Changes Only)**.
3. Never stage files; if nothing is staged, ask the user to stage changes.
4. Never push directly to `main`, `master`, or `develop`. Instead, create a new
   branch per Conventional Branch rules.
5. Push the current non-protected branch after committing.
