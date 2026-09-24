---
name: git-draft-pr
description: Open a draft PR via gh with Conventional Branch/Commit rules. Use when asked to create a draft PR. Delegates to the git-workflow skill.
---

# Draft PR

## Overview

Use the `git-workflow` skill and run the **PR (Open or Draft)** workflow with
`--draft`.

## Steps

1. Load `git-workflow`.
2. Follow **PR (Open or Draft)** and ensure `--draft` is used.
3. If on `main`, `master`, or `develop`, create a new branch per Conventional
   Branch rules.
4. Use the commit title as PR title and a detailed PR body.
