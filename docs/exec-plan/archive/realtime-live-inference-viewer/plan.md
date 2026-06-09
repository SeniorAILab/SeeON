---
slug: realtime-live-inference-viewer
issue: 39
status: done
adr: ADR-010
author: gobeumsu
---

# Plan — 실시간 프레임별 라이브 추론 뷰어 (issue #39)

ADR-010(실시간 per-frame 라이브 추론 = 표준 데모 관찰 모드)의 구현. 사전렌더 플레이어를 제거하고
`st.empty()` 증분 렌더 라이브 루프로 교체한다. 분류기 시임(`FallClassifierModule`)은 이미 머지되어
있으므로 재사용한다 — 스텁을 새로 만들지 않는다.

## Acceptance Criteria

1. `streamlit run ml/demo/app.py` → `data/processed` 클립 선택 → **재생** 시 프레임이 단일
   `st.empty()`에 **증분** 렌더된다(클립이 끝나기 전 오버레이가 보임). 사전 mp4 렌더 단계 없음.
2. 상태 영역(별도 `st.empty()`)이 `정상`(녹색) / `낙상`(빨강) + confidence + `time_sec`를 실시간
   표시. `FallClassifierModule`이 `is_fall=True`를 내면 같은 프레임에서 박스가 빨강(`FALL_BOX_COLOR`)
   이 되고 뱃지가 `낙상`으로 전환된다.
3. 라이브 프레임 생성기는 **순수·임포트 가능·비 Streamlit** 함수로, fake `FrameSource` + fake
   `ModelModule`(ultralytics/st 없이)로 단위 테스트된다: 소스 프레임당 1개 항목을 순서대로 yield,
   낙상 프레임은 `is_fall=True`.
4. 재생마다 분류기 상태가 초기화된다(매 재생 새 `FallClassifierModule`/분류기 인스턴스) — 재실행 시
   이전 낙상 상태를 물려받지 않는다.
5. 사전렌더 경로 완전 제거: `ml/demo/annotated_video.py` + `ml/tests/test_annotated_video.py` 삭제,
   `ml/` 어디에도 `build_annotated_video`/`annotated_video_path` 참조 없음, `app.py`에 `st.video(` 없음.
6. 분류기 선택 + 탐지 파라미터 UI 유지, 라이브 루프에 연결(동일 `ClassifierParams`).
7. `pnpm lint` 통과, `cd ml && uv run pytest` 통과.

## Implementation (구현됨)

- **`ml/demo/live_view.py` (신규)** — `iter_live_frames(source, model, *, show_boxes, show_pose)`:
  프레임마다 `model.predict` → `render_yolo_overlay` → `current_playback_status`,
  `(overlay, status, confidence)` yield. Streamlit/cv2-capture/ultralytics 미의존.
- **`ml/demo/app.py` (재작성)** — `_render_native_player` → `_render_live_viewer`:
  재생/정지(`session_state`), `_build_model`(pose 또는 pose+분류기, 매 재생 새 인스턴스),
  `VideoFileSource` 스트리밍, `st.empty()` 2개(상태/프레임), `perf_counter` 기반 실시간 페이싱.
  분류기 selectbox + 파라미터 UI 유지.
- **삭제** — `ml/demo/annotated_video.py`, `ml/tests/test_annotated_video.py`.
- **`ml/tests/test_yolo_overlay.py`** — `test_live_path_is_wired_through_the_seam`를 라이브 체인
  (app.py→live_view, app.py→model_modules, live_view→seam)으로 갱신.
- **`ml/tests/test_live_view.py` (신규)** — fake 소스/모델 + scripted 낙상 프레임으로 순서·낙상·shape 검증.

## Risks / Notes

- **Streamlit 단일 스레드:** 렌더 루프가 스크립트 실행을 블록하므로 `정지`는 다음 rerun 시작 시 반영
  (클립 도중 즉시 중단 아님). 증분 렌더 자체는 유지 — ADR-010이 수용한 트레이드오프. 코드 주석에 명시.
- **페이싱:** `PLAYBACK_FRAME_STRIDE=4` + `perf_counter` 페이싱으로 실시간 근사. 추론이 느리면 sleep 생략.
- **룰베이스 0/8:** 실제 클립에서 낙상이 거의 안 뜰 수 있음(정확도는 #25/#26). #39는 *배선* 검증 —
  단위 테스트의 scripted 낙상 프레임이 경로를 보장한다.
- ADR 미작성 — ADR-010이 이미 존재.

## Verification

- `cd ml && uv run pytest -q` 전체 green(`test_live_view.py` 포함, `test_annotated_video.py` 제거).
- `grep -rn "build_annotated_video\|annotated_video_path" ml/` → 빈 결과.
- `pnpm lint` clean.
- 수동: `streamlit run ml/demo/app.py` → 재생 → 증분 오버레이 + 라이브 정상/낙상 뱃지 확인.
