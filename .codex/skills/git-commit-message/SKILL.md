---
name: git-commit-message
description: Generate a Conventional Commit message for staged changes. Use when asked for a commit message only (no commit/push). Delegates to the git-workflow skill.
---

# Git Commit Message

## Overview

Use the `git-workflow` skill and run the **Commit Message Only** workflow. Do
not commit or push.

## Steps

1. Load `git-workflow`.
2. Follow **Commit Message Only**.
3. Never stage files; if nothing is staged, ask the user to stage changes.
4. Ask for missing context (scope, breaking change, ticket id) when needed.
