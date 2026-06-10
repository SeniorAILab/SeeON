```yaml
slug: hangul-box-labels
issue: "#59"
status: done
date: 2026-06-10
author: claude-fable-5
```

# 박스 라벨 "낙상" 실표기 — rule-based 텍스트 개명 + 한글 캡션 렌더링

## Problem

박스 캡션을 "낙상/정상"으로 바꾸기로 했으나 두 결함이 겹쳐 실제로는 보이지 않는다:

1. rule-based 경로(`ml/demo/classifier_module.py:46`)는 여전히 `"fall"`/`"person"`을
   내보낸다 — 개명이 `temporal_module.py`에만 적용됨.
2. `ml/demo/yolo_overlay.py`의 캡션은 `cv2.putText(FONT_HERSHEY_SIMPLEX)` — Hershey
   폰트는 Latin 전용이라 한글 코드포인트를 조용히 드롭, temporal 모듈의 "낙상"도
   빈 캡션으로 렌더된다.

## Design

### 1. classifier_module.py — 라벨 텍스트 통일

- fall → `"낙상"`, 비낙상 → `"정상"` (temporal_module.py와 동일 어휘).
- pose 전용 `YoloPoseModule`(model_modules.py)의 `"person"`은 분류기가 없는 경로이므로
  유지 — 분류 결과가 아니라 탐지 표시이기 때문.

### 2. yolo_overlay.py — 한글 가능 캡션 렌더러

- `_draw_caption`의 텍스트 드로잉을 PIL(`ImageDraw` + `ImageFont.truetype`)로 교체.
  Pillow는 streamlit 의존성으로 이미 설치되어 있음 (demo 그룹에 명시 추가).
- 폰트 탐색: 후보 경로 리스트를 순서대로 시도, 첫 존재 폰트 채택, 모듈 레벨 1회
  캐시(`functools.lru_cache` 또는 module-level lazy singleton):
  - macOS: `/System/Library/Fonts/AppleSDGothicNeo.ttc`
  - Linux: `/usr/share/fonts/truetype/nanum/NanumGothic.ttf`,
    `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`
- 한글 폰트를 못 찾으면 기존 `cv2.putText` 경로로 폴백 — 이때 한글 라벨은 드롭되므로
  ASCII 폴백 텍스트(낙상→`"FALL"`, 정상→`"OK"`)로 변환해 그린다. 변환 매핑은
  yolo_overlay 내부 상수.
- 박스/스켈레톤 드로잉은 cv2 유지 — PIL 전환은 캡션 텍스트만 (numpy↔PIL 변환은
  캡션 영역 처리 시 1회, 프레임 전체 1회 변환으로 단순화 가능; 성능상 프레임당
  1회 ndarray↔Image 왕복은 허용).

### 3. Tests

- `test_demo_classifier_module.py`(존재 시) 또는 해당 테스트: fall 시 라벨 텍스트
  `"낙상"`, 비낙상 시 `"정상"` 단언으로 갱신.
- `test_demo_yolo_overlay.py`: 한글 라벨로 render_yolo_overlay 호출 시 예외 없이
  ndarray 반환 + 캡션 영역 픽셀이 배경과 달라짐(글자가 실제로 그려짐) 단언;
  폰트 부재 폴백 경로는 후보 리스트를 빈 값으로 강제해 ASCII 폴백 동작 단언.

## Steps

1. plan 커밋 (finalize).
2. classifier_module.py 텍스트 교체 + 테스트 갱신.
3. yolo_overlay.py PIL 캡션 렌더러 + 폰트 탐색/폴백 + 테스트.
4. `cd ml && uv run ruff check . && uv run pytest -q` 그린.
5. 커밋 (PR은 오케스트레이터가 생성).

## Non-goals

- temporal_module.py / tracking 변경 (#46 워크트리 소관 — 파일 겹침 금지).
- 오버레이 스타일 개편(색·두께·스켈레톤) — 캡션 텍스트 렌더링만.
