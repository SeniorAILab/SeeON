```yaml
slug: docs-code-alignment-audit
date: 2026-06-10
author: claude-fable-5
method: dynamic workflow (wf_24b3f309-fd5) — inventory -> audit (53 agents) -> adversarial verify -> synthesize
```

# docs↔code 정합 감사 보고서

## 1. 정합 요약

전반적인 아키텍처 결정 자체(polyglot monorepo 구조, ML/Backend 경계, ADR 라이프사이클, worktree 브랜치 전략, 의존성 그룹 분리 개념)는 코드베이스와 잘 맞아 있다. Backend(NestJS), Frontend(Next.js), Prisma 스키마 관련 문서는 실제 코드와 대체로 일치하며, git 훅·가드 스크립트는 AGENTS.md 규약대로 구현돼 있다. 개별 ADR의 핵심 결정 로직 자체가 잘못된 사례는 없으며, 불일치는 구현이 발전하면서 스냅샷이 갱신되지 않은 **상태 기술(status description)** 에 집중된다.

---

## 2. 불일치 목록

### HIGH — 즉시 수정 필요

| 문서 | 주장 | 실제 | 수정 방향 |
|------|------|------|-----------|
| ADR-001, ADR-003, architecture.md (중복 클러스터) | `uv sync`는 serving deps만 설치; `--group demo/training`은 opt-in | `default-groups = ["demo","test","training"]` → bare `uv sync`가 전체 설치; pyproject.toml 주석이 명시적 설명 | **doc-side**: 세 파일 모두 "default-groups가 모든 그룹 포함; slim 빌드는 `--no-default-groups`" 로 통일 |
| ADR-001, ADR-003, architecture.md (중복 클러스터) | training 의존성 그룹이 "빈 placeholder" | `torch>=2.3, scikit-learn>=1.5, joblib>=1.4, tqdm>=4.66, ultralytics>=8.3, opencv-python-headless>=4.10` 6개 패키지 실재 | **doc-side**: 실제 패키지 목록으로 교체; "empty placeholder" 문구 삭제 |
| ADR-003, architecture.md (중복 클러스터) | `ml/training/`은 "batch lifecycle placeholder (deferred)" | `config.py, extract_poses.py, train.py, evaluate.py, metadata.py, data/, models/` 완전 구현 | **doc-side**: "scaffolded; pipeline operational" 으로 갱신 |
| ADR-003, ADR-009, ADR-012, architecture.md, ml-filesystem-layout.md (중복 클러스터) | first-party artifacts 경로가 `<name>/<version>/` (예: `fall-detector/0.1.0/`) | `fall-detector/{lstm,rf,transformer}/` — 두 번째 경로 티어는 model_type; version은 metadata.json 내부 필드 | **doc-side** 5개 파일 경로 템플릿 교체 + **code-side** `ml/serving/model.py` FallDetector의 `version` 파라미터를 `model_type`으로 교체 |
| docs/rules/streamlit-demo.md Rule 2 & Rule 4 | Rule 2: `build_annotated_video → cv2.VideoWriter → st.video()` pre-render 방식 강제; Rule 4: `annotated_video_path` 캐시 키 규칙 | `annotated_video_path`, `build_annotated_video`, `avc1`, `st.video()` 모두 코드베이스에 미존재; app.py:129 `iter_live_frames + frame_ph.image()` 라이브 루프 사용 (ADR-010 채택) | **doc-side**: Rule 2·4 전면 재작성; ADR-010 라이브 추론 패턴으로 교체 |
| docs/architecture.md — `ml/data/` 레이아웃 | top-level `raw/, processed/, annotated/, uploads/, eval/` 평면 구조 | ADR-012 domain-first: `{nursing-home,le2i,...}/{raw,processed,annotated,poses}/`; top-level에는 `uploads/, eval/`만 존재 | **doc-side**: architecture.md 트리 + README.md 트리 업데이트 |

### MEDIUM — 다음 docs PR에 포함

| 문서 | 주장 | 실제 | 수정 방향 |
|------|------|------|-----------|
| ADR-001 scripts 표 | 13개 스크립트 완전 열거로 제시 | `"dupcheck": "jscpd ml backend/src front/src"` 14번째 스크립트 누락 | **doc-side**: 표에 `dupcheck` 행 추가 |
| ADR-003 | demo/app.py가 `get_model()`을 serving.model에서 직접 import | demo는 `demo.classifiers`, `demo.model_modules` 독자 파이프라인 사용; serving 모듈 import 없음 | **doc-side**: "direct `get_model()` import" 문구를 "in-process model pipeline via demo.classifiers"로 교체 |
| ADR-007 Consequences | `ml/data/eval/` "reserved but unbuilt" | `eval/` 실재, `gold8-poc-results.csv`, `le2i-poc-results.csv` 포함; ADR-012가 formal ownership 취득 | **doc-side**: "live, holds cross-domain comparison outputs"로 교체 |
| ADR-007 status header | row 6만 superseded; "ml/weights/와 나머지 모든 row는 유효" | ADR-012가 row 3(raw/processed top-level)도 supersede; `ml/data/raw/`, `ml/data/processed/` top-level 미존재 | **doc-side**: status header에 row 3 스테일 명시 |
| ADR-010 Decision bullet 2 | `ml/data/processed`를 통한 파일 재생 | `ml/data/processed` top-level 미존재; domain-first `ml/data/{domain}/processed/` | **doc-side**: ADR 불변성 규약 준수 — body 수정 대신 파일 하단에 Errata 섹션 추가 |
| ADR-012 MECE row 1 | `ml/artifacts/<name>/<version>/` (ADR-003 인용) | 실제 on-disk: `fall-detector/{lstm,rf,transformer}/`; version은 metadata.json 필드 | **doc-side**: row 1을 `<name>/<model_type>/`으로 교체 + footnote 추가 |
| docs/architecture.md Key ADRs 표 | ADR-001~007까지만 나열 | ADR-008~014 모두 Accepted 상태로 실질적 아키텍처 결정 포함 | **doc-side**: 표에 ADR-008~014 행 추가 |
| docs/rules/README.md | 3개 rule 파일 인덱스 | 6개 rule 파일 존재 (`github-labels.md`, `ml-training.md`, `worktree-workflow.md` 누락) + `ml-filesystem-layout` 요약이 flat layout 서술 | **doc-side**: 3개 행 추가 + ml-filesystem-layout 요약 domain-first로 갱신 |
| docs/rules/streamlit-demo.md Rule 1 | "model picker, threshold slider 금지" | app.py:61-63에 classifier selectbox, 탐지 파라미터 expander (conf, window, stride, sustained_down_sec) 실재; Rule 5는 이미 허용 | **doc-side**: Rule 1을 라이브 추론 UI 허용 범위로 재작성 |
| fall-video-crop-rename SKILL.md | `ml/data/raw/`, `ml/data/processed/` (7+회 참조) | ADR-012 domain-first; `ml/data/{domain}/raw/`, `ml/data/{domain}/processed/` | **doc-side**: `.claude/skills/`와 `.agents/skills/` 미러 동시 수정 |

### LOW — 다음 docs PR 또는 별도 소형 PR

| 문서 | 주장 | 실제 | 수정 방향 |
|------|------|------|-----------|
| ADR-003 | demo/app.py에 module docstring 존재 (인용문 명시) | `from __future__ import annotations`가 첫 줄; docstring 미존재 | **code-side**: docstring을 `from __future__` 앞에 삽입 (option A) 또는 doc-side 인용문 삭제 |
| ADR-004 gitignore 코드블록 | `.gitignore` 항목이 `ml/data/` (trailing slash) | 실제 `.gitignore`는 `ml/data` (trailing slash 없음) | **doc-side**: 코드블록과 Consequences 문구에서 trailing slash 제거 |
| ADR-007 Decision body | `ml/data/annotated/` top-level로 서술 (status header는 올바름) | annotated는 `ml/data/{domain}/annotated/` 내부에만 존재 | **doc-side**: Decision 본문에 ADR-012 supersede 인라인 주석 추가 |
| ADR-008 | PreToolUse 매처를 "Edit/Write"로 기술 | `.claude/settings.json` 실제 매처: `Edit\|Write\|NotebookEdit` | **doc-side**: "Edit/Write/NotebookEdit"으로 수정 |
| ADR-011 Alternatives D | `ml/data/processed` 참조 | domain-first layout; top-level processed 미존재 | **doc-side**: `ml/data/{domain}/processed/`로 교체 |
| docs/decisions/README.md | ADR-004, ADR-007 status: "Accepted (partially superseded by ADR-012)" — 비표준 상태값 | lifecycle 정의에 Proposed/Accepted/Superseded/Deprecated만 존재 | **doc-side**: README lifecycle 블록에 "Partially Superseded" 공식 상태 추가 (option A) |
| architecture.md | `frame_source.py`에 `Frame/FrameSource/VideoFileSource` 3종 | `CameraSource` (ADR-011 추가)도 동일 파일에 존재 | **doc-side**: tree 주석에 CameraSource 추가 |
| ml/demo/yolo_overlay.py:64 | code-stability 규칙: process boundary 예외에만 broad catch 허용 (logging.exception + noqa 근거 주석 필수) | `except Exception: # noqa: BLE001` — 근거 주석 없음, logging 없음, font 헬퍼 함수 (boundary 아님) | **code-side**: `except (ImportError, OSError):` 로 축소, noqa 제거 |
| README.md Quick Start | 5단계 설치 과정 | `scripts/git-guard/setup-hooks.sh`(git wt alias + core.hooksPath 등록) 단계 없음 | **doc-side**: Quick Start에 6번째 스텝 추가 |

---

## 3. 권고 실행 순서

### Phase 1 — docs-only PR (1회 일괄)

아래 항목은 코드·ADR supersede 불필요, 문서만 수정:

1. **uv sync / default-groups 클러스터** — ADR-001, ADR-003 Consequences·Decision §2, architecture.md 의존성 섹션을 동시에 수정 (3개 파일, 동일 패턴)
2. **training 그룹 placeholder 클러스터** — ADR-001·ADR-003·architecture.md에서 "empty placeholder" 문구 제거, 실제 패키지 목록 기재
3. **ml/training/ deferred 클러스터** — ADR-003 Context·Decision §1, architecture.md 트리 주석 업데이트
4. **ml/data/ domain-first 클러스터** — architecture.md 트리, README.md 트리, docs/rules/README.md ml-filesystem-layout 요약, ADR-007 status header, ADR-010 Errata 섹션 추가, ADR-011 Alternatives D, docs/rules/streamlit-demo.md Rule 2·3·4·1 전면 재작성
5. **기타 docs 단순 수정** — ADR-001 dupcheck 행, ADR-003 demo import 문구, ADR-004 trailing slash, ADR-007 Decision body inline 주석, ADR-008 NotebookEdit, ADR-012 MECE row 1 + footnote, docs/decisions/README.md lifecycle 확장, architecture.md CameraSource·Key ADRs 표, docs/rules/README.md 3개 행 추가, README.md git setup-hooks 스텝

### Phase 2 — code + doc 동시 PR (artifact path 수정)

artifact path 불일치(`<version>/` → `<model-type>/`)는 serving 런타임 버그를 포함하므로 별도 PR로 분리:

1. `ml/serving/model.py` — `FallDetector.__init__` 파라미터 `version → model_type`, artifact_dir 경로 수정, `_load_metadata` fallback dict 수정
2. ADR-003 §3 artifact 경로 예시 블록 교체
3. ADR-009 line 136 경로 템플릿 수정
4. ADR-012 MECE row 1 수정 (Phase 1과 합칠 경우 충돌 방지 확인)
5. docs/rules/ml-filesystem-layout.md 경로 템플릿 수정
6. architecture.md artifacts 트리 + boundary 표 수정

### Phase 3 — 신규 ADR 발행 (선택적, 권고)

`<model-type>/` 레이아웃은 ADR-003이 ratify한 `<version>/` 규약을 실질적으로 대체했으므로 **ADR-015 (model-type-addressed artifact layout)**를 발행해 ADR-003 §3을 공식 supersede 처리하는 것을 권고한다. 이를 통해 미래 agent가 ADR-003과 실제 코드 사이의 불일치를 재발견하지 않도록 방지한다.

### Phase 4 — 소형 단독 PR

- `ml/demo/yolo_overlay.py:64` broad catch 축소 (`except (ImportError, OSError):`) — 코드 변경이므로 docs PR와 분리
- ADR-003 demo docstring 추가 (`ml/demo/app.py` 1행에 triple-quoted docstring 삽입)
- fall-video-crop-rename SKILL.md 미러 2개 동시 수정 (`ml/data/{domain}/raw/` 등 경로 업데이트)
