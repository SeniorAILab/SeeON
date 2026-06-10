```yaml
slug: docs-code-alignment
issue: "#66"
date: 2026-06-10
author: claude-fable-5
status: superseded-by
superseded-by: docs-code-alignment-docs-only
```

# docs↔code 정합성 align — 감사 확정 불일치 38건 수정

## Problem

dynamic workflow 감사(53 에이전트, 적대 검증 포함) 결과 정합 78건 / 확정
불일치 38건. 불일치는 구현이 발전하며 갱신되지 않은 문서 스냅샷에 집중되고,
1건은 코드 버그(serving artifact 경로 파라미터). 전체 근거:
`docs/research/docs-code-alignment-audit.md` (이 폴더와 같은 PR에 포함).

## Design

감사 보고서 §3 권고 순서를 따르되 한 브랜치에서 phase별 커밋으로 분리.

### Phase 1 — docs-only (커밋 1)

보고서 §2 HIGH/MEDIUM/LOW 중 doc-side 항목 전부:

1. uv sync/default-groups 클러스터: ADR-001, ADR-003, architecture.md —
   "default-groups가 demo/test/training 포함; slim 빌드는
   `--no-default-groups`"로 통일.
2. training 그룹 "empty placeholder" 문구 제거, 실제 6개 패키지 기재 (3파일).
3. ml/training "deferred placeholder" → "scaffolded; pipeline operational"
   (ADR-003, architecture.md).
4. ml/data domain-first 클러스터: architecture.md 트리, README.md 트리,
   docs/rules/README.md 요약, ADR-007 status header(row 3 추가),
   ADR-010 하단 Errata 섹션(본문 불변 유지), ADR-011 Alternatives D,
   docs/rules/streamlit-demo.md Rule 1·2·3·4 전면 재작성(ADR-010 라이브
   추론 패턴 + 현 main의 app.py 실태 기준 — segmented_control row 선택,
   classifier selectbox, 탐지 파라미터 expander 허용 명시).
5. 기타 단순 수정: ADR-001 dupcheck 행, ADR-003 demo import 문구,
   ADR-004 trailing slash, ADR-007 Decision body 인라인 주석,
   ADR-008 NotebookEdit, docs/decisions/README.md lifecycle에
   "Partially Superseded" 추가, architecture.md CameraSource 주석 +
   Key ADRs 표 ADR-008~015 행 추가, docs/rules/README.md 누락 3행,
   README.md Quick Start에 setup-hooks 스텝.
6. fall-video-crop-rename SKILL.md 경로 갱신 — `.claude/skills/`와
   `.agents/skills/` 미러 동시 수정 (`.codex/skills/`는 symlink).

### Phase 2 — code + doc: artifact 경로 (커밋 2)

실제 레이아웃은 `ml/artifacts/fall-detector/{rf,lstm,transformer}/`이고
version은 metadata.json 내부 필드 — 문서의 `<name>/<version>/` 템플릿과
serving 코드가 모두 틀렸다.

1. `ml/serving/model.py`: `FallDetector.__init__` 파라미터
   `version` → `model_type`(기본값은 현 동작 보존 선에서 결정),
   artifact_dir 경로 산식, `_load_metadata` fallback dict 갱신.
   호출부·테스트 전수 갱신.
2. 문서 경로 템플릿 `<name>/<model_type>/`로 교체: ADR-009 line 136,
   ADR-012 MECE row 1 + footnote, docs/rules/ml-filesystem-layout.md.
   (ADR-003 §3은 Phase 3 ADR-015가 supersede — 본문 직접 수정 금지,
   status header에 부분 supersede 표기만.)

### Phase 3 — ADR-015 (커밋 3)

`docs/decisions/ADR-015-ml-artifacts-model-type-layout.md` 신규:
ADR-003 §3 artifact 레이아웃 결정을 공식 supersede
(`<name>/<version>/` → `<name>/<model_type>/`, version은 metadata 필드).
ADR-003 status header에 상호 참조 추가. docs/decisions/README.md 인덱스 갱신.

### Phase 4 — 소형 code-side (커밋 4)

1. `ml/demo/app.py` module docstring 추가 (`from __future__` 앞).
2. ~~yolo_overlay.py:64 broad-except 축소~~ — **제외**: PR #67이 해당
   코드를 통째로 제거함. 착수 전 main 기준 재확인만.

## Tests

- `cd ml && uv run ruff check . && uv run pytest -q` 그린 (Phase 2·4 코드
  변경 검증; serving 테스트가 model_type 경로를 커버하는지 확인, 없으면 추가).
- 문서 변경은 보고서 표의 "실제" 컬럼과 일치 여부를 수정 후 자체 대조.

## Steps

1. plan 커밋 (finalize, research 문서 동반).
2. Phase 1 → 2 → 3 → 4 순서로 phase별 커밋.
3. 게이트 그린 확인 후 보고 (PR은 오케스트레이터 생성).

## Non-goals

- ml/models/ 통합(weights+artifacts 단일 루트) — #56 별도 작업.
- ADR 본문 소급 수정(불변 규약 위반) — Errata/status header/신규 ADR로만.
- 감사에서 "정합"으로 판정된 78건 영역.
