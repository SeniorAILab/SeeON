```yaml
slug: ml-models-consolidation
issue: "#56"
date: 2026-06-10
author: claude-fable-5
status: done
```

# ml/models/ 단일 루트 — weights + artifacts 통합

## Problem

모델류가 `ml/weights/`(YOLO pose 캐시), `ml/artifacts/fall-detector/`
(학습 산출물), `ml/artifacts/pretrained/`(제3자 비교 체크포인트) 세 곳에
흩어져 있다. 정합성 감사에서 serving 코드의 `version` 파라미터 오명명과
문서 경로 템플릿(`<name>/<version>/`) 불일치도 확인됐다(#66에서 이관).

## Design — 사용자 인터뷰 확정 (2026-06-10)

### 1. 레이아웃

```
ml/models/
├── pose/                      # YOLO pose 가중치 (ephemeral, 재다운로드 가능)
│   ├── yolo26{n,s,m,l,x}-pose.pt
│   └── metadata.json
└── fall/                      # 낙상 분류 모델 (기능 축)
    ├── random-forest/         # (구 rf — 폴더명·코드 model_type 키 모두 개명)
    ├── lstm/
    ├── transformer/
    └── pretrained/            # 제3자 비교 체크포인트 (용도가 낙상탐지라 fall 하위)
        ├── melihuzunoglu_yolo11/
        ├── syed_yolo11_le2i/
        └── tomotsugu_yolov8/
```

- 1계층은 기능 축만: `{pose, fall}`. ephemeral/durable·출처 구분은
  폴더가 아니라 metadata가 담당.
- version 디렉토리 없음 — version은 metadata.json 내부 필드.

### 2. metadata.json 의무화 (ephemeral/durable 규약)

모든 모델 폴더(pose/ 루트, fall/<type>/, fall/pretrained/<name>/)에
metadata.json 강제:

- `source`: `downloaded` | `trained` | `third-party`
- `reacquire`: 재획득 방법 (다운로드 출처 또는 학습 커맨드)
- `version`: 학습 산출물 필수, 기존 필드 유지
- 기존 fall-detector/pretrained metadata.json은 필드 추가로 보강,
  pose/는 신규 작성.

### 3. 코드 변경

- `ml/serving/model.py`: `FallDetector.__init__` `version` → `model_type`
  파라미터 리네임, artifact 경로 산식 `ml/models/fall/<model_type>/`,
  `_load_metadata` fallback 갱신. 호출부·테스트 전수 갱신.
- model_type 키 `"rf"` → `"random-forest"` 전역 개명 (training config·
  CLI 선택지·metadata.json·테스트·demo classifiers 레지스트리 등 grep 전수).
- `ml/demo/model_modules.py` `WEIGHTS_DIR` → `ml/models/pose/`,
  `ml/training/` 경로 상수(`metadata.artifact_dir`, extract/evaluate의
  weights 참조) → 새 루트.
- 물리 이동은 main 체크아웃 store 기준 `git mv`/`mv` (gitignore 대상이라
  사실상 mv) — ADR-012 도메인 이동과 동일 패턴.

### 4. 인프라 (셋 전부 적용)

- `.gitignore`: `ml/weights`, `ml/artifacts/pretrained/`,
  `ml/artifacts/fall-detector` 세 항목 → `ml/models` 단일 항목.
- `scripts/git-guard/wt.sh`: `link_ml_data()`와 동일 패턴으로
  `ml/models` 자동 symlink 추가 (#45의 수동 링크 자동화).
- 기존 워크트리에 남은 구 경로 symlink 정리는 비대상 (새 워크트리부터 적용).

### 5. 문서

- **ADR-015-ml-models-single-root.md** 발행 (ACCEPTED):
  레이아웃·metadata 규약·model_type 축 결정 기록.
  ADR-003 §3(artifact 레이아웃)과 ADR-007의 weights/artifacts 관련 row
  supersede — 두 ADR의 status header에 상호 참조 추가 (본문 불변).
  docs/decisions/README.md 인덱스 갱신.
- **docs/rules/ml-models.md** 신규: metadata.json 의무 필드, 재획득 규약,
  커밋 금지(전체 gitignore) 명시. docs/rules/README.md에 행 추가.
- #66에서 이관된 경로 템플릿 수정: ADR-009 line 136, ADR-012 MECE row 1
  (+footnote), docs/rules/ml-filesystem-layout.md — 전부
  `ml/models/fall/<model_type>/` 기준으로.
- architecture.md 트리의 weights/artifacts 항목 → ml/models.

## Tests

- `cd ml && uv run ruff check . && uv run pytest -q` 그린.
- serving 테스트가 `model_type="random-forest"` 경로를 커버하는지 확인,
  부족하면 추가. 데모 기동 경로(pose_weight_path)는 기존 테스트로 커버.
- 물리 이동 후 Streamlit 운영자 모드 스모크(모델 로드)는 오케스트레이터가 수행.

## Steps

1. plan 커밋 (finalize). **실행은 #66(docs-only align) 머지 후 리베이스하고
   시작** — ADR-003/007, decisions/README.md, rules/README.md 충돌 방지.
2. 코드 경로/개명 변경 + 테스트 (이동 전 커밋).
3. 물리 이동(main store) + gitignore + wt.sh.
4. 문서(ADR-015, rules/ml-models.md, 이관 항목) 커밋.
5. 게이트 그린 확인 후 보고 (PR은 오케스트레이터 생성).

## Non-goals

- 모델 버전 이력 관리(레지스트리/원격 스토리지) 도입.
- ml/data 레이아웃(ADR-012 영역) 변경.
- 기존 학습 산출물 재학습 — 파일은 그대로, 위치·메타만 변경.
