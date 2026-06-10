```yaml
slug: english-box-labels
issue: "#65"
date: 2026-06-10
author: claude-fable-5
```

# 박스 라벨 영어 통일(FALL/NORMAL) + PIL 한글 렌더러 제거

## Problem

한글 박스 라벨("낙상/정상")은 PIL 렌더러 + 시스템 폰트 탐색 + ASCII 폴백
(#59, PR #63)을 요구한다. CJK 폰트 없는 배포 환경에선 어차피 영어 폴백으로
떨어지고, 프레임당 ndarray↔PIL 왕복 비용이 라이브 뷰 핫패스에 얹힌다.
사용자 결정: 박스 라벨은 영어로 통일, 복잡도 제거.

## Design

1. **라벨 텍스트**: `classifier_module.py`와 `temporal_module.py`의
   `"낙상"`→`"FALL"`, `"정상"`→`"NORMAL"`. 두 모듈이 같은 어휘를 쓰도록
   상수 `FALL_LABEL_TEXT = "FALL"`, `NORMAL_LABEL_TEXT = "NORMAL"`를
   `demo/seam.py`에 두고 양쪽이 임포트 (어휘 분기 재발 방지 — #59의
   원인이 두 모듈의 어휘 불일치였음).
2. **yolo_overlay.py 단순화**: PR #63이 추가한 PIL 경로 전부 제거 —
   `_load_pil_font`, `_draw_caption_pil`, `_ascii_fallback_text`,
   `_HANGUL_FONT_CANDIDATES`, `_HANGUL_ASCII_FALLBACK`, `_font_candidates`
   kwarg. `_draw_caption`은 cv2 단일 경로(원래 형태)로 복원.
3. **의존성**: `pyproject.toml` demo 그룹의 명시 `pillow` 제거
   (PIL 직접 임포트가 사라지므로; streamlit 경유 전이 의존은 그대로).
   `uv lock` 갱신.
4. **비분류 박스**: rule-based 경로의 non-primary `"person"`은 유지 —
   분류 결과가 아니라 탐지 표시. 박스 외 한국어 UI(사이드바 상태 등) 유지.

## Tests

- 라벨 텍스트 단언 갱신: classifier/temporal 테스트의 "낙상"/"정상" →
  "FALL"/"NORMAL" (seam 상수로 단언).
- `test_demo_yolo_overlay.py`: PIL 전용 테스트 제거, cv2 경로 검증으로 대체
  (영어 라벨 렌더 시 캡션 영역 픽셀 변화 + 예외 없음).

## Steps

1. plan 커밋 (finalize).
2. seam 상수 + 두 모듈 라벨 교체 + overlay 단순화 + pyproject/uv.lock.
3. 테스트 갱신, `cd ml && uv run ruff check . && uv run pytest -q` 그린.
4. 커밋 (PR은 오케스트레이터 생성).

## Non-goals

- 사이드바/페이지 한국어 텍스트 변경.
- rule-based 경로의 다인 분류화 (temporal 모델이 담당, #46 완료).
- tracking/temporal 로직 변경.
