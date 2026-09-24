# PR Guidelines (repo standard)

## Defaults

- Base branch: `develop`.
- Use `gh pr create` for opening PRs.
- PR title: commit subject line only.
- PR body: detailed and structured.

## Body Structure (recommended)

- **Summary**: What this PR changes and why.
- **Key Changes**: 2–5 bullets of the most important edits.
- **Testing**: Commands run or “Not run (reason)”.
- **Risks/Notes**: Any risk, migration, or follow-up.
- **Screenshots/Video**: If UI/visual behavior changed.

## Draft PR

- Add `--draft` when the user asks for a draft PR.

## Branch Handling

- If the current branch is `main` or `develop`, create a new branch before
  opening a PR.
