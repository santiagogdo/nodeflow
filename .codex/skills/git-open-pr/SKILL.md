---
name: git-open-pr
description: Open a PR via gh with Conventional Branch/Commit rules. Use when asked to open a PR (non-draft). Delegates to the git-workflow skill.
---

# Open PR

## Overview

Use the `git-workflow` skill and run the **PR (Open or Draft)** workflow without
`--draft`.

## Steps

1. Load `git-workflow`.
2. Follow **PR (Open or Draft)** and do not use `--draft`.
3. If on `main`, `master`, or `develop`, create a new branch per Conventional
   Branch rules.
4. Use the commit title as PR title and a detailed PR body.
