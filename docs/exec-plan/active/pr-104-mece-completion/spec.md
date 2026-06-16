---
slug: pr-104-mece-completion
title: "PR #104 ADR MECE 완성 후 머지"
type: spec
date: 2026-06-16
---
# Deep Interview Spec: PR #104 MECE 완성 후 머지

## Metadata
- Interview ID: 57055a5d-0067-410d-ba9e-a61d236b7157
- Rounds: 4 (+ Round 0 토폴로지 게이트)
- Final Ambiguity Score: 7%
- Type: brownfield
- Generated: 2026-06-16T04:08:17Z
- Threshold: 0.05
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED (전 차원 ≥0.90; 잔여 7%는 실행-디스커버리, closure PASS)
- Auto-Researched Rounds: []
- Auto-Answered Rounds: []
- Architect Failures: 0
- Lateral Reviews: 2 (R2후 initial->progress; R3후 progress->refined)
- Lateral Panel Failures: 0
- Refined Rounds: [1, 3, 4]
- Closure Overrides: none
- Restated Goal: 오늘 PR #104를 진짜 MECE(active 문서.코드 참조 내용은 successor에 모두 포함, 순수 역사는 폐기)로 고쳐 main에 머지 — live-ref 손실 타깃 복원 + dangling 참조 전수 수정 + ADR-022/023->029/030 번호충돌 해소.

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.3325 |
| Constraint Clarity | 0.92 | 0.25 | 0.2300 |
| Success Criteria | 0.91 | 0.25 | 0.2275 |
| Context Clarity | 0.90 | 0.15 | 0.1350 |
| **Total Clarity** | | | **0.9250** |
| **Ambiguity** | | | **0.0750** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 축 문서 정리 (axis-docs) | active | PR #104를 MECE-complete로 고쳐 머지 | 아래 Acceptance Criteria 전부 커버 |
| Bulk PR 분할 & 머지 (pr-split) | deferred | 나머지 5개 size/XL PR(#106,#105,#103,#99,#98) one-thing 분할 | **Deferred (R2 사용자 확정):** 오늘 범위를 #104만으로 좁힘; 나머지 분할은 별도 진행 |

## Established Facts
1. **axis docs = PR #104** (ADR MECE reorg, branch docs/101-..., +745/-1082, 42f, size/XL, base=main) - R1, confirmed
2. **오늘 범위 = PR #104만**; 나머지 5 PR 분할 defer - R2, confirmed
3. **폐기 ADR 조건**: 콘텐츠 보존(successor 흡수) 필수 + MECE 유지 - R3, confirmed
4. **#104 처리 = minimal-fix-then-merge** (분할 안 함) - R3, confirmed
5. **VERIFIED**: ADR-005 검증수치(Room 502 25%, 301 51.3%)는 main ADR-005:230-232에 있으나 PR 브랜치 docs/decisions/ 전체에 미보존 - R3, verified
6. **MECE 기준** = active 문서/코드 참조 내용은 successor에 포함(collectively exhaustive), 순수 역사 근거는 폐기 OK - R4, confirmed
7. **VERIFIED**: ADR-005 수치는 active doc docs/research/adversarial-fall-detection-redesign.md:26,61-62가 인용 -> live-referenced - R4, verified
8. **번호 결정**: #104의 ADR-022..028 동결, pending serving-predict 예약을 ADR-029(predict-contract)/030(inference-layer)로 이동; PR#105 후보 ADR-031..034 - R4, confirmed
9. **003/004/007 audit**: 전부 PARTIAL (active 절 생존, 구체 근거/수치 일부 손실; ADR-003 최대) - R4, confirmed

## Trigger Metadata
| Round | Trigger | Status | Affected | Prior->New Ambiguity | Evidence |
|-------|---------|--------|----------|----------------------|----------|
| 1 | none | none | axis-docs/goal | 100%->62% down | PR #104 = axis 확정 |
| 2 | scope-contraction (non-trigger) | none | pr-split defer | 62%->41% down | 모호한 절반 defer |
| 3 | A 전제모순 (사용자 "내용흡수" vs 검증 "ADR-005 손실") | resolved | axis-docs/constraints | 41%->19% down | 같은 라운드 option A로 해소 |
| 4 | MECE 재프레임(보존 바 재개) | resolved | axis-docs/constraints | 19%->7% down | ADR-005 live-referenced 검증 -> MECE=collectively-exhaustive-for-live-refs |

## Lateral Review Panel
- **Panel #1** (R2후, initial->progress; researcher/contrarian/simplifier): #104가 단순 이동 PR 아님 - ADR-003/004/005/007 삭제(콘텐츠 손실), dangling 참조(ml/demo/*.py), ADR-022/023 번호충돌. 합의=minimal-fix-then-merge.
- **Panel #2** (R3후, progress->refined; researcher/contrarian/architect): 003/004/007 전부 PARTIAL(ADR-003 최대); 전체 복원 5-10h=not-safely-today; 번호 재배정 CLEAR(#104 동결, pending->029/030, PR#105->031..034); dangling 과소집계 경고(research:61-62,283).
- Lateral Panel Failures: 0

## Goal
오늘 PR #104를 **진짜 MECE**(active 문서.코드가 참조하는 내용은 successor에 모두 포함되는 collectively-exhaustive 상태, 순수 역사 근거는 supersession으로 폐기)로 고친 뒤 main에 머지한다. 즉 ADR-005 검증수치 등 **live-referenced 손실분만 타깃 복원** + **dangling 참조 전수 수정** + **ADR-022/023->029/030 번호충돌 해소**.

## Constraints
- MECE 기준 = collectively exhaustive **for live-referenced content** (순수 역사 근거 폐기 허용).
- 콘텐츠 보존: active 문서/코드가 의존하는 내용은 손실 금지.
- #104는 **분할하지 않음** (단일 PR 머지).
- worktree 규칙: main 직접작업 금지 - #104 브랜치 docs/101-reorganize-adr-corpus-into-mece-decision-categorie에서 작업(git wt). pre-push freshness 가드 준수.
- size-CI는 soft(라벨/코멘트만) - size/XL이어도 머지 차단 안 됨.
- today 데드라인: 타깃 복원 범위라 실현가능(panel: feasible-but-tight).

## Non-Goals
- 나머지 5개 XL PR(#106,#105,#103,#99,#98) 분할 - 오늘 범위 밖(defer).
- 멀티에이전트 fan-out - #104 단일 PR이라 오늘 불필요.
- 폐기 ADR의 순수 역사 근거 전량 복원 - 불필요.
- size-CI 하드 게이트/거버넌스(이슈 #110) 작업 - 별개.

## Acceptance Criteria
- [ ] PR #104가 main에 머지됨.
- [ ] ADR-005 검증수치(Room 502 25%, Room 301 51.3%) + 검증 표/OOD 결론이 successor ADR(025/026/027 중 적합)에 존재 (successor에서 51.3 검색 hit).
- [ ] ADR-003/004/007의 live-referenced 내용이 successor에 존재 (live-ref sweep 확인). 순수 역사 근거는 폐기 허용.
- [ ] dangling 참조 0: ml/demo/app.py:5,175, ml/demo/live_view.py:40-41, ml/demo/model_modules.py:25, docs/research/adversarial-fall-detection-redesign.md:26,61-62,283 + 전수 sweep.
- [ ] 번호충돌 해소: docs/exec-plan/active/serving-predict-real-inference/plan.md,spec.md의 ADR-022/023 예약 -> ADR-029(predict-contract)/030(inference-layer); #104의 ADR-022..028 유지.
- [ ] docs/decisions/README.md 인덱스 링크 전부 resolve, dead link 0.
- [ ] #104는 분할되지 않음.

## Deferrals
- **pr-split (사용자 확정 R2):** 나머지 5개 size/XL PR(#106,#105,#103,#99,#98) 분할 - 오늘 범위 밖, 별도 진행. (멀티에이전트 fan-out은 그 작업의 실행 방식)
- **Convergence Pacing (skill deferral):** min-round floor / score-drop cap / confidence dampening 없음 - bidirectional scoring이 pacing 메커니즘.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "PR 다 쪼개서 오늘 전부 merge" | 6 XL 전부 분할+머지가 오늘 가능? | R2: #104만, 나머지 defer |
| "축 docs = 모호/새 문서" | 어떤 문서? | R1: 기존 열린 PR #104 |
| "#104 그냥 머지하면 됨" | 패널: 단순 이동 아님(손실/dangling/충돌) | R3: minimal-fix-then-merge |
| "내용 다 흡수됨" | 검증: ADR-005 수치 미보존 | R3/R4: 손실 확인, 복원 필요 |
| "전체 복원 후 오늘 머지" | 패널: 5-10h, not-safely-today | R4: MECE=live-ref 타깃 복원 -> feasible |
| "MECE면 자동 보존" | 검증: 빠진 수치가 live-referenced | R4: MECE=collectively-exhaustive for live-refs |

## Technical Context (brownfield)
- main 클린. PR #109 머지 -> .github/workflows/pr-check.yml size 게이트(soft) + size/XL 라벨 + base=main 가드 + draft notice.
- PR #104: branch docs/101-reorganize-adr-corpus-into-mece-decision-categorie, +745/-1082, 42f, size/XL, base=main, not draft.
- #104가 ADR-022..028 successor 생성 + ADR-003/004/005/007 삭제. README 매핑: 003->015/022/023/024, 004->012, 005->025/026/027, 007->012/015.
- live-ref 검증: docs/research/adversarial-fall-detection-redesign.md:26,61-62가 ADR-005 수치 인용; ADR-005는 architecture.md:126,222, serving-predict plan/spec 등에서 광범위 참조.
- 번호충돌: docs/exec-plan/active/serving-predict-real-inference/plan.md:126-129가 ADR-022/023를 다른 결정으로 예약.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| PR | core domain | number, size_label, additions, deletions, files, branch, base, draft | PR<->Issue, PR->sub-PRs |
| ADR | core domain | number, category(MECE), status(active/retired/superseded), successor | ADR<->code/docs 참조, retire->successor 매핑 |
| Issue | supporting | number, type label | Issue->branch->PR |
| Branch/Worktree | supporting | <type>/<issue#>-<slug> | git wt |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 4 | 0 | 0 | 4 | 100% (Agent 제거: 멀티에이전트 defer) |
| 3 | 4 | 0 | 1 | 3 | 100% |
| 4 | 4 | 0 | 0 | 4 | 100% (수렴) |

## Interview Transcript
<details>
<summary>Full Q&A (Round 0 + 4 rounds)</summary>

### Round 0 - 토폴로지 게이트
**Q:** 최상위 컴포넌트 2개(축 문서 / Bulk PR 분할)로 읽음. 멀티에이전트는 분할의 실행 방식?
**A:** 맞다 - 2개, 멀티에이전트는 PR 분할의 실행 방식.

### Round 1 - axis-docs / Goal
**Q:** 축이 되는 docs가 구체적으로 뭐냐?
**A:** 이미 열린 docs 리팩토링 PR을 먼저 고치는 것 - PR #104. (Refine: 그대로 진행)
**Ambiguity:** 100%->62%

### Round 2 - pr-split / Goal
**Q:** 오늘 전부 merge의 전부가 정확히 뭐냐?
**A:** 일단 docs만 고쳐 -> 확인: 오늘은 #104만, 나머지 5 PR 분할 defer.
**Ambiguity:** 62%->41%

### Round 3 - axis-docs / Constraints
**Q:** (패널 fold) #104를 끝낸다가 정확히? 폐기 ADR 정책?
**A:** 내용이 안 사라지고 MECE하면 폐기 OK -> 검증: ADR-005 손실 확인 -> option A.
**Ambiguity:** 41%->19%

### Round 4 - axis-docs / Constraints
**Q:** (패널 fold) 전체 복원은 not-safely-today. deadline vs scope?
**A:** 그냥 MECE하게 쪼개면 됨 -> 검증: ADR-005 수치 live-referenced -> MECE=collectively-exhaustive-for-live-refs, 타깃 복원 오늘 머지.
**Ambiguity:** 19%->7%

</details>
