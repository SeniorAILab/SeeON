```yaml
slug: demo-ui-row-selectors-and-size-labels
issue: "#57, #58"
date: 2026-06-10
author: claude-fable-5
status: done
```

# 데모 UI — 도메인/종류 row 선택 + 사이즈 [size]/[hardware] 표기

## Problem

1. (#57) 운영자 모드 영상 선택이 [도메인 드롭다운] → [Video 목록(processed+raw
   혼합)]이라 역할 구분이 목록 안에 섞여 있다. 사용자: 도메인을 row로 클릭하고
   영상 종류를 클릭하는 흐름이 자연스럽다.
2. (#58) YOLO26-pose 사이즈 셀렉터가 한 글자(n/s/m/l/x)만 보여줘 비전공자가
   체감 비용을 알 수 없다. 사용자: `[size]/[hardware]` 형태로 어느 급에서
   돌아가는지 함께 표기.

## Design

### 1. (#57) `_list_videos_for_mode` operator 분기 — row 선택

- `st.columns(2)` 한 row: 왼쪽 도메인, 오른쪽 종류(역할).
- 위젯: `st.segmented_control` 사용 가능 시(streamlit>=1.38 핀이지만 설치본
  확인) 우선, 미지원이면 `st.radio(horizontal=True)` — 구현 시 설치 버전으로
  판단해 한 가지로 확정 (런타임 분기 금지).
- 도메인 축: `videos.list_domains() + [UPLOADS_DOMAIN]` (기존과 동일).
- 종류 축: 선택된 도메인 아래 실재하는 역할만 노출 (raw/processed —
  video_registry에서 도출). uploads 도메인은 종류 축 비노출(단일 목록).
- Video 목록: 선택된 (도메인, 종류) 조합의 클립만. 기존 FALL_DEMO_MODE
  접근 분리(public=업로드 전용)는 그대로 — public 분기 무변경.

### 2. (#58) 사이즈 표기 — `[size]/[hardware]`

- `model_modules.py`에 표시 매핑 상수 추가 (이슈 #58 코멘트의 확정안):
  - n: `nano / 일반 PC·노트북 (실시간)`
  - s: `small / 일반 노트북 (준실시간)`
  - m: `medium / GPU·Apple Silicon 권장`
  - l: `large / 전용 GPU 권장`
  - x: `xlarge / 고성능 GPU (정밀 분석용)`
- `app.py`와 `pages/live_camera.py`의 size selectbox에 `format_func` 적용 +
  `help=` 툴팁: "사이즈가 클수록 정확도↑ 속도↓" 한 줄.
- 반환값은 기존 한 글자 키 유지 — `pose_weight_filename` 등 하위 계약 무변경.

## Tests

- video 선택 로직 중 순수 부분(도메인→역할 도출, 조합 필터)은
  video_registry 기존 테스트 패턴으로 단위 테스트 추가.
- 사이즈 표시 매핑: `POSE_MODEL_SIZES`의 모든 키가 매핑에 존재함을 단언
  (표기 누락 방지).
- Streamlit 위젯 자체는 단위 테스트 비대상 (기존 관례).

## Steps

1. plan 커밋 (finalize).
2. (#58) model_modules 매핑 + 두 페이지 format_func/help.
3. (#57) operator 분기 row 선택 재구성 + registry 헬퍼/테스트.
4. `cd ml && uv run ruff check . && uv run pytest -q` 그린.
5. 커밋 (PR은 오케스트레이터 생성).

## Non-goals

- public 모드 UI 변경 (세션 업로드 전용 유지 — 요양원 데이터 비노출 불변).
- 박스 라벨/오버레이 (#65 소관), 분류기·temporal 로직.
- 사이즈별 자동 추천/벤치마크 측정.
