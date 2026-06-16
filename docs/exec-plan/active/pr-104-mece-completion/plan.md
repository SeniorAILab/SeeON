---
slug: pr-104-mece-completion
title: "PR #104 ADR MECE 완성 후 머지"
type: plan
date: 2026-06-16
---
# PR #104 MECE 완성 및 머지 — FINAL (PENDING APPROVAL)

> **Consensus reached** (deliberate mode, run_id 2026-06-13-1528-f2cf): Architect **CLEAR / APPROVE** + Critic **OKAY** (pass 2).
> Loop: planner(40) -> architect(40 BLOCK) -> critic(40 REJECT) -> revision(41) -> architect(41 CLEAR/APPROVE) -> critic(41 OKAY).
> Source spec: `.gjc/specs/deep-interview-pr-104-mece-completion.md`. Execution NOT started — awaiting explicit user approval.

---


## Summary

PR #104는 `docs/101-reorganize-adr-corpus-into-mece-decision-categorie` 브랜치에서 ADR 코퍼스를 네 개 카테고리(`common/`, `backend/`, `frontend/`, `ml/`)로 재배치하고, 비-MECE source ADR-003/004/005/007을 retire한 뒤 successor ADR-022..028로 분해한 변경이다. 승인된 deep-interview spec에 따라, 이 계획은 PR #104를 분할하지 않고 main에 머지하되, active 문서/코드가 아직 의존하는 retired ADR 내용과 참조를 먼저 복구/정렬해 실제 MECE 상태로 만든다.

Revision 2의 핵심 변경은 **branch freshness를 최우선 게이트로 승격**한 것이다. #104 branch는 main의 `docs/exec-plan/active/serving-predict-real-inference/{plan.md,spec.md}` 및 `docs/research/bulk-pr-splitting-strategy.md`보다 오래됐으므로, 어떤 수정도 하기 전에 `origin/main`을 #104 branch에 반영해야 한다. freshen 후 해당 파일들이 branch에 존재하지 않으면 execution을 중단하고 branch update부터 해결한다.

계획 상태: **PENDING APPROVAL**. 실행자는 승인 전 product source, docs source, merge, commit, push를 수행하지 않는다.

## RALPLAN-DR summary

### Principles

1. **Fresh branch before edits**: 오래된 PR branch에서 없는 파일을 renumber했다고 착각하지 않도록, 첫 단계는 항상 `origin/main` 반영과 파일 존재 확인이다.
2. **Live-reference preservation first**: active 문서/코드가 참조하는 retired ADR 내용은 반드시 successor에 존재해야 하며, 순수 역사 근거만 git history/allowlist로 남길 수 있다.
3. **MECE over nostalgia**: retired ADR stub 부활 대신 atomic successor ADR에 필요한 내용을 흡수해 visible corpus를 MECE로 유지한다.
4. **Number stability**: PR #104의 ADR-022..028은 동결하고, 충돌하는 future reservation은 ADR-029..034로 이동한다.
5. **Executable documentation**: 링크와 참조는 search/link-check로 검증 가능한 상태여야 하며, live dangling retired ADR 참조는 0이어야 한다.

### Decision Drivers — top 3

1. **Active consumer safety**: research 문서와 demo 코드 주석이 ADR-005/003/007을 직접 참조하므로, 내용 손실과 dead link가 독자에게 즉시 드러난다.
2. **Branch freshness dependency**: serving-predict plan/spec와 bulk-pr-splitting-strategy는 #104 branch보다 새 main 내용이므로, rebase/freshen 없이는 renumber 대상 파일을 놓친다.
3. **ADR namespace collision**: #104가 ADR-022..028을 물리적으로 사용하고 있고, serving-predict 및 PR#105 후보가 같은 번호를 예약하고 있어 future collision이 확정적이다.

### Viable Options

#### Option A — targeted-MECE-restore-then-merge [chosen]

- 내용: #104 branch를 먼저 main으로 freshen하고, ADR-005/003/004/007의 live-referenced 손실분만 successor ADR에 복원하고, 모든 live dangling reference를 successor 번호/경로로 수정한다. 그 뒤 serving-predict 예약을 ADR-029/030, PR#105 후보 예약을 ADR-031..034로 이동하고, README link-check 후 PR #104를 merge한다.
- 장점: 오늘 deadline에 맞고, visible corpus를 MECE로 유지하며, active consumer가 필요한 증거를 잃지 않는다. stale branch로 인한 누락도 첫 단계에서 차단한다.
- 단점: retired ADR의 순수 역사 rationale 전체를 visible corpus에 되살리지는 않는다.
- 선택 이유: spec의 MECE 기준, non-goal, Architect/Critic freshness 지적을 동시에 만족하는 유일한 옵션이다.

#### Option B — keep-retired-ADRs-as-superseded-stubs

- 내용: ADR-003/004/005/007 파일을 visible corpus에 stub 또는 superseded 파일로 남겨 dangling reference를 완화한다.
- 장점: 기존 링크를 많이 바꾸지 않아도 되고, 역사 추적 UX가 쉽다.
- 단점: PR #104의 핵심인 visible active corpus MECE 재편을 약화하고, README의 retired-source semantics와 충돌한다.
- 비선택/무효화 근거: user-confirmed scope가 retire 허용이지만 live-ref 내용은 successor에 보존하라는 것이므로, 파일 stub로 문제를 우회하면 MECE 완료가 아니다.

#### Option C — merge-as-is-accept-debt

- 내용: 현재 #104를 그대로 merge하고 dangling ref/content loss/number collision을 후속 PR로 처리한다.
- 장점: 가장 빠르다.
- 단점: active research 문서가 ADR-005 수치를 인용하지만 successor에서 찾을 수 없고, 코드/문서 주석이 제거된 경로를 가리킨다. ADR-022..025 예약 충돌도 main에 남는다.
- 비선택/무효화 근거: 승인 spec의 acceptance criteria 및 Architect/Critic blocking comments를 정면으로 실패한다.

## In scope / out of scope

### In scope

- PR #104 브랜치 `docs/101-reorganize-adr-corpus-into-mece-decision-categorie`에서만 작업.
- **첫 단계로 branch freshen**: `origin/main`을 #104 branch에 반영하고, serving-predict plan/spec 및 bulk splitting research가 branch에 존재하는지 확인.
- ADR-005 Verification Results 중 active research가 인용하는 Room 502 25%, Room 301 51.3%, 6-clip verification table, detection-miss/OOD 결론을 적합 successor에 복원.
- ADR-003/004/007 live-referenced 내용 audit 및 successor 보강.
- retired ADR-003/004/005/007 live dangling reference 전수 수정.
- historical exception allowlist를 정의하고 archive/historical prose는 의도적으로 rewrite하지 않음.
- serving-predict active plan/spec의 ADR-022/023 예약을 ADR-029/030으로 renumber.
- `docs/research/bulk-pr-splitting-strategy.md` §7.2의 PR#105 후보 ADR-022..025 예약을 ADR-031..034로 renumber.
- docs/decisions/README.md index/category/coverage matrix link validation.
- PR #104 commit, push, merge to main after approval and verification.

### Out of scope

- PR #104 split.
- 다른 size/XL PR #106, #105, #103, #99, #98 분할 또는 머지.
- size-CI hard gate/governance 작업(issue #110).
- retired ADR 순수 역사 rationale 전량 복원.
- multi-agent fan-out.
- build/lint/format full gates. 이 계획의 검증은 docs+refs 변화에 맞춘 search/link/reference checks와 merge 후 docs smoke로 제한한다.

## File-level changes

### Branch freshness 대상 파일

- `docs/exec-plan/active/serving-predict-real-inference/plan.md`
- `docs/exec-plan/active/serving-predict-real-inference/spec.md`
- `docs/research/bulk-pr-splitting-strategy.md`

이 파일들은 #104 branch가 stale하면 없거나 오래된 상태일 수 있다. 따라서 첫 gate에서 존재를 확인해야 하며, 존재하지 않으면 edits를 시작하지 않는다.

### `docs/decisions/ml/ADR-025-yolo26-pose-framework-adoption.md`

- ADR-005의 framework/domain-fit verification successor로 판단한다.
- `## Verification Results (2026-06-08)` 또는 동등한 하위 섹션을 추가/확장한다.
- main ADR-005의 표를 보존한다: 3F lounge 100%, Room 206 100%, Room 505 72.5%, Room 404 57.5%, Room 301 51.3%, Room 502 25%, visible kpts/17, mean kpt conf.
- 세 결론을 보존한다: detected person에 대해서는 skeleton quality good, failure mode는 bad skeleton이 아니라 detection-miss, root cause는 COCO에 없는 ceiling top-down + lying + blanket OOD.
- improvement roadmap 핵심을 보존한다: scale-up first, domain fine-tuning if misses persist, serving cost trade-off.
- `Source mapping`에 original ADR-005 verification table이 이 ADR에 live-preserved 됐음을 명시한다.

### `docs/decisions/ml/ADR-026-frame-model-seam-architecture.md`

- ADR-005의 stream/model seam clauses가 이미 대체되어 있으므로, live-ref audit에서 부족한 serving reuse 또는 `FrameSource`/`ModelModule` contract 세부가 있으면 보강한다.
- `ml/demo/live_view.py`의 event badge 문맥은 ADR-027이 더 직접적이지만, `ModelModule.predict(frame) -> DetectionResult` truthfulness와 연결되는 경우 ADR-026/027 교차 참조를 유지한다.

### `docs/decisions/ml/ADR-027-inference-output-baseline-policy.md`

- ADR-005 §5 live-ref를 이 successor로 치환할 수 있도록, fake output 금지와 real inference aggregation 원칙을 명시적으로 보강한다.
- `ml/demo/app.py:175`와 `ml/demo/live_view.py:40`의 “badge aggregates real inference, never invents state” 참조 대상이 되게 한다.

### `docs/decisions/ml/ADR-022-ml-serving-training-lifecycle.md`

- ADR-003의 serving endpoints, `PredictResponse` schema, uv dependency groups, Triton-inspired artifact rationale 중 현재 live-referenced/active인 부분을 audit한다.
- PR #104의 current split에서는 lifecycle authority가 ADR-022이고 artifact layout은 ADR-015, ML/backend boundary는 ADR-023, demo/product boundary는 ADR-024다. 따라서 누락 내용은 각 owning successor에 분산 보강한다.
- `ml/demo/app.py:5`와 `ml/demo/live_view.py:41`이 ADR-003 대신 ADR-024/ADR-023/ADR-010 등을 참조하도록 코드 주석을 수정한다.

### `docs/decisions/ml/ADR-012-ml-data-domain-first-layout.md`

- ADR-004 live-referenced 부분인 raw-is-sacred, source footage ownership, gitignore/privacy invariant가 successor에 충분히 존재하는지 확인한다.
- 부족하면 `retired source ADR-004`에서 inherited invariants를 보강한다.

### `docs/decisions/ml/ADR-015-ml-models-single-root.md`

- ADR-007 live-referenced 부분인 weight cache/model root가 successor에 충분히 존재하는지 확인한다.
- `ml/demo/model_modules.py:25`는 `ADR-007 and ADR-015`에서 `ADR-015` 또는 `ADR-015/ADR-025`로 갱신한다. 현재 pose cache path는 `ml/models/pose/`이므로 ADR-015가 주 authority다.

### `ml/demo/app.py`

- Line 5: `See ADR-003 for the lifecycle boundary`를 PR #104 successor 기준으로 갱신한다. 권장: `See ADR-024 for the demo/product boundary, ADR-023 for backend alert ownership, and ADR-010 for the live per-frame inference mode decision.`
- Line 175: `ADR-005 §5`를 ADR-027로 갱신한다. 권장: `ADR-027 — real inference outputs only; no fabricated state`.

### `ml/demo/live_view.py`

- Lines 40-41: `ADR-005 §5`를 ADR-027로, `ADR-003`을 ADR-023으로 갱신한다.

### `ml/demo/model_modules.py`

- Line 25: `ADR-007 and ADR-015`를 `ADR-015` 중심으로 갱신한다. 필요하면 pose framework 관련은 ADR-025를 함께 언급한다.

### `docs/research/adversarial-fall-detection-redesign.md`

- Line 26: `ADR-005: Room 502 검출률 25%`를 `ADR-025: Room 502 검출률 25%`로 갱신한다.
- Lines 61-62: ADR-005 evidence refs를 ADR-025로 갱신한다.
- Line 283 source list: `ADR-005/009/...`를 `ADR-025/009/...` 또는 `ADR-025/026/027/009/...`로 갱신한다. Room 301/502 수치의 source는 ADR-025가 owning successor다.
- full sweep에서 추가 active hits가 발견되면 이 파일의 다른 ADR-003/004/005/007 live refs도 같은 기준으로 수정한다.

### `docs/exec-plan/active/serving-predict-real-inference/plan.md`

- Step 7의 `docs/decisions/ADR-022-predict-contract.md` 예약을 `ADR-029-predict-contract`로 변경한다.
- `docs/decisions/ADR-023-inference-layer.md` 예약을 `ADR-030-inference-layer`로 변경한다.
- `related-adrs`는 현재 authorities인 ADR-022/023/025/026/013/014/015 등으로 유지/갱신하되, 새 future ADR 예약은 ADR-029/030만 사용한다.
- `ADR-022`/`ADR-023`이 남는 경우는 current authority reference인지 future reservation인지 문맥을 확인한다. future reservation이면 반드시 029/030으로 바꾼다.

### `docs/exec-plan/active/serving-predict-real-inference/spec.md`

- ADR-022/023 예약 문구를 ADR-029/030으로 동기화한다.
- `ADR-003 §4 정련` 같은 retired source direct wording이 남으면 current authority ADR-023 또는 future ADR-029로 바꾼다.

### `docs/research/bulk-pr-splitting-strategy.md`

- §7.2 `PR #105 구체 분할안 (stacked, 의존 순서)`의 `포함 ADR 후보`를 다음으로 remap한다:
  - PR-1 Prisma schema / migration / seed: ADR-024 → **ADR-031**
  - PR-2 auth + hmac.guard: ADR-023 → **ADR-032**
  - PR-3 RLS + red-team 테스트: ADR-022 → **ADR-033**
  - PR-4 SSE 전송: ADR-025 → **ADR-034**
  - PR-5 admin UI + alerts 페이지: — 유지
- Remap 후 §7.2 table 안에 ADR-022, ADR-023, ADR-024, ADR-025가 남아 있으면 failure다.
- PR#105 후보가 ADR-031..034부터 시작한다는 note를 README doctrine 또는 bulk strategy §7.2 아래에 남긴다.

### `docs/decisions/README.md`

- ADR doctrine section을 보강한다: retired source ADR은 active live references가 successor에 보존된 뒤 visible corpus에서 retire 가능하다는 rule을 명시한다.
- Coverage matrix에서 ADR-005 row의 no-omission check/reviewer notes를 `verification table and OOD conclusions live-preserved in ADR-025`로 갱신한다.
- 번호 충돌 해소 메모를 추가한다: #104 ADR-022..028 frozen; pending serving-predict ADRs are ADR-029/030; PR #105 candidates start ADR-031..034.
- index links가 전부 현재 파일로 resolve되는지 확인한다.

## Sequencing and dependencies

### 0. Branch freshness gate — FIRST, before any edits

1. main checkout에서 직접 작업하지 않는다.
2. #104 worktree로 들어간다. 없으면 `git wt 101`로 생성한다. 기존 확인 path: `../eldercare-fall-ai-worktrees/docs/101-reorganize-adr-corpus-into-mece-decision-categorie`.
3. branch가 `docs/101-reorganize-adr-corpus-into-mece-decision-categorie`인지 확인한다.
4. `origin/main`을 먼저 가져오고 #104 branch에 반영한다. 방법은 repo convention에 맞춰 rebase 또는 merge-update 중 충돌이 적고 PR history 정책에 맞는 방식을 사용한다. 핵심은 **edits before freshen 금지**다.
5. post-freshen required file gate:
   - `docs/exec-plan/active/serving-predict-real-inference/plan.md` exists
   - `docs/exec-plan/active/serving-predict-real-inference/spec.md` exists
   - `docs/research/bulk-pr-splitting-strategy.md` exists
6. 위 세 파일 중 하나라도 없으면 renumber edits를 시작하지 않는다. branch freshness를 다시 해결한다.

### 1. Snapshot and scoped dangling audit

- PR branch freshen 후 retired ADR refs sweep을 수행한다.
- 대상 패턴: `ADR-003`, `ADR-004`, `ADR-005`, `ADR-007`, old paths `docs/decisions/ADR-003-`, `ADR-004-`, `ADR-005-`, `ADR-007-`.
- live refs to fix와 historical refs to leave를 분리한다.

#### Live refs to fix — known minimum

- `ml/demo/app.py:5` — ADR-003 lifecycle boundary direct ref → ADR-024/023/010 successors.
- `ml/demo/app.py:175` — ADR-005 §5 direct ref → ADR-027.
- `ml/demo/live_view.py:40-41` — ADR-005 §5 and ADR-003 direct refs → ADR-027 and ADR-023.
- `ml/demo/model_modules.py:25` — ADR-007 direct ref → ADR-015.
- `docs/research/adversarial-fall-detection-redesign.md:26` — ADR-005 Room 502 25% → ADR-025.
- `docs/research/adversarial-fall-detection-redesign.md:61-62` — ADR-005 Room 502/301 figures → ADR-025.
- `docs/research/adversarial-fall-detection-redesign.md:283` — source list ADR-005 → ADR-025 or ADR-025/026/027 as applicable.
- Any additional active hits found by full search under non-archive active docs/code, including `docs/research/*.md`, `docs/rules/*.md`, `docs/architecture.md`, `README.md`, and `ml/**/*.py`.

#### Historical exception allowlist — leave intentionally, do not rewrite unless link is dead and active-facing

- `docs/decisions/README.md` coverage matrix and retired-source doctrine rows for ADR-003/004/005/007. These are source-mapping authority, not dangling refs.
- Successor ADR `Source mapping` prose that says `retired source ADR-003/004/005/007`. These are intentional lineage notes.
- `docs/exec-plan/archive/**` historical plans/specs that describe work as it was planned at the time.
- Dated historical research/prose whose purpose is audit/history rather than current authority, if the text clearly treats old ADR numbers as historical. If such a dated research doc is active and cites old ADR numbers as current authority, it is **not** allowlisted and must be fixed.
- `ml/uv.lock` package URLs or unrelated numeric substrings are ignored as false positives if search pattern catches them accidentally.

Gate: after edits, live refs outside allowlist must be 0. Allowlisted refs must be documented in the verification note so reviewers can distinguish intentional history from missed dangling refs.

### 2. Restore live-referenced ADR-005 verification content

- main `docs/decisions/ADR-005-yolo26-pose-and-module-seam.md`의 Verification Results를 source로 삼아 ADR-025에 복원한다.
- `docs/research/adversarial-fall-detection-redesign.md`가 인용하는 25%, 51.3%, OOD detection-miss 근거를 ADR-025에서 직접 찾을 수 있게 한다.
- `51.3` search hit가 ADR-025에 생긴 뒤 research refs를 ADR-025로 갱신한다.

### 3. Restore ADR-003/004/007 live-referenced content into successors

- ADR-003: serving lifecycle는 ADR-022, ML/backend boundary는 ADR-023, demo/product boundary는 ADR-024, model path는 ADR-015로 분산되어야 한다. serving endpoints/PredictResponse schema/uv dependency groups/Triton rationale 중 active 참조가 있는 문구만 successor에 보강한다.
- ADR-004: raw-is-sacred, source footage ownership, gitignore/privacy invariant가 ADR-012에 있는지 확인하고 보강한다.
- ADR-007: pose cache/model root/current generated outputs ownership은 ADR-015/ADR-012에 있어야 한다. `ml/demo/model_modules.py`는 ADR-015로 갱신한다.

### 4. Fix all live dangling retired ADR references

- Known live refs를 먼저 수정한다.
- 전수 sweep으로 active docs/code에 남은 retired ADR number/path refs를 제거한다.
- historical exception allowlist에 해당하는 refs는 남기되, current authority처럼 보이는 표현은 `retired source ADR-*`로 바꾸거나 successor를 병기한다.

### 5. Resolve ADR number collisions

#### 5.1 Serving-predict plan/spec

- PR #104 ADR-022..028은 그대로 유지한다.
- `docs/exec-plan/active/serving-predict-real-inference/{plan.md,spec.md}`의 pending reservation을 ADR-029/030으로 이동한다.
- ADR-029 = predict-contract, ADR-030 = inference-layer.

#### 5.2 PR#105 candidates in bulk-pr-splitting-strategy

- `docs/research/bulk-pr-splitting-strategy.md` §7.2 table의 ADR-022..025 후보를 ADR-031..034로 이동한다.
- Gate: §7.2 table 안에서 ADR-022, ADR-023, ADR-024, ADR-025가 0건이어야 한다.
- Gate: §7.2 table 안에서 ADR-031, ADR-032, ADR-033, ADR-034가 각각 의도한 PR-1..PR-4에 존재해야 한다.

### 6. README link validation and doctrine hardening

- README Decision index의 모든 relative links가 파일로 존재하는지 확인한다.
- Coverage matrix의 `New physical path`와 index paths가 일치하는지 확인한다.
- Doctrine change section을 추가한다: retire-with-live-ref-preservation + number freeze/renumber decision.

### 7. Commit, push, PR merge

- Verification 통과 후 commit/push.
- PR #104에서 modified files가 scope 밖으로 번지지 않았는지 확인한다.
- Push 전 branch freshness를 다시 확인하되, freshness는 이미 Step 0에서 완료되어 있어야 한다. pre-push는 재확인이지 최초 freshen 지점이 아니다.
- PR #104를 main에 merge한다. 분할하지 않는다.
- Merge 후 main docs smoke를 수행한다.

## DELIBERATE pre-mortem

### Failure scenario 1 — stale branch 때문에 serving-predict files를 silently miss한다

- 증상: plan에는 renumber가 있다고 적혔지만 #104 branch에는 `docs/exec-plan/active/serving-predict-real-inference/{plan.md,spec.md}`가 없어 실제 수정이 없다.
- 원인: branch freshen을 pre-push까지 미루거나 생략.
- mitigation: Step 0을 첫 단계로 고정하고, any edits 전 post-freshen file-exists gate를 둔다. 두 파일이 없으면 작업 중단.

### Failure scenario 2 — PR#105 stale reservation이 남아 future collision을 만든다

- 증상: serving-predict는 ADR-029/030으로 이동했지만 `bulk-pr-splitting-strategy.md` §7.2가 ADR-022..025를 계속 예약한다.
- 원인: number collision scope를 serving-predict만으로 과소정의.
- mitigation: §7.2 table을 ADR-031..034로 remap하고, table-scoped search로 ADR-022..025 0건을 gate로 둔다.

### Failure scenario 3 — allowlist failure로 live ref를 놓치거나 historical ref를 잘못 rewrite한다

- 증상 A: active research/doc/code가 retired ADR을 current authority로 계속 참조한다.
- 증상 B: archive plan/spec의 역사 문맥을 무리하게 rewrite해 당시 의사결정 기록을 왜곡한다.
- 원인: sweep 결과를 한 바구니로 처리하고 live/current vs historical/source-mapping을 구분하지 않음.
- mitigation: live refs to fix와 historical exception allowlist를 plan에 명시한다. verification에서 allowlisted refs를 별도 열거하고, active docs/code outside allowlist는 0건이어야 한다.

### Failure scenario 4 — ADR-005 verification figures를 wrong successor에 넣어 MECE를 깨뜨린다

- 증상: `51.3`은 존재하지만 ADR-026/027처럼 seam/output policy ADR에 들어가 framework domain-fit authority가 흐려진다.
- 원인: ADR-005가 세 개 successor로 split된 뒤 ownership을 혼동.
- mitigation: domain-fit verification table은 ADR-025에 넣는다. ADR-026은 seam, ADR-027은 output/baseline policy만 owning한다. README coverage matrix도 ADR-005 verification evidence -> ADR-025로 명시한다.

### Failure scenario 5 — ADR renumber가 serving-predict plan/spec 중 하나에만 반영된다

- 증상: plan.md는 ADR-029/030인데 spec.md 또는 frontmatter는 ADR-022/023을 future reservation으로 남긴다.
- 원인: Step 7만 수정하고 frontmatter/decision text를 누락.
- mitigation: `serving-predict-real-inference` directory에서 `ADR-022|ADR-023|ADR-029|ADR-030|predict-contract|inference-layer`를 다시 sweep하고, current authority ADR-022/023과 future reservation ADR-029/030을 문맥별로 구분한다.

## DELIBERATE expanded verification plan

이 계획은 build/lint/format success를 주장하지 않는다. 아래는 docs+refs 변경에 맞춘 명시적 runnable gates다.

### Gate 0 — branch freshness and required files

- #104 branch가 `origin/main`을 반영한 뒤 아래 파일이 존재해야 한다:
  - `docs/exec-plan/active/serving-predict-real-inference/plan.md`
  - `docs/exec-plan/active/serving-predict-real-inference/spec.md`
  - `docs/research/bulk-pr-splitting-strategy.md`
- 하나라도 없으면 edits 금지.

### Gate 1 — ADR-005 figures present in chosen successor

- `docs/decisions/ml/ADR-025-yolo26-pose-framework-adoption.md`에서 `51.3` search hit가 있어야 한다.
- 같은 파일에서 `Room 502`와 `25%`가 함께 확인되어야 한다.
- 같은 파일에서 `Room 301`과 `51.3%`가 함께 확인되어야 한다.
- 같은 파일에 OOD/detection-miss conclusion이 있어야 한다.

### Gate 2 — 0 live dangling retired-ADR refs

- Search scope: active docs/code, at minimum `docs/architecture.md`, `docs/decisions/**`, `docs/research/**`, `docs/rules/**`, `README.md`, `ml/**/*.py`, plus any active exec-plan files.
- Pattern: `ADR-003|ADR-004|ADR-005|ADR-007|docs/decisions/ADR-003-|docs/decisions/ADR-004-|docs/decisions/ADR-005-|docs/decisions/ADR-007-`.
- Required result: 0 live current-authority refs outside allowlist.
- Allowlist must be reported separately: README coverage matrix, successor source-mapping prose, `docs/exec-plan/archive/**`, explicitly historical dated prose only.

### Gate 3 — serving-predict reservation now cites ADR-029/030

- In `docs/exec-plan/active/serving-predict-real-inference/plan.md` and `spec.md`:
  - `ADR-029` appears for predict-contract.
  - `ADR-030` appears for inference-layer.
  - Any remaining `ADR-022`/`ADR-023` is current authority context only, not future file reservation.

### Gate 4 — bulk-pr-splitting-strategy §7.2 now cites ADR-031..034

- In `docs/research/bulk-pr-splitting-strategy.md` §7.2 table:
  - PR-1 Prisma schema / migration / seed → ADR-031.
  - PR-2 auth + hmac.guard → ADR-032.
  - PR-3 RLS + red-team 테스트 → ADR-033.
  - PR-4 SSE 전송 → ADR-034.
  - PR-5 admin UI + alerts 페이지 → —.
- §7.2 table-scoped check: ADR-022, ADR-023, ADR-024, ADR-025 are gone from that table.

### Gate 5 — README index links resolve with 0 dead links

- Resolve every markdown link in `docs/decisions/README.md` relative to `docs/decisions/`.
- Required result: 0 dead links.
- Retired source rows must not link to deleted files; they may mention historical ADR identifiers as plain text.

### Gate 6 — post-merge main docs smoke

- After PR #104 is merged, on main run the README link resolver again.
- Run the same live retired-ADR refs check on main.
- Confirm `ADR-025` on main still contains `51.3`, `Room 502`, and `25%`.
- Do not claim build/lint/format passed unless separately run by the executor.

## Acceptance criteria mapped 1:1 from spec

| Spec AC | Planned proof |
|---|---|
| PR #104가 main에 머지됨 | Branch freshened first, then `docs/101-reorganize-adr-corpus-into-mece-decision-categorie` pushed and PR #104 merged to main after approval. |
| ADR-005 검증수치(Room 502 25%, Room 301 51.3%) + 검증 표/OOD 결론이 successor ADR(025/026/027 중 적합)에 존재 | ADR-025에 Verification Results 표/결론/roadmap 복원. `51.3`, `Room 502`, `25%` search로 확인. |
| ADR-003/004/007 live-referenced 내용이 successor에 존재 | ADR-022/023/024/015, ADR-012, ADR-015 audit 및 필요한 보강. Active refs가 successor로 이동. |
| dangling 참조 0: known files + 전수 sweep | Known live files 수정 후 active docs/code retired ADR sweep 0 outside allowlist. Historical allowlist 별도 보고. |
| 번호충돌 해소: serving-predict plan/spec ADR-022/023 예약 -> ADR-029/030; #104 ADR-022..028 유지 | plan.md/spec.md renumber. Current authority ADR-022/023 문맥과 future reservation 029/030 문맥 분리 확인. |
| PR#105 후보 ADR reservation 충돌 해소 | `docs/research/bulk-pr-splitting-strategy.md` §7.2 ADR-022..025 → ADR-031..034. Table-scoped ADR-022..025 0건. |
| docs/decisions/README.md 인덱스 링크 전부 resolve, dead link 0 | README markdown link resolver 또는 equivalent script/check로 0 dead links. |
| #104는 분할되지 않음 | Same PR branch에서 commit/push/merge. 새 PR 생성 없음. |

## ADR section — doctrine change

### Decision

Visible ADR corpus에서 fully superseded, non-MECE source ADR을 retire할 수 있다. 단, retire 전 active 문서/코드가 참조하는 live content는 atomic successor ADR에 보존되어야 한다. Retired source identifier는 README coverage matrix와 successor source-mapping prose에서 historical identifier로 남길 수 있으나, active consumer가 deleted file path를 의존하면 안 된다.

ADR numbering은 merged/visible corpus의 current reservation을 우선한다. PR #104가 ADR-022..028을 사용하므로 이 번호들은 동결한다. Pending serving-predict 계획의 future ADR reservation은 ADR-029 predict-contract, ADR-030 inference-layer로 이동한다. PR #105 split candidates in `docs/research/bulk-pr-splitting-strategy.md` §7.2 are ADR-031..034.

### Drivers

- Active references must not break when source ADR files retire.
- MECE visible corpus must not retain superseded bundles as convenience stubs.
- ADR numbers are global public identifiers and must not be overloaded.
- Stale branches must not hide main-side reservation files during planning/execution.

### Alternatives

1. Keep old ADR files as superseded stubs.
   - Rejected because it weakens PR #104 visible-corpus MECE goal and encourages future direct references to retired bundles.
2. Merge current PR #104 and fix references later.
   - Rejected because accepted spec requires no dangling refs and successor preservation before merge.
3. Renumber #104 ADR-022..028 instead of pending reservations.
   - Rejected because #104 already materializes ADR-022..028 in a coherent coverage matrix, while serving-predict and PR#105 ADRs are still pending reservations/candidates.
4. Leave PR#105 candidate numbering until PR#105 planning.
   - Rejected because active research §7.2 already reserves conflicting ADR-022..025 and would continue seeding future collision.

### Why chosen

This doctrine preserves reader-facing evidence without polluting the current ADR corpus. It also resolves number collisions at the cheaper side: unmaterialized future reservations/candidates, not the already coherent #104 ADR set. Branch freshness first ensures the plan operates on the actual current repository rather than a stale branch snapshot.

### Consequences

- Successor ADRs must be checked for live-reference completeness before any source ADR retirement.
- README coverage matrix becomes an enforceable migration map, not just a catalog.
- Future plans must reserve ADR numbers after the latest visible ADR index and re-check before implementation.
- Rebase/freshen-before-edit is mandatory when a PR branch predates documents that must be modified by the completion plan.

### Follow-ups

- When serving-predict work begins, create ADR-029/030 using the renumbered plan/spec.
- When PR #105 planning resumes, use ADR-031..034 or later after another index check.
- Consider a lightweight ADR reference checker later, but not in this PR because size-CI governance is deferred.

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| Stale branch hides required files | High | Step 0 freshen before edits + required file exists gate. |
| PR#105 §7.2 old ADR-022..025 candidates remain | High | Explicit file-level change + table-scoped search requiring old IDs gone and ADR-031..034 present. |
| Archive docs contain old ADR refs and confuse the dangling-ref gate | Medium | Define live refs vs historical allowlist. Active docs/code outside allowlist must be 0; archive history can remain. |
| Historical prose is wrongly rewritten | Medium | Allowlist archive and explicitly historical dated prose; rewrite only current-authority live refs. |
| Verification table copy introduces transcription errors | High | Copy directly from main ADR-005 Verification Results; compare Room 301 51.3 and Room 502 25 explicitly. |
| README link checker misses category-relative paths | Medium | Resolve links from `docs/decisions/README.md` directory, not repo root. |
| Merge conflict with main after plan approval | Medium | Freshen first, resolve conflicts before edits, re-run targeted checks after conflict resolution. |
| Full build/lint skipped by instruction hides unrelated failure | Low for docs scope | Do not claim build/lint success. Run only docs/ref checks requested; merge smoke focuses on ADR links and refs. |

## Handoff guidance

- Implementation is bounded and single-branch. A single executor can apply it directly after approval.
- Architect review should focus on branch freshness gate, successor ownership, and number namespace completeness: ADR-025 vs ADR-026 vs ADR-027 placement; ADR-003 live clauses split into ADR-022/023/024/015; serving-predict 029/030; PR#105 031..034.
- Critic review should focus on verification sufficiency and historical allowlist correctness.
- Team/ultragoal are unnecessary for this single PR unless execution stalls across multiple sessions.
