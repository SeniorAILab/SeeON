```yaml
slug: docs-code-alignment-docs-only
issue: "#66"
date: 2026-06-10
author: claude-fable-5
supersedes: docs-code-alignment
```

# docs↔code 정합성 align (docs-only) — 감사 불일치 중 문서 스냅샷 수정

## Problem

감사(`docs/research/docs-code-alignment-audit.md`) 확정 불일치 38건 중,
사용자 인터뷰(2026-06-10)로 처리 방향이 확정된 docs-side 항목을 수정한다.
선행 plan `docs-code-alignment`는 artifact 경로 클러스터(Phase 2·3)가
이슈 #56(`ml/models/` 단일 루트 가이드)과 충돌해 superseded.

인터뷰 확정 사항:
1. **uv default-groups**: 현실 인정 — 문서를 "기본 전체 설치, slim 배포는
   `--no-default-groups`"로 갱신 (pyproject 무변경).
2. **artifact 경로(`<name>/<version>/` vs `{rf,lstm,transformer}/`) +
   serving `version`→`model_type` + ADR-015**: 전부 **#56으로 이관** —
   사용자 기존 가이드가 `ml/artifacts` 대신 `ml/models/{기능}` 루트이므로
   여기서 `ml/artifacts` 기준으로 문서/코드를 정렬하지 않는다.
3. **streamlit-demo.md**: pre-render 서술 폐기, 현 구현(라이브 루프) 기준
   재작성. 단 rule과 ADR이 **MECE**여야 함 — 결정(왜)은 ADR-010/011에,
   rule에는 운영 규약(무엇이 허용/금지)만 남기고 ADR 중복 서술 제거.

## Design

한 커밋 묶음(docs-only) + 소형 code 커밋 1건.

### 1. uv/training 상태 클러스터 (ADR-001, ADR-003, architecture.md)

- "uv sync는 serving만 설치" → "default-groups(demo/test/training) 기본
  전체 설치; slim은 `--no-default-groups`".
- training 그룹 "empty placeholder" → 실제 6개 패키지 기재.
- "ml/training deferred placeholder" → "scaffolded; pipeline operational".
- ADR 본문 중 상태 기술(스냅샷) 문장만 갱신 — 결정 로직 무변경.

### 2. ml/data domain-first 클러스터

- architecture.md 트리(ml/data + CameraSource 주석), README.md 트리.
- ADR-007 status header에 row 3(top-level raw/processed) 스테일 명시 +
  Decision 본문 인라인 주석.
- ADR-010 하단 `## Errata` 섹션 (본문 불변), ADR-011 Alternatives D 경로.
- docs/rules/README.md: 누락 3행(github-labels, ml-training,
  worktree-workflow) 추가 + ml-filesystem-layout 요약 domain-first 갱신.

### 3. streamlit-demo.md 재작성 (MECE)

- Rule 2·4의 pre-render 파이프라인(`build_annotated_video`/`st.video`/
  `annotated_video_path` 캐시) 서술 삭제.
- 결정 근거·파이프라인 구조 설명은 ADR-010/011 참조로 대체(중복 서술 금지).
- rule에 남기는 것: 운영 규약만 — public 모드에서 요양원 데이터 비노출
  (불변), 업로드 세션 스코프, 운영자 컨트롤 허용 범위(classifier 선택·
  탐지 파라미터 expander·사이즈 셀렉터 — 현 main 실태), 라이브 프레임
  렌더는 `st.empty().image` 패턴 유지 같은 코딩 규약.
- artifact 경로 관련 문구가 있으면 #56 보류 표기(경로 단정 금지).

### 4. 기타 단순 스냅샷 수정

- ADR-001 scripts 표 dupcheck 행, ADR-003 demo import 문구("direct
  get_model() import" → demo.classifiers 파이프라인), ADR-004 gitignore
  trailing slash, ADR-008 NotebookEdit 매처, docs/decisions/README.md
  lifecycle에 "Partially Superseded" 추가, architecture.md Key ADRs 표
  ADR-008~014 행 추가, README.md Quick Start에 setup-hooks 스텝.
- fall-video-crop-rename SKILL.md 경로 갱신 — `.claude/skills/`·
  `.agents/skills/` 미러 동시 수정 (`.codex/skills/`는 symlink).

### 5. 소형 code 커밋: app.py module docstring

- `ml/demo/app.py`에 module docstring 추가 (`from __future__` 앞).
- yolo_overlay broad-except 건은 PR #67이 코드 제거로 해소 — 착수 시
  부재 확인만.

### #56으로 이관 (이 plan 비대상)

- ADR-009/ADR-012/ml-filesystem-layout.md의 artifact 경로 템플릿 수정
- `ml/serving/model.py` `version`→`model_type` 리네임
- ADR-015(모델 저장 레이아웃) 발행 — `ml/models/` 통합 ADR로 합본

## Tests

- `cd ml && uv run ruff check . && uv run pytest -q` 그린 (docstring 커밋).
- 문서 수정 후 감사 표 "실제" 컬럼과 자체 대조; streamlit-demo.md는
  ADR-010/011과 중복 문단이 없는지 MECE 점검.

## Steps

1. 선행 plan 아카이브(superseded-by)와 함께 이 plan 커밋 (finalize).
2. Design 1→4 docs 커밋, 5 code 커밋.
3. 게이트 그린 확인 후 보고 (PR은 오케스트레이터 생성).

## Non-goals

- artifact/모델 저장 경로 관련 일체 (#56).
- ADR 결정 로직 변경, 감사 "정합" 78건 영역.
