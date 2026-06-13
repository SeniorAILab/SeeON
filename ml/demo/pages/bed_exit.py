from __future__ import annotations

# Bootstrap: same contract as demo/app.py and pages/live_camera.py — put the
# ml/ root on sys.path so `demo.*` / `util.*` imports resolve whether Streamlit
# adds pages/ or demo/ to the path.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import itertools  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402
from typing import Final  # noqa: E402

import streamlit as st  # noqa: E402

from demo.bed_detector import BedDetector  # noqa: E402
from demo.bed_exit import (  # noqa: E402
    BED_EXIT_LABEL_TEXT,
    BedExitModule,
    BedExitParams,
)
from demo.bed_exit_latch import BedExitLatch  # noqa: E402
from demo.demo_mode import OPERATOR_MODE, demo_mode  # noqa: E402
from demo.live_view import render_due  # noqa: E402
from demo.model_modules import (  # noqa: E402
    POSE_MODEL_SIZE_LABELS,
    POSE_MODEL_SIZES,
    YoloPoseModule,
)
from demo.seam import VideoFileSource  # noqa: E402
from demo.video_playback import read_video_playback_info  # noqa: E402
from demo.yolo_overlay import render_yolo_overlay  # noqa: E402
from util.camera_probe import probe_cameras  # noqa: E402
from util.frame_source import CameraSource, FrameSource  # noqa: E402

PLAYING_KEY: Final = "bed_exit_playing"
UPLOAD_PATH_KEY: Final = "bed_exit_upload_path"
# Inference runs on every frame; only the repaint is decimated (ADR-010/013).
RENDER_FRAME_STRIDE: Final = 4


def _should_emit_event_badge(
    *, night_mode: bool, is_new_event: bool, bed_present: bool
) -> bool:
    """Whether to surface the latched 🚨 bed-exit alert this frame.

    AC-8: night-mode OFF is monitor-only — the per-frame status line still
    reflects the live state, but no latched exit *event* is fired. A real bed
    ROI must exist (no bed → nothing to exit).
    """
    return night_mode and bed_present and is_new_event


def _select_bed_exit_params() -> BedExitParams:
    """Page-scoped 침대 이탈 파라미터 expander (collapsed by default).

    Mirrors the containment thresholds + dwell times of BedExitParams so an
    operator can tune sensitivity without code changes. Defaults are the
    research/ADR values.
    """
    defaults = BedExitParams()
    with st.expander("침대 이탈 파라미터", expanded=False):
        col1, col2 = st.columns(2)
        bed_in_threshold = col1.slider(
            "침대 안 판정 (containment ≥)",
            min_value=0.1,
            max_value=1.0,
            value=defaults.bed_in_threshold,
            step=0.05,
            help="사람 박스가 침대와 이만큼 겹치면 '침대 안'으로 간주합니다.",
        )
        bed_exit_threshold = col2.slider(
            "침대 이탈 판정 (containment <)",
            min_value=0.0,
            max_value=0.5,
            value=defaults.bed_exit_threshold,
            step=0.05,
            help="겹침이 이 값 아래로 떨어지면 '침대 밖'으로 간주합니다.",
        )
        bed_in_dwell_sec = col1.number_input(
            "침대 안 유지시간 (초)",
            min_value=0.0,
            max_value=10.0,
            value=defaults.bed_in_dwell_sec,
            step=0.1,
            help="이 시간 이상 침대 안에 있어야 '침대에 있음'으로 확정합니다.",
        )
        bed_exit_dwell_sec = col2.number_input(
            "이탈 지속시간 (초)",
            min_value=0.1,
            max_value=10.0,
            value=defaults.bed_exit_dwell_sec,
            step=0.1,
            help="이 시간 이상 침대 밖이어야 '이탈'로 알립니다 (순간 흔들림 무시).",
        )
    return BedExitParams(
        bed_in_threshold=float(bed_in_threshold),
        bed_exit_threshold=float(bed_exit_threshold),
        bed_in_dwell_sec=float(bed_in_dwell_sec),
        bed_exit_dwell_sec=float(bed_exit_dwell_sec),
    )


def _select_source() -> tuple[FrameSource | None, float]:
    """Render source selection (upload | live camera); return (source, frame_interval).

    ``frame_interval`` is the per-frame pacing target in seconds for an uploaded
    clip (paced to native fps), or 0.0 for the live camera (the camera itself is
    the real-time gate — no pacing sleep, mirroring pages/live_camera.py).
    Returns ``(None, 0.0)`` when nothing is ready to play yet.
    """
    mode = st.radio(
        "입력 소스",
        options=("영상 업로드", "라이브 카메라"),
        horizontal=True,
    )

    if mode == "영상 업로드":
        uploaded = st.file_uploader(
            "침대가 보이는 영상 업로드", type=["mp4", "mov", "avi", "mkv"]
        )
        if uploaded is None:
            return None, 0.0
        # Persist to a session-scoped temp file so reruns reuse one path rather
        # than rewriting bytes every interaction.
        cache = st.session_state.get(UPLOAD_PATH_KEY)
        key = f"{uploaded.name}:{uploaded.size}"
        if cache is None or cache[0] != key:
            suffix = Path(uploaded.name).suffix or ".mp4"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            tmp.write(uploaded.getbuffer())
            tmp.close()
            cache = (key, tmp.name)
            st.session_state[UPLOAD_PATH_KEY] = cache
        path = Path(cache[1])
        info = read_video_playback_info(path)
        return VideoFileSource(path), 1.0 / max(info.fps, 1.0)

    # 라이브 카메라
    if st.button("카메라 다시 검색"):
        st.session_state.pop("bed_exit_cameras", None)
    if "bed_exit_cameras" not in st.session_state:
        with st.spinner("카메라 검색 중..."):
            st.session_state["bed_exit_cameras"] = probe_cameras()
    cameras = st.session_state["bed_exit_cameras"]
    if not cameras:
        st.warning("연결된 카메라를 찾을 수 없습니다. '카메라 다시 검색'을 눌러주세요.")
        return None, 0.0
    selected_index = st.selectbox(
        "카메라 선택",
        options=[cam.index for cam in cameras],
        format_func=lambda idx: f"카메라 {idx}",
    )
    return CameraSource(selected_index), 0.0


def _render_status(
    placeholder: st.delta_generator.DeltaGenerator,
    *,
    bed_present: bool,
    exiting: bool,
    night_mode: bool,
    fps: float,
) -> None:
    if not bed_present:
        placeholder.info(f"🛏️ 침대 미감지 — 정상 상태 · {fps:.1f} fps")
        return
    if exiting:
        # Night mode escalates a bed-exit to a prominent alert; daytime treats it
        # as informational (leaving bed is routine activity during the day).
        if night_mode:
            placeholder.error(f"🚨 침대 이탈 — 야간 알림 · {fps:.1f} fps")
        else:
            placeholder.warning(f"🔵 침대 이탈 (주간) · {fps:.1f} fps")
    else:
        placeholder.success(f"🟢 침대 안 · {fps:.1f} fps")


def main() -> None:
    st.set_page_config(page_title="침대 이탈 탐지", layout="wide")
    st.title("침대 이탈 탐지")
    st.caption(
        "침대 ROI를 시작 시 1회 검출해 고정하고, 사람이 침대를 벗어나면 알립니다. "
        "임상 판정이나 백엔드 알림 플로우가 아닙니다 (ADR-003/010)."
    )

    # Night-mode is an operator control: surfaced only in operator mode, where
    # the page escalates a bed-exit to a 🚨 alert. In public mode it defaults
    # off (informational) and the toggle is hidden.
    is_operator = demo_mode() == OPERATOR_MODE
    night_mode = (
        st.toggle("야간 모드 (이탈 시 알림 강조)", value=True) if is_operator else False
    )

    source, frame_interval = _select_source()
    params = _select_bed_exit_params()

    size_col, boxes_col, pose_col = st.columns([2, 1, 1])
    size = size_col.selectbox(
        "YOLO26-pose size",
        options=POSE_MODEL_SIZES,
        format_func=lambda s: POSE_MODEL_SIZE_LABELS[s],
    )
    show_boxes = boxes_col.checkbox("Bounding boxes", value=True)
    show_pose = pose_col.checkbox("Pose skeleton", value=True)

    play_col, stop_col = st.columns(2)
    if play_col.button("시작", use_container_width=True, type="primary"):
        st.session_state[PLAYING_KEY] = True
    if stop_col.button("중지", use_container_width=True):
        st.session_state[PLAYING_KEY] = False

    event_ph = st.empty()
    status_ph = st.empty()
    frame_ph = st.empty()

    if not st.session_state.get(PLAYING_KEY):
        status_ph.info("▶︎ 시작을 눌러 침대 이탈 탐지를 시작하세요.")
        return
    if source is None:
        status_ph.warning("먼저 영상을 업로드하거나 카메라를 선택하세요.")
        st.session_state[PLAYING_KEY] = False
        return

    _run_detection(
        source=source,
        frame_interval=frame_interval,
        size=size,
        params=params,
        show_boxes=show_boxes,
        show_pose=show_pose,
        night_mode=night_mode,
        event_ph=event_ph,
        status_ph=status_ph,
        frame_ph=frame_ph,
    )


def _run_detection(
    *,
    source: FrameSource,
    frame_interval: float,
    size: str,
    params: BedExitParams,
    show_boxes: bool,
    show_pose: bool,
    night_mode: bool,
    event_ph: st.delta_generator.DeltaGenerator,
    status_ph: st.delta_generator.DeltaGenerator,
    frame_ph: st.delta_generator.DeltaGenerator,
) -> None:
    """One-shot bed detect on the first frame, then run the per-frame exit loop.

    The first frame is consumed once to localise the static bed ROI (a single
    COCO detection), then chained back so no frame is dropped — the per-frame
    path stays a single pose pass (ADR-005 §3). A fresh model + latch are built
    each run so replays never inherit a prior run's exit state.
    """
    pose = YoloPoseModule(size=size)
    frames = iter(source)
    try:
        first_frame = next(frames)
    except StopIteration:
        status_ph.warning("프레임이 없습니다 — 다른 소스를 선택하세요.")
        st.session_state[PLAYING_KEY] = False
        return

    bed_box = BedDetector().detect(first_frame)
    module = BedExitModule(pose_module=pose, bed_box=bed_box, params=params)
    if bed_box is None:
        event_ph.info("🛏️ 침대가 감지되지 않았습니다 — 모든 사람을 정상으로 처리합니다.")

    latch = BedExitLatch()
    target = time.perf_counter()
    processed = 0
    last_painted_exit = False
    for frame in itertools.chain([first_frame], frames):
        result = module.predict(frame)
        processed += 1
        is_exit = any(label.text == BED_EXIT_LABEL_TEXT for label in result.labels)

        # The latch advances every frame so its count / first-time stay honest
        # aggregations of real inference (rising edge only, never fabricated —
        # ADR-005 §5). The 🚨 badge it drives is an *event*, gated by night-mode:
        # daytime is monitor-only (AC-8), so the alert is suppressed while the
        # per-frame status line below still reflects the live state.
        is_new_event = latch.update(is_exit, frame.time_sec)
        if _should_emit_event_badge(
            night_mode=night_mode,
            is_new_event=is_new_event,
            bed_present=bed_box is not None,
        ):
            event_ph.error(
                f"🚨 침대 이탈 {latch.event_count}회 — "
                f"최초 {latch.first_event_sec:.1f}초 시점 (재생 종료까지 유지)"
            )

        if render_due(
            processed,
            RENDER_FRAME_STRIDE,
            is_fall=is_exit,
            last_painted_fall=last_painted_exit,
        ):
            overlay = render_yolo_overlay(
                frame=frame.image,
                result=result,
                show_boxes=show_boxes,
                show_pose=show_pose,
                show_bed_box=True,
            )
            frame_ph.image(overlay, channels="RGB", use_container_width=True)
            elapsed = time.perf_counter() - target
            fps = processed / elapsed if elapsed > 0 else 0.0
            _render_status(
                status_ph,
                bed_present=bed_box is not None,
                exiting=is_exit,
                night_mode=night_mode,
                fps=fps,
            )
            last_painted_exit = is_exit

        if frame_interval > 0:
            target_next = target + processed * frame_interval
            delay = target_next - time.perf_counter()
            if delay > 0:
                time.sleep(delay)

    st.session_state[PLAYING_KEY] = False
    status_ph.info(f"재생 완료 — {processed} 프레임 처리됨. 다시 시작하려면 ▶︎ 시작.")


if __name__ == "__main__":
    main()
