---
slug: serving-predict-real-inference
date: 2026-06-13
type: brownfield
author: deep-interview (di-serving-predict-adr-2026-06-12)
rounds: 9
final-ambiguity: ~4.5% (threshold 5%)
issues: [23, 9]
related-adrs: [ADR-003, ADR-005, ADR-006, ADR-013, ADR-014, ADR-015]
status: active
---

# Spec — /predict 실추론: API 계약 + 책임 분리의 의도적 강제

> Authority boundary: this spec captures the interviewed implementation target.
> Cross-cutting API/layer decisions become canonical only when ADR-022, ADR-023,
> and `docs/rules/layer-boundaries.md` are written in the implementation work.

## What (한 문장)

`/predict`를 실추론으로 교체하되, API 계약(무엇을 주고받는가)과 폴더/파일 레벨
책임 분리(무엇이 어디 사는가)를 ADR로 확정하고 git-guard hook으로 기계적으로 강제한다.

## 확정 결정 (인터뷰 Round 별)

### D1. API 계약 — 키포인트 윈도우 입력, 모델 이름 불투명 (R1–R2, R9)

```
POST /predict
  Request   { window: [[float; 51]; 30] }        # 키포인트 윈도우 — 원설계(architecture.md PoC) 유지
  → 200     { fall_probability: float,
              operating_threshold: float,         # metadata.json 단일 출처 (ADR-013)
              is_fall: bool }                     # 모델 수준 판정 = prob ≥ operating_threshold
  → 422     형상 불일치 (fail-fast, ADR-014)
```

- **모델 이름 불투명 원칙**: 모델의 정체(이름/종류)는 API 표면에 노출하지 않는다.
  - 응답에서 `model: str`, `version: str` 필드 **제거** (현 `ml/serving/main.py:25-28`과 다름)
  - 요청에 `model_type` 선택권 없음 — 어떤 모델을 쓸지는 serving 배포 설정이 결정
  - 불투명의 범위는 "이름 비노출"까지. 입력 형상(윈도우 규격)은 계약의 일부로 공개
- **`threshold_override` 제거**: 임계값 단일 출처는 metadata.json. 임계값 변경 = 모델 재배포.
  backend가 다른 컷을 원하면 `fall_probability`에 자체 제품 정책 적용(그건 backend 소유 판정).
- **두 층 판정 경계** (ADR-003 §4 정련): 모델 수준 판정(`is_fall`)은 ML 소유,
  제품 수준 판정(이벤트 래치·dedup·알림 정책)은 backend 소유.
- **호출자**: backend (#28 구도 유지). 프레임/비디오는 serving에 들어오지 않는다.

### D2. 모듈 경계 — 최소 추출, ml/inference/ flat 3파일 (R3–R4)

```
ml/
├─ inference/          ← 신설 (공용 추론 코어 — flat, subfolder 없음)
│  ├─ features.py      #   윈도우[30][51] → 피처[45]   (training/data/features.py에서 이동)
│  ├─ artifacts.py     #   ml/models/fall/<type>/ metadata.json 로드 (demo/temporal_module.py 116행 등에서 이동)
│  └─ temporal.py      #   score_window(window) → 확률  (stateless 스코어링만)
├─ serving/            ← inference만 import해 실추론 (placeholder 삭제)
├─ demo/               ← 잔류: seam.py, pose_yolo/yolo_runtime, TemporalFallClassifierModule(스트리밍)
│                          단, 잔류 모듈은 내부에서 inference.* 를 import (중복 제거)
└─ training/           ← features 원본은 inference로 이동, training이 역으로 import
```

- "demo를 얇게"의 **전면 추출은 후속 작업으로 분리** — ADR-023이 점진 추출 경로를 명문화.
- 이번 PR은 `/predict`에 필요한 3파일만 이동 (작고 검증 쉬운 단위).

### D3. 강제 — git-guard hook 전용 (R5–R6)

- 검사 로직: `scripts/git-guard/check-layer-imports.py` (AST 기반, 기존
  `test_util_no_demo_dependency.py` 관용구를 스크립트화) — 규칙은 이 한 곳에만 존재
- 진입점: `.githooks/pre-commit`에 호출 한 줄 추가 (**hook 전용** — pytest 진입점·CI 미러 없음;
  기존 deny-assets 등과 동일한 강제 레벨, ADR-008/016 계열)
- 불변식:
  - `inference` ↛ `demo`, `serving`, `training`
  - `serving` ↛ `demo`, `training` (슬림 이미지 보호 — `uv sync --no-default-groups`)

### D4. 이슈 정렬 — #23 본문 갱신, 신규 이슈 없음 (R7)

- scope를 확정 계약으로 재작성; 제목의 "model-seam + FrameSource" 제거
- **FrameSource 항목 삭제** — 라이브 ingest 경로는 이미 demo에 실현됨 (#39/#47/#81 CLOSED), 별도 백로그 불필요
- `ml/artifacts/<name>/<version>/` → `ml/models/fall/<model_type>/` 경로 정정 (#56/#66, ADR-015)
- `blocked-by #24` 해제 — 실모델 이미 존재(#25/#26 CLOSED), #24는 정확도 이슈지 serving 차단 사유 아님
- `feeds #28, #35` 유지

### D5. 산출물 구성 — ADR 2 + rules 1 (R8)

| 산출물 | 내용 |
|---|---|
| `docs/decisions/ADR-022-predict-contract.md` | D1 — 입력/응답 스키마, 불투명 원칙, 두 층 판정 경계 |
| `docs/decisions/ADR-023-inference-layer.md` | D2+D3 — inference 레이어 신설, 방향 불변식, hook 강제 위치 |
| `docs/rules/layer-boundaries.md` | 허용/금지 import 매트릭스 상세 (ADR-015+rules 짝 패턴) |
| `plan.md` 재작성 | 기존 초안(전면 추출 7단계)은 미커밋 → 최소 범위로 축소 재작성 |
| 이슈 #23 갱신 | D4 |

## 명시적 가정 (spec 편입, 반증 시 재논의)

1. **입력 표현 = 키포인트 윈도우**: 두 차례 선택 우회를 "원설계 유지에 이견 없음"으로 해석
   (근거: docs/architecture.md PoC 데이터 경로 — windowing이 /predict 앞단).
2. **응답에 `operating_threshold`·`is_fall` 포함**: plan 초안 제시 후 무이의.
3. **serving deps += scikit-learn, joblib** (RF 역직렬화). 단 pickle이 `training.models.*`
   클래스를 참조하면 역직렬화가 training import를 유발 — 해당 클래스의 inference 이동 필요 여부를
   plan 단계에서 검증 (sklearn 순수 객체면 불필요).
4. 윈도우 규격(30×51)은 현행 metadata 기준 — 형상 일반화(metadata 기반 검증)는 구현 디테일로 plan에 위임.

## 성공 기준

- [ ] `POST /predict`가 실모델로 추론하고 확정 계약 스키마로 응답 (demo 추론 경로와 동일 입력 → 동일 확률, parity 테스트)
- [ ] 응답/요청 표면에 모델 이름·종류·선택권 부재
- [ ] `uv sync --no-default-groups` 환경에서 serving import 가능 (ultralytics/torch 미설치)
- [ ] 불변식 위반 커밋이 pre-commit에서 차단됨 (가드 스크립트 동작 확인)
- [ ] ADR-022/023 + rules/layer-boundaries.md 작성, #23 본문 갱신

## 범위 제외 (의도적)

- demo 전면 얇게 만들기 (seam/pose_yolo/스트리밍 모듈 추출) — 후속 슬러그
- FrameSource/프레임 ingest의 serving 배선 — 계약상 영구 제외 (D1)
- 가드의 pytest/CI 진입점 — hook 전용 결정 (D3), 필요해지면 그때 승격
- backend #28 구현(호출측) — 이 작업은 계약 제공까지
