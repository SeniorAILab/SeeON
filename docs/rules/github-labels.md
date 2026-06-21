# GitHub Labels

Label taxonomy for issues and PRs. The `type:` label is the source of truth for the
`<type>` component of branch names (see `docs/rules/worktree-workflow.md`).

## Taxonomy

### Type (required — drives branch `<type>`)

| Label | Suggested color | Meaning |
|-------|----------------|---------|
| `type: feat` | `#0075ca` | New feature or capability |
| `type: fix` | `#d73a4a` | Bug fix |
| `type: chore` | `#e4e669` | Tooling, dependencies, config, CI |
| `type: docs` | `#0075ca` | Documentation only |
| `type: refactor` | `#cfd3d7` | Code change that neither fixes a bug nor adds a feature |
| `type: test` | `#cfd3d7` | Test-only changes |

Every issue must have exactly one `type:` label. `git wt` falls back to `feat` when
missing, but the label should always be set explicitly.

### Domain (optional — narrows triage and search)

| Label | Meaning |
|-------|---------|
| `domain: ml` | ML training, inference, model artifacts |
| `domain: backend` | NestJS API / KakaoTalk webhooks |
| `domain: frontend` | Vite + React dashboard |
| `domain: infra` | Deployment, CI/CD, Docker |
| `domain: data` | Data pipeline, preprocessing, labeling |
