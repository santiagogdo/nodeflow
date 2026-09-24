# Conventional Commits (repo standard)

## Format

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

## Rules

- Use `feat` for new features and `fix` for bug fixes.
- Other types are allowed (examples: `build`, `chore`, `ci`, `docs`, `style`,
  `refactor`, `perf`, `test`).
- Scope is optional and uses parentheses: `feat(parser): ...`.
- Indicate breaking changes with `!` before `:` or with a footer:
  `BREAKING CHANGE: ...`.
- Footers use `Token: value` or `Token #value` format; tokens use `-` instead of
  spaces.

### Examples

#### Commit message with description and breaking change footer

```
feat: allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for extending other config files
```

#### Commit message with ! to draw attention to breaking change

```
feat!: redesign npc AI system
```

#### Commit message with scope and ! to draw attention to breaking change

```
feat(ai)!: redesign npc AI system
```

#### Commit message with both ! and BREAKING CHANGE footer

```
chore!: update to .NET 10

BREAKING CHANGE: use .NET 10 features not available in .NET 9.
```

#### Commit message with no body

```
docs: correct spelling of CHANGELOG
```

#### Commit message with scope

```
feat(lang): add Polish language
```

#### Commit message with multi-paragraph body and multiple footers

```
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.

Reviewed-by: Z
Refs: #123
```
