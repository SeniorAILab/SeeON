---
slug: agents-md-issue-driven-flow
type: spec
status: done
date: 2026-06-16
author: gobeumsu
interview: deep-interview
issue: 167
prs: [171, 173, 175, 178, 179]
adrs: [ADR-008] # ADR-039 + ADR-040 folded into ADR-008 (2026-06-27, #393)
source: deep-interview spec (gjc workflow scratch, gitignored)
note: >-
  deep-interview 산출 spec을 plan-first mandate 라이프사이클에 맞춰 git-canonical archive로 이관.
  작업은 5개 fan-out PR로 머지 완료(status: done).
---

# Deep Interview Spec: AGENTS.md issue-driven 개발 흐름 재구성

## Metadata
- Interview ID: 019ecfe1-aa47-7000-9fe2-b99c34519050
- Rounds: 10 (+ Round 0 topology gate, + Restate gate)
- Final Ambiguity Score: 14%
- Type: brownfield
- Generated: 2026-06-16
- Threshold: 0.05 (5%)
- Threshold Source: default
- Initial Context Summarized: no
- Status: BELOW_THRESHOLD_EARLY_EXIT — 정보 기반 조기 종료. 잔여 14%는 요구사항 모호성이 아니라 fan-out PR 슬라이싱 / 정확한 CI yaml·auto-label 구현 같은 **계획·실행 디테일**이며 ralplan으로 명시 이관.
- Auto-Researched Rounds: []
- Auto-Answered Rounds: []
- Architect Failures: 0
- Lateral Reviews: 1 (R1, milestone `initial→progress`; personas: researcher, contrarian, simplifier)
- Lateral Panel Failures: 1 (simplifier — 유효 산출물 없음, 조용히 폴백)
- Refined Rounds: [1]
- Closure Overrides: none
- Restated Goal: 아래 ## Goal 참조

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.85 | 0.25 | 0.2125 |
| Success Criteria | 0.84 | 0.25 | 0.210 |
| Context Clarity | 0.86 | 0.15 | 0.129 |
| **Total Clarity** | | | **0.866** |
| **Ambiguity** | | | **0.14** |

## Topology
Round 0에서 잠근 최상위 컴포넌트. active 3 / deferred 2.

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| AGENTS.md 흐름 재구성 | active | issue-driven 루프를 AGENTS.md의 1급 흐름으로 승격·재서술 | Acceptance §AGENTS.md 전부 커버 |
| priority 라벨 제거 | active | github-labels.md priority 라벨 taxonomy 제거 | Acceptance §priority 라벨 전부 커버 |
| CI omc 도입 | active | 사이즈 하드게이트 완화 + lint job + auto-label | Acceptance §CI 전부 커버 |
| 이슈→worktree→브랜치→PR 루프 규약 | deferred | 이미 존재(ADR-008, worktree-workflow.md, `git wt`) | 변경 대상 아님, 흐름에서 참조만 |
| 리뷰 가능 PR 분해 정책 | deferred | 이미 존재(pr-decomposition-and-review.md) | 변경 대상 아님, 흐름에서 참조만 (단 L/XL 문구 정합은 CI 컴포넌트에 포함) |

## Established Facts
| # | Fact | Source Round | Status |
|---|------|--------------|--------|
| F1 | plan-first는 유지·전제(폐기 안 함) | R1 | confirmed |
| F2 | AGENTS.md = high-level/routing 전용; 흐름을 1급 명시하되 상세는 docs/에 위임(SSOT 준수) | R1 | confirmed |
| F3 | 흐름 = plan→issue→worktree→branch→PR→review→merge→ADR distill 전체 | R1 | confirmed |
| F4 | 기존 AGENTS.md 내용(ADR 서술 등) 흐름 관점 재배치/재명명 허용 | R1 | confirmed |
| F5 | oh-my-claudecode를 high-level routing 서술 학습 모델로 참고 | R1 | confirmed |
| F6 | worktree/PR rule 문서·CI 이미 존재 (ADR-008, rules, pr-check.yml) | R0 | confirmed (현재 상태) |
| F7 | priority 라벨 제거 요청 (github-labels.md) | R2 | confirmed |
| F8 | CI: oh-my-claudecode에서 배울 점 도입 | R2 | confirmed (R6에서 구체화) |
| F9 | `git wt`는 issue `type:` 라벨로 branch `<type>` 결정(없으면 feat 폴백) → 이슈 단계에 type 라벨 1개 필수 | R2 | codebase-verified |
| F10 | 3개 컴포넌트 모두 이번 작업 번들, PR은 fan-out 리뷰가능 크기로 분해 | R3 | confirmed |
| F11 | pr-check.yml 하드 게이트 임계 로직 churn 500→1000 완화(하드·로직기반 유지) | R5 | confirmed (F6 현재상태를 변경하는 결정) |
| F12 | CI 추가 = lint CI job + 신규 이슈 auto-label. 풀 typecheck/test/build·concurrency·artifact 제외 | R6 | confirmed |
| F13 | priority 라벨 제거 = github-labels.md Priority/Priority criteria 섹션 삭제 + `gh label delete priority:*`. 기존 이슈 라벨 미터치 | R7 | confirmed |
| F14 | gjc/.gjc는 .omc/.omo/.omx와 동급 또 다른 에이전트 도구 → AGENTS.md에 peer scratch dir로 추가, 기존 항목·gstack 제거 안 함 | R9 | confirmed |
| F15 | lint job = 전 생태계(front+backend eslint + ml ruff), CI 실행만. branch protection required-check는 별도 follow-up | R10 | confirmed |

## Trigger Metadata
| Round | Trigger | Status | Affected Component / Dimension | Ambiguity | Evidence | Resolution |
|-------|---------|--------|-------------------------------|-----------|----------|------------|
| R2 | D (scope expansion) | resolved | ci-omc-adoption / goal | 0.30→0.65 ▲ | priority 라벨 제거 + CI 도입이 Round 0 deferral 재오픈 | R3 범위 경계 확정(전부 번들+fan-out)으로 흡수 |
| R4 | A (contradiction) | resolved | ci-omc-adoption / constraints | 0.57→0.61 ▲ | "1000줄 하드"가 F6(기존 로직 churn 500 하드, 더 엄격)과 모순 | R5에서 "로직 churn 500→1000 완화(하드 유지)"로 해소 |

미해결/disputed 트리거: 없음. F6은 "현재 상태" 사실로 보존되며 F11이 이를 변경하는 결정(분쟁 아님).

## Lateral Review Panel
R1 milestone 전이(`initial→progress`)에서 1회 소집, 독립 컨텍스트 read-only 3 페르소나.
- **contrarian (high):** 옵션 (c) — AGENTS.md엔 슬림 Development Flow 개요/다이어그램 + 링크만. 큰 서술/중복 rules 페이지 금지. SSOT 위험 회피. → 사용자의 "high-level routing only" 결정과 일치.
- **researcher (high, 외부 fetch 성공):** ① 6~8줄 ladder로 docs/에 라우팅(복붙 금지) ② omc raw-1000 PR-check은 그대로 가져오면 퇴보(우리는 로직 churn>500로 이미 강함) ③ omc엔 있고 우리엔 없는 것: 풀 CI / concurrency·artifact / 신규 이슈 auto-label ④ 이슈 form `labels:[]` → type 라벨 수동 부여 필수(아니면 `git wt` feat 폴백) ⑤ 브랜치 보호/required-check 미확인.
- **simplifier:** 유효 산출물 없음 → lateral_panel_failures += 1, 조용히 폴백.
- 이후 milestone 전이(progress↔refined)는 동일 주제라 findings 재사용, 중복 패널 미소집.

## Goal
**AGENTS.md를 issue-driven 개발 흐름 중심으로 재구성한다.** 구체적으로: AGENTS.md 상단(Waypoint 다음, Artifact Ontology 앞)에 `plan/spec(기존) → 이슈 생성(type: 라벨 1개) → git wt <issue#> (worktree/branch) → 작업 → PR(리뷰가능 크기, 필요시 fan-out) → 리뷰 → 머지 → plan archive + ADR distill`을 잇는 **슬림한 `## Development Flow` 섹션**(작은 다이어그램 + 6~8줄 ladder + 단계별 docs 링크)을 추가하고, `.gjc/`를 `.omc/.omo/.omx`와 동급 peer scratch 도구로 등재한다. 동시에 **priority 라벨 taxonomy를 제거**하고, **CI에 사이즈 하드게이트 완화(로직 churn 500→1000)·lint job(전 생태계)·신규 이슈 auto-label workflow**를 도입한다. 이 모든 변경은 **리뷰 가능한 fan-out PR**로 분해해 머지한다 (= 작업 자체에 issue-driven 원칙을 dogfooding).

## Constraints
- plan-first 라이프사이클은 그대로 유지(전제). 폐기/약화하지 않는다.
- AGENTS.md는 high-level / routing 성격 유지 — 상세 git 명령이나 yaml을 중복 기재하지 않고 `docs/`의 담당 문서로 라우팅(SSOT / no-duplication 준수).
- 기존 `.omc/.omo/.omx` 및 `gstack` 섹션은 제거하지 않는다. `.gjc/`는 peer로 **추가**만.
- 기존 worktree/PR rule 문서·CI 게이트의 **로직 churn 기반·하드 구조**는 유지하고, 임계 숫자만 변경(500→1000).
- 모든 변경은 한 이슈 #에 매핑되는 리뷰 가능(size/M 이하 권장) fan-out PR로 분해. 한 PR = 한 리뷰 단위.
- 흐름의 이슈 단계는 `type:` 라벨 정확히 1개를 요구해야 한다(`git wt`의 `feat` 폴백 방지).

## Non-Goals
- branch protection / required-status-check 설정 (별도 follow-up — 기존 결정 유지).
- 풀 CI(typecheck/test/build), concurrency 취소, artifact 업로드, version check 도입.
- `worktree-workflow.md` / `pr-decomposition-and-review.md` 본문 재작성(참조만). 단 `pr-decomposition-and-review.md`의 size/L 분할 문구를 새 하드 임계와 정합화하는 것은 포함.
- 기존 GitHub 이슈/PR에 이미 붙은 `priority:*` 라벨 청소.
- `gstack` 섹션 제거/현행화, `.omc→.gjc` 경로 일괄 치환.
- 새 기능(프로덕트) 코드 작성.

## Acceptance Criteria

### AGENTS.md 흐름 재구성
- [ ] AGENTS.md 상단(Waypoint 다음, Artifact Ontology 앞)에 `## Development Flow` 슬림 섹션이 존재.
- [ ] 해당 섹션에 plan→issue→worktree→PR→review→merge→archive+ADR ladder(6~8줄) + 작은 다이어그램 포함.
- [ ] 각 단계가 담당 문서로 링크: `docs/rules/worktree-workflow.md`, `docs/rules/pr-decomposition-and-review.md`, `docs/rules/github-labels.md`, `docs/decisions/README.md`, `.github/workflows/pr-check.yml`.
- [ ] 상세 git 명령/yaml이 섹션에 중복 기재되지 않음(docs/ 위임 검증 — SSOT).
- [ ] 이슈 단계에 "`type:` 라벨 정확히 1개 필수" 명시.
- [ ] Waypoint tree + Locations 표에 `.gjc/`가 `.omc/.omo/.omx`와 동급 peer scratch dir로 추가되고, 기존 항목은 보존됨.
- [ ] 기존 plan-first/Lifecycle/ADR 서술이 흐름 관점에 맞게 재배치되되 내용 중복이 없음.

### priority 라벨 제거
- [ ] `docs/rules/github-labels.md`에서 `### Priority` + `## Priority criteria` 섹션 제거.
- [ ] 원격에 존재 시 `gh label delete 'priority: high' / 'priority: medium' / 'priority: low'`.
- [ ] 기존 이슈의 priority 라벨은 미터치(비목표 준수).

### CI (oh-my-claudecode 학습 도입)
- [ ] `.github/workflows/pr-check.yml` size 하드 게이트 임계: 로직 churn `> 500` → `> 1000` (코멘트/실패 메시지/버킷 경계 정합).
- [ ] `docs/rules/pr-decomposition-and-review.md`의 "size/L 또는 size/XL → 분할" 문구를 "L은 권고 분할, XL(>1000)만 하드 차단"으로 정합화.
- [ ] PR마다 lint를 실행하는 CI job: front+backend(pnpm eslint) + ml(ruff).
- [ ] 신규 이슈 생성 시 issue form의 Type → `type:` 라벨을 자동 부여하는 auto-label workflow.
- [ ] CI 체크는 실행만; branch protection required-check 승격은 하지 않음(비목표).

### Delivery
- [ ] 위 변경을 리뷰 가능(size/M 이하 권장) fan-out PR로 분해, 각 PR은 한 이슈 #에 매핑되고 PR body에 slice 경계 기록.

## Deferrals
- **토폴로지 deferral:** 이슈→worktree→branch→PR 루프 규약, 리뷰가능 PR 분해 정책 — 이미 존재(ADR-008, worktree-workflow.md, pr-decomposition-and-review.md). 흐름에서 참조만.
- **branch protection / required-check:** 별도 follow-up 이슈(기존 결정 유지).
- **풀 CI / concurrency / artifact / auto-label 외 omc 패턴:** 이번 제외, 필요 시 각각 별도 이슈.
- **Convergence Pacing deferral:** min-round floor / score-drop cap / 신뢰 dampening 등 명시적 pacing brake 추가하지 않음 — 양방향 채점이 pacing 메커니즘. (R2/R4에서 실제로 모호도가 상승하며 작동함.)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "issue-driven 흐름을 새로 도입한다" | 사실상 워크트리/PR/CI 인프라가 이미 존재(ADR-008, rules, pr-check.yml) — Round 0에서 노출 | 신규 도입이 아니라 AGENTS.md에 high-level 흐름 서술 추가 + 일부 정책 변경으로 재정의 |
| "AGENTS.md에 흐름을 상세히 적는다" | AGENTS.md의 SSOT/no-duplication 원칙과 충돌(contrarian/researcher) | high-level routing만, 상세는 docs/ 위임 |
| "omc의 1000줄 pre-check가 인상적 → 도입" | 우리 CI는 이미 로직 churn>500 하드(더 엄격·더 똑똑). raw 1000 도입은 퇴보(researcher) | 로직 churn 기반 하드 유지, 임계만 500→1000 완화 |
| "CI에서 omc를 더 배운다 = 풀 CI" | 풀 CI는 3 생태계라 비용 큼; 사용자 실제 관심은 게이트+선택적 패턴 | lint + auto-label만 채택, 풀 CI/concurrency 제외 |
| ".omc→.gjc drift를 고친다" | gjc는 또 다른 peer 도구일 뿐(사용자) | drift 수정이 아니라 .gjc를 peer로 추가, 기존 보존 |
| "라벨/CI 변경은 AGENTS.md 작업과 별개여야" | 사용자가 번들 선택, 단 fan-out PR로 분해 | 한 작업 = 여러 리뷰가능 PR (issue-driven dogfooding) |

## Technical Context (brownfield)
- **이미 존재하는 인프라:** `ADR-008`(issue-driven worktree, Accepted 2026-06-09), `docs/rules/worktree-workflow.md`(`git wt <issue#>`, git-guard 강제), `docs/rules/pr-decomposition-and-review.md`(리뷰가능 PR·size/M 목표·이슈→PR fan-out·PR body 템플릿), `.github/workflows/pr-check.yml`(oh-my-claudecode 이식; 로직 churn>500 hard gate + `size/override` escape hatch; S<=100/M<=500/L<=1000/XL>1000 버킷; base-branch + draft 체크), `docs/rules/github-labels.md`(type/domain/priority).
- **AGENTS.md 현 구조:** Waypoint(tree) → Artifact Ontology → Lifecycle(plan-first/exec-plan/ADR) → Locations → Conventions(worktree-workflow + PR-decomposition가 하위 항목, 189-198) → gstack 섹션. `.omc/.omo/.omx` scratch + gstack 참조 존재.
- **모노레포 생태계:** front(Next.js, pnpm) / backend(NestJS, pnpm) / ml(uv, python). lint = pnpm eslint(front+backend) + ruff(ml). 루트 `pnpm run lint` 존재.
- **이슈 템플릿:** `.github/ISSUE_TEMPLATE/task.yml`에 Type 드롭다운 있으나 `labels:[]` — 자동 라벨 워크플로 없음(researcher). → `git wt` `feat` 폴백 리스크.
- **외부 참조(researcher fetch):** oh-my-claudecode upstream의 PR-check은 raw additions+deletions, 1000줄 warn, dev/main base 허용 — 본 repo가 이미 로직 churn / hard 500 / 분류 제외 / main·release/*·hotfix/* base로 더 강하게 적응함.
- **미확인(unknown):** GitHub 원격 라벨 동기화 여부, branch-protection/ruleset 설정, 이슈 form Type→라벨 변환 실무 여부.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| AGENTS.md | core (artifact) | Waypoint, Artifact Ontology, Lifecycle, Locations, Conventions | SSOT; docs/rules·decisions로 라우팅 |
| Development Flow | core (new section) | ladder, diagram, step links | AGENTS.md에 추가; 각 단계→docs 매핑 |
| plan/exec-plan | supporting | spec.md, plan.md, slug | Issue 선행; merge 후 archive |
| Issue | core | number, `type:` 라벨 | branch/worktree 1:1 매핑; PR로 fan-out |
| Worktree/Branch | supporting | `<type>/<issue#>-<slug>` | `git wt`로 생성; Issue에서 파생 |
| PR | core | slice, size 버킷, review evidence | Issue에 매핑; CI 게이트 통과 후 merge |
| Review/Merge | process | review pass, merge | PR마다; merge 후 archive+ADR |
| ADR | supporting | NNN, category | merge 시 expensive 결정 distill |
| Label taxonomy | supporting | type/domain(/priority 제거) | Issue/PR에 부여; `git wt`가 type 사용 |
| CI workflow | core | pr-check(size/base/draft), lint, auto-label | PR/Issue 이벤트에서 실행 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 8 | 8 | - | - | N/A |
| 2 | 10 | 2 (Label, CI) | 0 | 8 | 0.80 |
| 3-10 | 10 | 0 | 0 | 10 | 1.00 (수렴) |

## Interview Transcript
<details>
<summary>Full Q&A (Round 0 + 10 rounds, 요약)</summary>

### Round 0 — Topology
**Q:** 최상위 컴포넌트 4개(AGENTS.md 재구성 / worktree 루프 / PR 분해 / CI 게이트)로 읽음. 2~4는 이미 존재. 맞나?
**A:** 맞아 — 2~4는 deferral, 1번 AGENTS.md 재구성 중심.

### Round 1
**Q:** plan-first와 issue-driven 관계 + AGENTS.md 변경 형태?
**A:** plan-first는 전제(당연). AGENTS.md에 high-level 개발 흐름 routing 서술 추가, 상세는 docs/ 위임. (Refine 확인됨)
**Ambiguity:** 30% (Goal 0.85, Constraints 0.7, Criteria 0.5, Context 0.85)

### Round 2 (사용자 자발 확장)
**A:** priority 라벨 제거 + CI omc 도입 추가.
**Ambiguity:** 65% ▲ — trigger D(범위 확장)

### Round 3
**Q:** 라벨/CI는 별도 이슈 vs 번들?
**A:** 전부 이번 작업 번들, PR은 fan-out 분해.
**Ambiguity:** 57%

### Round 4 (사용자 자발)
**A:** 1000줄 하드 게이트 원함.
**Ambiguity:** 61% ▲ — trigger A(F6 모순: 기존 로직 churn 500 하드가 더 엄격)

### Round 5
**Q:** 1000-하드 의미 해소?
**A:** 로직 churn 기반 하드 유지, 임계만 500→1000 완화.
**Ambiguity:** 47% — trigger A 해소

### Round 6
**Q:** 사이즈 게이트 외 omc CI 패턴?
**A:** lint job + 신규 이슈 auto-label (풀 CI·concurrency 제외).
**Ambiguity:** 32%

### Round 7
**Q:** priority 라벨 제거 범위?
**A:** github-labels.md Priority 섹션 삭제 + `gh label delete priority:*` (기존 이슈 미터치).
**Ambiguity:** 27%

### Round 8
**Q:** AGENTS.md Development Flow 섹션 모양?
**A:** 슬림 ladder + 다이어그램 + 단계별 링크, 상단 새 섹션.
**Ambiguity:** 26%

### Round 9
**Q:** .omc/gstack drift 처리?
**A:** gjc는 또 다른 peer 도구 → .gjc 추가, 기존(.omc/gstack) 보존.
**Ambiguity:** 26%

### Round 10
**Q:** lint 범위 + 머지 차단?
**A:** 전 생태계 lint, CI 실행만, branch protection 별도 follow-up.
**Ambiguity:** 14%

### Restate gate
**A:** 한 줄 목표 확인 → crystallize 승인.

</details>
