# Button / Control Verification Report

**Date**: 2026-06-13
**Mode**: `FALL_DEMO_MODE=operator`
**Test harness**: `streamlit.testing.v1.AppTest`
**Test file**: `ml/tests/test_demo_app_controls.py`
**Streamlit version**: 1.58.0

---

## Boot Smoke

| Check | Expected | Result |
|-------|----------|--------|
| HTTP GET `http://localhost:8599/` after 18 s | 200 | **200 PASS** |
| Tracebacks in server log | none | **none PASS** |

Server log tail (no errors):
```
Uvicorn server started on 0.0.0.0:8599
  Local URL: http://localhost:8599
  Network URL: http://192.168.219.52:8599
  External URL: http://182.220.172.167:8599
```

---

## Interactive Control Verification

| # | Control | Action | Expected | Result |
|---|---------|--------|----------|--------|
| 0 | App boot (operator mode) | `AppTest.run()` — first run | No exception | **PASS** |
| 1 | `file_uploader` "영상 추가 업로드" | Assert widget present, label correct | Widget found | **PASS** |
| 2a | `segmented_control` "도메인" | Assert present, label correct | Widget found | **PASS** |
| 2b | `segmented_control` "도메인" | `set_value(option)` for each of le2i / nursing-home / uploads | No exception per option | **PASS** |
| 3a | `segmented_control` "종류" | Assert present after domain selection | Widget found | **PASS** |
| 3b | `segmented_control` "종류" | `set_value(role)` for each of processed / raw | No exception per role | **PASS** |
| 4a | `selectbox` "영상" | Assert present, options > 0 | 176 domain options found | **PASS** |
| 4b | `selectbox` "영상" | Assert default selection is non-null | Default value present | **PASS** |
| 5a | `selectbox` "분류 모델" | Assert present | Widget found | **PASS** |
| 5b | `selectbox` "분류 모델" | `select(spec)` for all 7 entries incl. 준비중 | No exception; 준비중 shows info notice | **PASS** |
| 6a | `slider` "판정 임계값 (낙상 확률)" | Assert absent when rule_based (index 0) is selected | 0 sliders | **PASS** |
| 6b | `slider` "판정 임계값 (낙상 확률)" | Assert present after selecting an available temporal model (random_forest) | 1 slider, correct label | **PASS** |
| 6c | `slider` "판정 임계값 (낙상 확률)" | `set_value(0.5)` then re-run | `slider.value ≈ 0.5` | **PASS** |
| 7a | `number_input` ×4 in "탐지 파라미터" expander | Assert all four labels present | All four found | **PASS** |
| 7b | `number_input` "신뢰도 임계값 (conf)" | `set_value(0.25)` then re-run | value ≈ 0.25, no exception | **PASS** |
| 7c | `number_input` "윈도우 (프레임)" | `set_value(30)` then re-run | value = 30, no exception | **PASS** |
| 7d | `number_input` "스트라이드 (프레임)" | `set_value(5)` then re-run | value = 5, no exception | **PASS** |
| 7e | `number_input` "낙상 판단 지속시간 (초)" | `set_value(3.0)` then re-run | value ≈ 3.0, no exception | **PASS** |
| 8a | `selectbox` "YOLO26-pose 크기" | Assert present | Widget found | **PASS** |
| 8b | `selectbox` "YOLO26-pose 크기" | `select(size)` for each of n / s / m / l / x | No exception per size | **PASS** |
| 9a | `checkbox` "바운딩 박스" | Assert present, default=True | Found, value=True | **PASS** |
| 9b | `checkbox` "포즈 스켈레톤" | Assert present, default=True | Found, value=True | **PASS** |
| 9c | Both overlay checkboxes | All 4 combinations (FF/TF/FT/TT) via `set_value` | No exception any combination | **PASS** |
| 10a | `button` "재생" | Assert present, correct label | Button found | **PASS** |
| 10b | `button` "정지" | Assert present, correct label | Button found | **PASS** |
| 10c | `button` "정지" | Pre-set `live_playing=True`, click 정지, re-run | `session_state["live_playing"] is False`, no exception, no video loop entered | **PASS** |
| 10d | `live_playing` default | Assert falsy on first run (no button pressed) | Not set / False | **PASS** |

**Total: 30 / 30 PASS, 0 FAIL**

---

## Notes and Findings

### AppTest limitation: `select_index()` incompatible with `format_func` selectboxes

Streamlit 1.58 AppTest `Selectbox.select_index(i)` stores the **formatted display string** as the
widget value, but `Selectbox._widget_state` then re-applies `format_func` to that stored string when
computing the selection index on the next `at.run()`. This causes a `KeyError` / `AttributeError`
for any selectbox with a non-identity `format_func` (video, classifier, YOLO size selectboxes).

**Fix applied in tests**: use `selectbox.select(raw_value)` instead of `select_index(i)`, passing the
actual Python option object (`ClassifierSpec`, `RegisteredVideo`, size string).
**Action for demo code**: none required — this is a test-harness limitation, not a demo bug.

### Play button (재생) blocking caveat

Calling `at.run()` after clicking 재생 would enter the per-frame video inference loop, blocking until
the clip completes. Tests verify:
- The button exists with the correct label (item 10a).
- The inverse state transition (10c): pre-setting `live_playing=True` then clicking 정지 safely short-
  circuits the loop guard and resets state to False without blocking.

The source contract (`demo/demo_ui.py` line 64–65) confirms the play handler unconditionally writes
`st.session_state[playing_key] = True`.

---

## Test Run Output

```
30 passed in 4.71s
```
