---
slug: serving-predict-real-inference
date: 2026-06-13
author: gobeumsu
status: active
issues: [23, 9]
related-adrs: [ADR-003, ADR-005, ADR-006, ADR-013, ADR-014, ADR-015]
spec: ./spec.md
---

# Plan — FastAPI `/predict` 실추론: 최소 추출 + 계약 확정 + hook 강제

> spec.md(deep-interview 9라운드 수렴)의 구현 계획. 이전 초안(전면 추출 7단계)은
> 인터뷰에서 **최소 추출**로 축소 확정되어 본 문서로 대체되었다 (plan 미커밋 상태의 재작성).
>
> 세 축: (1) `/predict` 실추론 — 더미(`len(window)/100`) 교체 + 모델 이름 불투명 계약,
> (2) `ml/inference/` flat 3파일 최소 추출, (3) git-guard hook으로 import 방향 강제.

## Authority Boundary

This plan is the work queue for #23, not the final architectural record. The
cross-cutting choices named here must be distilled into ADR-022/ADR-023 and
`docs/rules/layer-boundaries.md` before implementation code starts; until those
artifacts land, this document is a scoped plan/spec record rather than the source
of architectural authority.

## Requirements Summary (spec.md 확정 결정의 구현 번역)

1. **계약 (D1)**: `POST /predict { window: [[float;51];30] } → { fall_probability, operating_threshold, is_fall }`.
   모델 이름/종류/선택권/`threshold_override` 모두 표면 비노출. 임계값 단일 출처 = metadata.json (ADR-013).
   형상 불일치 422, 아티팩트 부재 시 기동 실패 (ADR-014).
2. **모듈 (D2)**: `ml/inference/` flat 3파일 — `features.py`(training에서 이동),
   `artifacts.py`·`temporal.py`(demo/temporal_module.py에서 추출). seam·pose_yolo·스트리밍
   모듈은 demo 잔류(내부에서 inference를 import). demo 전면 슬림화는 후속 슬러그.
3. **강제 (D3)**: `scripts/git-guard/check-layer-imports.py`(AST) + `.githooks/pre-commit` 한 줄.
   hook 전용 — pytest/CI 진입점 없음.
4. **모델 선택은 배포 설정**: env `FALL_MODEL_TYPE`(기본 `random-forest`)·`FALL_MODELS_DIR`
   (기본 `ml/models`) — API 표면이 아닌 serving 내부에서 해석.
5. **의존성**: serving 코어에 `scikit-learn`, `joblib` 추가 (검증 완료: RF 아티팩트는
   `rf.py:61`에서 내부 sklearn 객체만 dump — training 클래스 참조 없음, 역직렬화에 sklearn만 필요).
6. **산출물 (D5)**: ADR-022(계약)·ADR-023(레이어)·`rules/layer-boundaries.md`·이슈 #23 갱신.

### Scope — 포함 / 제외

| 포함 | 제외 (후속) |
|---|---|
| `/predict` 실추론 (RF, stateless, 윈도우=1인 트랙) | demo 전면 슬림화 (seam/pose_yolo/스트리밍 추출) — 별도 슬러그 |
| `ml/inference/` 3파일 추출 + demo/training 역참조 | FrameSource→serving 배선 — **계약상 영구 제외** (spec D1) |
| git-guard import 방향 가드 (hook 전용) | backend NestJS 호출자 (#28, 별도 plan) |
| ADR-022/023 + rules/layer-boundaries.md + #23 갱신 | LSTM/Transformer 서빙 (torch/ONNX 결정 필요) |
| serving deps + 슬림 환경 검증 | Dockerfile/배포 (ADR-021로 호스팅 미결 — 후속) |

## API Contract (target)

```
GET /health
  → 200 { status, window, stride, feature_mode, operating_threshold }
  (모델 이름/종류/버전 비노출 — 불투명 원칙은 /health에도 적용.
   아티팩트 미로드 시 프로세스는 기동 자체를 실패한다 — degraded 응답 없음)

POST /predict
  Request  { window: [[float; 51]; 30] }
  → 200    { fall_probability: float, operating_threshold: float, is_fall: bool }
  → 422    형상 불일치 (프레임 수 ≠ metadata window, 벡터 길이 ≠ 51, 값 비유한)
```

- `window` 의미: `normalize_person_keypoints` 출력과 동일 표현 (COCO-17 × (x,y,conf),
  conf 게이트 0.2 후 정규화 좌표). 피처 추출(`[45]`)은 serving 내부 책임.
- 단일 인물 트랙 가정을 OpenAPI description에 명시 ("one window = one tracked person").
- 현 `main.py:25-28`의 `PredictResponse(model, version, ...)`에서 `model`/`version` 필드 삭제.

## Target Layout

| 신규 위치 | 이동/추출 원본 | 내용 | 의존 티어 |
|---|---|---|---|
| `ml/inference/features.py` | `ml/training/data/features.py`의 `extract_window_features` (move) | 윈도우[30][51] → `[45]` RF 피처 | numpy |
| `ml/inference/artifacts.py` | `ml/demo/temporal_module.py`의 `load_metadata`(:116)·`_KEY_TO_ARTIFACT`(:53)·RF 로더 (extract) | metadata 계약 검증(`window`/`stride`/`operating_threshold` 필수) + `model.pkl` joblib 로드 | joblib/sklearn |
| `ml/inference/temporal.py` | `ml/demo/temporal_module.py`의 스코어 코어(:271 predict_proba 경로) (extract) | `score_window(window) -> WindowVerdict(prob, threshold, is_fall)` — stateless | numpy + sklearn |
| `ml/inference/__init__.py` | 신규 | `load_fall_model(model_type, models_dir) -> FallScorer` (완전 구성 — 설정값 전부 metadata 출처) | — |
| `scripts/git-guard/check-layer-imports.py` | 신규 (`test_util_no_demo_dependency.py` 관용구의 스크립트화) | AST 검사: `inference` ↛ demo/serving/training, `serving` ↛ demo/training | stdlib |

**demo/training 역참조**: `demo/temporal_module.py`는 이동된 정의를 `inference.*`에서 import
(스트리밍 ring-buffer·tracker·stride 트리거는 demo 잔류). `training/data/features.py`는
`inference.features`를 re-import (정의는 한 곳 — shim 아닌 단일 정의 이동, ADR-014 정신).

## Implementation Steps

### Step 1 — `ml/inference/` 추출 (move-only 커밋)

- Target Layout대로 함수 본문 무수정 이동/추출. demo/training의 import 경로 갱신 포함.
- 커밋 경계: 이 커밋엔 동작 변화 없음 — 기존 demo/training pytest green으로 검증.

### Step 2 — git-guard 가드 (작은 독립 커밋)

- `scripts/git-guard/check-layer-imports.py`: `ml/inference/`·`ml/serving/` 전 `.py`를 AST 순회,
  금지 import 발견 시 위반 목록 출력 + exit 1. 이스케이프 해치 `GIT_GUARD_ALLOW_LAYERS=1`
  (기존 deny-assets 패턴 동형).
- `.githooks/pre-commit`에 호출 한 줄 추가 (기존 "Zero inline logic" 원칙 유지).

### Step 3 — `ml/serving/model.py` 실추론 교체

- `FallDetector` 삭제급 재작성:
  - lifespan 기동 시 `inference.load_fall_model(FALL_MODEL_TYPE, FALL_MODELS_DIR)` 1회.
    아티팩트/metadata 부재·필수 키 결손 시 typed exception으로 **기동 실패**
    (현 `model.py:26-30` placeholder dict 폴백 삭제 — ADR-014).
  - 요청 처리: `scorer.score_window(window)` → `WindowVerdict`.

### Step 4 — `ml/serving/main.py` 계약 적용

- `PredictRequest`: pydantic validator — 프레임 수 = metadata `window`, 벡터 길이 = 51, finite.
- `PredictResponse`: `fall_probability` + `operating_threshold` + `is_fall` — `model`/`version` 제거.
- `/health`: `status`/`window`/`stride`/`feature_mode`/`operating_threshold`만.

### Step 5 — 의존성

- `ml/pyproject.toml` `dependencies` += `scikit-learn>=1.5`, `joblib>=1.4` (training 그룹과 제약 일치).

### Step 6 — 테스트

- `ml/tests/test_serving.py` (TestClient): 초소형 RF를 테스트 내 학습 → tmp dir에
  `model.pkl`+`metadata.json` → `FALL_MODELS_DIR` 주입.
  - `/predict` 정상 → 200, `prob ∈ [0,1]`, `is_fall == (prob >= operating_threshold)`
  - 응답에 `model`/`version` 키 부재 (불투명 계약 회귀 방지)
  - 형상 위반 3종 (29프레임/50차원/NaN) → 422
  - 아티팩트 부재 → 기동 실패 (typed exception)
  - `/health` 200 + 4개 메타 필드, 모델 정체 필드 부재
- parity 테스트: 동일 키포인트 윈도우 → demo 경로와 `score_window` 확률 일치.
- 가드 스크립트 자체 검증: 위반 파일을 tmp에 만들어 exit 1 확인 (스크립트 단위 테스트 1개 —
  가드의 **진입점**은 hook 전용이되, 가드 코드 자체의 동작 검증은 일반 테스트로).
- 슬림 검증: 별도 venv `uv sync --no-default-groups` 후 serving import + 테스트 서브셋.

### Step 7 — 문서·이슈 정렬

- `docs/decisions/ADR-022-predict-contract.md` — 입력/응답 스키마, 모델 이름 불투명 원칙,
  두 층 판정 경계(모델 수준 = ML / 제품 수준 = backend), threshold 단일 출처.
  ADR-003 §4 계약(`fall_probability` 단일 출력)을 부분 supersede.
- `docs/decisions/ADR-023-inference-layer.md` — `ml/inference/` 신설(최소 추출 + 점진 확장 경로),
  import 방향 불변식, hook 전용 강제 위치 (ADR-008/016 계열).
- `docs/rules/layer-boundaries.md` — 허용/금지 import 매트릭스 상세 (ADR-015+rules 짝 패턴).
- `docs/architecture.md` — 디렉토리 트리(`ml/inference/`), 응답 스키마 갱신.
- 이슈 #23 본문 갱신: scope 재작성, FrameSource 항목 삭제(demo에 기실현 — #39/#47/#81),
  `ml/artifacts/` → `ml/models/` 경로 정정, `blocked-by #24` 해제, feeds #28/#35 유지.

## Acceptance Criteria

1. `ml/serving/model.py`에 더미 확률(`len(window)/100`)·placeholder 폴백 grep 0건.
2. RF 아티팩트 환경에서 기동 → 유효 30×51 윈도우 POST → 200,
   `is_fall == (fall_probability >= operating_threshold)`.
3. `/predict`·`/health` 응답 어디에도 모델 이름/종류/버전 필드가 없다 (테스트로 고정).
4. 형상 위반 3종 → 422. 아티팩트 부재 → 기동 실패.
5. parity: 동일 윈도우에 demo 경로와 serving 경로 확률 일치.
6. 가드: 위반 import를 담은 커밋이 pre-commit에서 차단된다 (수동 1회 + 스크립트 단위 테스트).
7. `uv sync --no-default-groups` 환경에서 serving 테스트 서브셋 통과 (ultralytics/torch 부재).
8. 기존 `ml/` 전체 pytest + ruff green.
9. ADR-022/023 + rules/layer-boundaries.md 존재, #23 본문이 확정 계약과 일치.

## Risks & Mitigations

| risk | mitigation |
|---|---|
| 추출로 demo/training 회귀 | Step 1 move-only 커밋 분리 + 기존 테스트 전체 green + parity 테스트 |
| 구버전 metadata에 `window`/`operating_threshold` 키 부재 | `inference.artifacts`가 필수 키 검증 후 typed error (ADR-015 메타 계약) |
| 호출자가 정규화 표현을 잘못 구성 | `/health` 형상 공표 + OpenAPI description에 표현 정의 + 422 검증 |
| hook 전용 가드의 `--no-verify` 우회 | 의도적 수용 (spec D3 — 기존 deny-assets와 동일 강제 레벨); 위반 누적 시 CI 승격은 후속 |
| sklearn 추가로 슬림 취지 희석 | sklearn/joblib 2개 한정; torch 계열은 후속 결정으로 격리 |

## Verification Steps

1. `uv run --directory ml pytest` — 전체 green.
2. `uv run --directory ml ruff check .` — clean.
3. 수동 e2e: 아티팩트 배치 → uvicorn 기동 → `curl /health` → poses 캐시에서 윈도우 1개 추출해
   `curl POST /predict` → 계약 필드 확인 (모델 정체 필드 부재 포함).
4. 수동 demo 회귀: 업로드 클립 1개 라이브 추론 + 배지 동작 불변.
5. 가드 수동: 임시 위반 import 커밋 시도 → pre-commit 차단 확인 → revert.

## Follow-ups (별도 슬러그/이슈)

- demo 전면 슬림화 — seam/pose_yolo/스트리밍 모듈의 inference 추출 (ADR-023이 경로 명문화).
- #28 backend 호출자 + Prediction 영속화 (이 계약 소비).
- #36 realtime transport 결정 후 라이브 ingest 경로.
- LSTM/Transformer 서빙 (torch 동봉 vs ONNX).
- Dockerfile/배포 — 호스팅 결정(ADR-021 후속) 시.
