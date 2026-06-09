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
| `domain: frontend` | Next.js dashboard |
| `domain: infra` | Deployment, CI/CD, Docker |
| `domain: data` | Data pipeline, preprocessing, labeling |

### Priority

| Label | Meaning |
|-------|---------|
| `priority: high` | Blocks production, blocks other in-progress work, or is a user-impacting defect on the deploy path — handle next |
| `priority: medium` | Important to the current milestone but not blocking — default for planned feature work |
| `priority: low` | Nice-to-have; can be deferred indefinitely without milestone impact |

## Priority criteria

**high** — apply when ANY of the following hold:
- The issue is on the critical path to the next production deploy
- It blocks another issue that is already in progress
- It is a user-impacting defect (data loss, crash, wrong output) on a deployed path
- It has a hard external deadline (demo, partner review) within 48 h

**medium** — default for planned work:
- Feature is part of the current milestone but is not a blocker
- Refactor or infra work that improves quality without urgency
- Documentation that should ship alongside a feature

**low** — apply when:
- Nice-to-have improvement with no milestone dependency
- Work that can be deferred to a future milestone without impact
- Exploratory / spike work with no committed outcome
