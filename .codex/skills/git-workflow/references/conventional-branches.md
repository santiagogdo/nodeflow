# Conventional Branch Naming (repo standard)

## Format

```
<type>/<description>
```

## Prefixes

- `feature/` or `feat/` for new features
- `bugfix/` or `fix/` for bug fixes
- `hotfix/` for urgent fixes
- `release/` for release prep
- `chore/` for non-code maintenance

## Rules

- The branch name should be descriptive yet concise, clearly indicating the purpose of the work.
- Use lowercase letters, numbers, and hyphens.
- Avoid special characters, underscores, or spaces. Dots are allowed for release branches (e.g., `release/v1.2.0`).
- No consecutive, leading, or trailing hyphens/dots.
- Include ticket numbers if provided (e.g., `feature/issue-123-add-login`).

## Examples

```
feat/add-star-tooltip
fix/system-panel-null-ref
hotfix/security-patch
release/v1.2.0
chore/update-dependencies
```
