from __future__ import annotations

# Bootstrap: same contract as demo/app.py — put ml/ root on sys.path so
# `demo.*` / `util.*` imports resolve whether Streamlit adds pages/ or demo/.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import time  # noqa: E402

import streamlit as st  # noqa: E402

from demo.demo_ui import (  # noqa: E402
    build_model,
    render_live_controls,
    select_classifier_params,
    select_classifier_spec,
)
from demo.live_view import iter_live_frames  # noqa: E402
from demo.playback_status import CurrentPlaybackStatus  # noqa: E402
from util.camera_probe import probe_cameras  # noqa: E402
from util.frame_source import CameraSource  # noqa: E402

CAMERA_PLAYING_KEY = "camera_playing"


def _render_camera_status(
    placeholder: st.delta_generator.DeltaGenerator,
    status: CurrentPlaybackStatus,
    confidence: float,
    fps: float,
) -> None:
    body = (
        f"**{status.label}** · {status.detail} · 낙상도 {confidence:.0%} · "
        f"{status.pose_label} · {fps:.1f} fps"
    )
    if status.is_fall:
        placeholder.error(f"🔴 {body}")
    else:
        placeholder.success(f"🟢 {body}")


def main() -> None:
    st.set_page_config(page_title="라이브 카메라", layout="wide")
    st.title("라이브 카메라 낙상 탐지")
    st.caption(
        "실시간 카메라 추론 — 정확도 논외 (ADR-010). "
        "이것은 임상적 판정이나 백엔드 알림 플로우가 아닙니다."
    )

    # Probe cameras once per session; "다시 검색" clears and re-probes.
    if st.button("다시 검색"):
        st.session_state.pop("cameras", None)
    if "cameras" not in st.session_state:
        with st.spinner("카메라 검색 중..."):
            st.session_state["cameras"] = probe_cameras()

    cameras = st.session_state["cameras"]
    if not cameras:
        st.warning(
            "연결된 카메라를 찾을 수 없습니다. "
            "카메라를 연결한 뒤 '다시 검색'을 눌러주세요."
        )
        return

    # Show thumbnails in a row, one column per found camera.
    thumb_cols = st.columns(len(cameras))
    for col, cam in zip(thumb_cols, cameras, strict=True):
        col.image(cam.thumbnail, caption=f"카메라 {cam.index}", use_container_width=True)

    selected_index: int = st.selectbox(
        "카메라 선택",
        options=[cam.index for cam in cameras],
        format_func=lambda idx: f"카메라 {idx}",
    )

    selected_spec = select_classifier_spec()
    classifier_key: str | None = selected_spec.key if selected_spec.available else None
    classifier_params = select_classifier_params()

    size, pose_backend, show_boxes, show_pose = render_live_controls(
        CAMERA_PLAYING_KEY, start_label="시작", stop_label="중지"
    )

    status_ph = st.empty()
    frame_ph = st.empty()

    if not st.session_state.get(CAMERA_PLAYING_KEY):
        status_ph.info("▶︎ 시작을 눌러 실시간 추론을 시작하세요.")
        return

    # No pacing sleep — the camera itself is the real-time gate (ADR-010).
    model = build_model(
        size, classifier_key, classifier_params, pose_backend=pose_backend
    )
    source = CameraSource(selected_index)

    t_start = time.perf_counter()
    rendered = 0
    for overlay, status, confidence in iter_live_frames(
        source, model, show_boxes=show_boxes, show_pose=show_pose
    ):
        frame_ph.image(overlay, channels="RGB", use_container_width=True)
        elapsed = time.perf_counter() - t_start
        fps = rendered / elapsed if elapsed > 0 else 0.0
        _render_camera_status(status_ph, status, confidence, fps)
        rendered += 1

    st.session_state[CAMERA_PLAYING_KEY] = False
    status_ph.info(f"카메라 스트림 종료 — {rendered} 프레임 처리됨.")


main()
