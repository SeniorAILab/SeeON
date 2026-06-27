---
slug: agents-md-issue-driven-flow
type: plan
status: done
date: 2026-06-16
author: gobeumsu
planner: ralplan
issue: 167
prs: [171, 173, 175, 178, 179]
adrs: [ADR-008] # ADR-039 + ADR-040 folded into ADR-008 (2026-06-27, #393)
source: ralplan consensus final (gjc workflow scratch, gitignored)
note: >-
  ralplan 합의(Planner/Architect/Critic, 2 iterations, Critic APPROVE) 최종안.
  PR5 lint job은 prisma-generate 누락으로 깨지고 동시 추가된 풀 CI와 중복이라 실행 중 제거(별도 follow-up).
---

# RALPLAN-DR 최종 계획 (pending approval): AGENTS.md issue-driven 개발 흐름 재구성

> 상태: **pending approval**. 합의 완료(Planner→Architect→Critic, 2 iterations). 실행/머지/PR 생성/원격 라벨 삭제/소스 변경은 **별도 승인 전 금지**. 사용자 한국어 세션 — 서술 한국어, 코드/경로 원문.
> 출처 spec: `.gjc/specs/deep-interview-agents-md-issue-driven-flow.md`
> 상세 슬라이스 명세(권위본): `.gjc/plans/ralplan/2026-06-16-ports-compose/stage-05-revision.md`

## 합의 기록 (Consensus Record)
| Pass | Stage | Verdict | 산출물 |
|------|-------|---------|--------|
| 1 | Planner | plan 작성(5 PR fan-out) | `.gjc/plans/ralplan/probe/stage-02-planner.md` |
| 1 | Architect | `WATCH` / `COMMENT` (0.88) | `.../2026-06-16-ports-compose/stage-03-architect.md` |
| 1 | Critic | `ITERATE` (0.86, 5 required changes) | `.../stage-04-critic.md` |
| 2 | Planner(revision, fresh-spawn fallback) | 7개 수정 반영 | `.../stage-05-revision.md` |
| 2 | Architect | `WATCH` / **`APPROVE`** (0.93) | `.../stage-06-architect.md` |
| 2 | Critic | **`OKAY/APPROVE`** (High, 0 changes) | `.../stage-07-critic.md` |

> 감사 주: 서브에이전트별 ralplan run-id가 `probe`/`2026-06-16-ports-compose`로 분산되었음(런타임 run-id 해소 quirk). 콘텐츠는 전부 정상 persisted이며 위 경로로 추적 가능. Planner 재기동은 `3-RalplanPlanner` not_found로 resume 실패 → fresh-spawn fallback(사유 `not_found`, fallback-stage-n 5) 기록.

## 한 줄 목표
AGENTS.md를 issue-driven 개발 흐름 중심으로 재구성(상단 슬림 `## Development Flow` + `.gjc` peer 등재) + priority 라벨 제거 + CI(사이즈 하드게이트 로직 churn 500→1000, 전 생태계 lint, 신규 이슈 auto-label) 도입을, 단일 이슈 `#N`에 매핑되는 5개 리뷰 가능 fan-out PR로 분해.

## RALPLAN-DR 요약
### Principles
1. SSOT 우선 — AGENTS.md는 high-level routing, 상세는 docs/rules·workflow 링크.
2. 단일 이슈 fan-out — spec 1건 = issue `#N`, PR은 size/M 이하.
3. 기존 인프라 보존 — ADR-008, `git wt`, gstack, `.omc/.omo/.omx`, 현 hard gate 구조 유지.
4. 로직 기반 hard gate 유지 — marker block 정합, 임계만 500→1000.
5. 최소 자동화 — lint CI + issue auto-label만, branch protection/full CI/concurrency/artifact 제외.

### Decision Drivers
1. 문서/라벨/CI는 reviewer 관심사가 달라 PR 분리 필요.
2. type 라벨·branch shape·size 게이트·ADR이 하나의 governance 흐름을 설명해야 함.
3. pr-check.yml marker block과 원격 라벨 삭제는 작은 독립 단위로.

### Viable Options
- **A 단일 이슈 fan-out — 채택**: spec 추적성 + 작은 PR, pr-decomposition fan-out 모델 정합. (same-file coupling은 순서/rebase로 관리)
- B 컴포넌트별 별도 이슈: owner/rollback 경계 선명하나 Principle 2(단일 이슈 fan-out) 직접 위반.
- C CI 먼저: feat fallback 위험 조기 완화하나 Principle 1/3 위반(설명 전에 automation 선행).
- D docs 먼저·CI 후속 — **채택 ordering**: Development Flow/label taxonomy가 기준을 세우고 CI가 자동화.

## 5개 fan-out PR (요약 — 상세는 stage-05-revision.md)
| PR | Title | Branch | Files | Dep / Order |
|----|-------|--------|-------|-------------|
| 1 | Document issue-driven development flow | `chore/<issue#>-development-flow` | `AGENTS.md` | first merge |
| 2 | Register gjc scratch locations | `chore/<issue#>-gjc-scratch-locations` | `AGENTS.md` | PR1 merge 후 rebase (same-file) |
| 3 | Remove priority label taxonomy | `chore/<issue#>-remove-priority-labels` | `docs/rules/github-labels.md` | PR1 이후 병렬; `gh label delete priority:*`는 merge 후 운영 단계 |
| 4 | Align PR size governance threshold | `chore/<issue#>-size-threshold-governance` | `.github/workflows/pr-check.yml`, `docs/rules/pr-decomposition-and-review.md` | PR5보다 먼저 |
| 5 | Add lint CI automation | `chore/<issue#>-lint-and-issue-autolabel` | `.github/workflows/pr-check.yml`, `.github/workflows/issue-auto-label.yml` | last; PR4 merge 후 rebase (same-file) |

핵심 실행 제약(합의 반영):
- **PR4**: `// === SIZE-CHECK-LOGIC-START/END ===` marker block 내부·주변의 **모든 500 기반 hard-gate 문자열**(predicate, `core.setFailed`, `overrideNote`, top-of-file comment, console text, advisory comment)을 1000으로 갱신. 버킷 경계 `M<=500`은 bucket 의미로만 유지. harness 추출 가능하도록 JS self-contained/valid 유지.
- **PR5**: `issue-auto-label.yml`은 `permissions: {contents: read, issues: write}` 명시, **fail-closed** 파싱(unknown/missing/malformed Type → 라벨 미부여·cleanup 미실행·명시적 실패), **`type: feat` 등 default fallback 절대 금지**. 정상 parse일 때만 기존 `type:` 라벨 제거 후 1개 부여. `domain:`/`priority:*`/size/기타 라벨 보존. backend lint는 `--fix` 회피 위해 `pnpm --filter backend exec eslint` 직접 호출.

## Acceptance Criteria 매핑 (16개 전부 검증 보유)
권위본 표는 `stage-05-revision.md` `## Acceptance criteria mapping` 참조. 모든 spec AC가 (슬라이스 + 구체 테스트가능 검증)으로 매핑됨 — orphan 없음(Critic pass 2 확인). 대표 검증:
- PR1: 섹션 순서 Waypoint→Development Flow→Artifact Ontology, 5개 링크 존재, SSOT(명령/YAML 미복제).
- PR4: marker block hard-gate 문자열 전부 1000 통일, `M<=500`은 bucket only.
- PR5: 6개 Type 옵션 매핑 + malformed/missing fail-closed + 중복 `type:` cleanup + 비-type 라벨 보존.

## ADR (distill)
### ADR-NNN — PR size hard-gate 임계 500 → 1000 (common/, 실행 중 작성)
- **Decision**: `pr-check.yml` 로직 churn hard-fail 임계를 500→1000으로 완화. 로직기반·하드 구조, `size/override` escape hatch, 분류 제외(docs/test/migration/lock), base/draft job, 버킷(S≤100/M≤500/L≤1000/XL>1000) 보존. hard fail은 XL(>1000)만.
- **Drivers**: 로직 500은 리뷰 단위로 과도하게 빡빡; oh-my-claudecode 1000 관행 정합; fan-out PR로 큰 작업 흡수.
- **Alternatives considered**: (a) 500 유지; (b) raw 1000 교체 — researcher가 "퇴보" 경고(분류 제외 상실); (c) **로직 1000 — 채택**; (d) 500 로직 + raw 1000 이중 게이트.
- **Why chosen**: 로직기반의 정밀함 유지 + "1000 하드" 직관 충족, raw 교체의 퇴보 회피.
- **Consequences**: L(501–1000 로직) PR이 더 이상 hard-block 안 됨 → `pr-decomposition-and-review.md`에서 "L 권고분할 / XL만 하드"로 정합(PR4 포함). 거버넌스 *완화* 결정이라 ADR 기록 필수.
- **Follow-ups**: branch protection required-check는 별도 이슈; ADR 본문은 PR4 실행 시 `docs/decisions/common/`에 작성.

### 추가 ADR distill 후보 (실행 중 작성)
- **ADR-NNN `.gjc` peer 에이전트 scratch/runtime 등재** (common/) — `.gjc`를 `.omc/.omo/.omx`와 동급 도구로 공식화(교체 아님).
- **ADR-NNN issue Type auto-label → `git wt` branch type 소스** (common/) — issue form Type 자동 라벨링이 enforced branch naming과 연결됨.

## Risks (요약, 상세 stage-05-revision.md)
- pr-check 500-문자열 누락 → PR4 marker-block 집중 리뷰로 전부 1000 통일.
- backend lint `--fix` 변이 → PR5에서 eslint 직접 호출(스크립트 미사용).
- auto-label 파싱 취약 → issues:write + fail-closed + 폴백 금지 + 보존 reasoning 테스트.
- `.gjc`를 교체로 오해 → PR2가 명시적으로 peer/보존 서술.
- same-file PR 충돌 → PR1→PR2, PR4→PR5 순서 + 후행 PR rebase.

## Handoff guidance
- **pending approval** — 승인 전 실행 금지.
- 승인 시 기본 실행 경로: `/skill:ultragoal` (5개 bounded PR 슬라이스 순차/병렬 구동, executor로 슬라이스 위임). `/skill:team`은 tmux 동시 worktree 오케스트레이션이 정말 필요할 때만.
- PR1↔PR2, PR4↔PR5는 same-file이라 순서/rebase 유지. PR4/PR5는 workflow semantics 독립 리뷰 권장.
