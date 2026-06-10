from __future__ import annotations

# Bootstrap: put the ml/ project root on sys.path so `streamlit run demo/app.py`
# (which only adds ml/demo/ to the path) resolves the same package-qualified
# imports — `demo.*` / `util.*` — that pytest uses via pythonpath=["."]. This is
# the single import contract; demo modules no longer carry try/except shims.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import time  # noqa: E402
from typing import Final  # noqa: E402

import streamlit as st  # noqa: E402

from demo import app_assets  # noqa: E402
from demo import video_registry as videos  # noqa: E402
from demo.classifiers import ClassifierParams  # noqa: E402
from demo.demo_mode import (  # noqa: E402
    OPERATOR_MODE,
    demo_mode,
    filter_videos_for_public_mode,
)
from demo.demo_ui import (  # noqa: E402
    build_model,
    render_status,
    select_classifier_params,
    select_classifier_spec,
)
from demo.live_view import iter_live_frames  # noqa: E402
from demo.model_modules import POSE_MODEL_SIZES  # noqa: E402
from demo.seam import VideoFileSource  # noqa: E402
from demo.video_playback import read_video_playback_info  # noqa: E402

st.set_page_config(page_title="Fall Detector Demo", layout="wide")

PLAYBACK_FRAME_STRIDE: Final = 4
PLAYING_KEY: Final = "live_playing"


def main() -> None:
    st.title("Fall Detector Demo")
    st.caption(
        "Local ML demo only — real-time per-frame live inference (ADR-010). "
        "This is not a clinical prediction or backend alert flow."
    )

    app_assets.handle_upload()
    registered_videos = _list_videos_for_mode(demo_mode())
    if not registered_videos:
        st.info("재생할 영상이 없습니다 — 위에서 영상을 업로드하세요.")
        return

    selected_video = st.selectbox(
        "Video",
        options=registered_videos,
        format_func=lambda video: video.display_name,
    )

    selected_spec = select_classifier_spec()
    classifier_key: str | None = selected_spec.key if selected_spec.available else None
    classifier_params = select_classifier_params()

    _render_live_viewer(
        selected_video=selected_video,
        classifier_key=classifier_key,
        classifier_params=classifier_params,
    )


def _list_videos_for_mode(mode: str) -> list[videos.RegisteredVideo]:
    """Resolve the video dropdown options for the active FALL_DEMO_MODE.

    operator — domain selector over ml/data/{domain}/{processed,raw} plus
    uploads. public (fail-safe default) — only clips uploaded in the current
    browser session; internal domain sources are never listed (ADR-012 Access
    Boundary; session filter lives here in the app layer, not the registry).
    """
    if mode == OPERATOR_MODE:
        domain_options = [*videos.list_domains(), videos.UPLOADS_DOMAIN]
        selected_domain = st.selectbox("도메인", options=domain_options)
        if selected_domain == videos.UPLOADS_DOMAIN:
            return videos.list_registered_videos(include_sources=(videos.VideoSource.UPLOAD,))
        return videos.list_registered_videos(
            include_sources=(videos.VideoSource.PROCESSED, videos.VideoSource.RAW),
            domains=(selected_domain,),
        )
    st.caption("Public mode — 이 세션에서 업로드한 영상만 표시됩니다.")
    session_upload_ids: set[str] = st.session_state.setdefault(
        app_assets.SESSION_UPLOAD_IDS_KEY, set()
    )
    uploads = videos.list_registered_videos(include_sources=(videos.VideoSource.UPLOAD,))
    return filter_videos_for_public_mode(uploads, session_upload_ids)


def _render_live_viewer(
    selected_video: videos.RegisteredVideo,
    classifier_key: str | None,
    classifier_params: ClassifierParams,
) -> None:
    st.subheader("Live Playback")
    st.caption(str(selected_video.path))

    size_col, boxes_col, pose_col = st.columns([2, 1, 1])
    size = size_col.selectbox("YOLO26-pose size", options=POSE_MODEL_SIZES)
    show_boxes = boxes_col.checkbox("Bounding boxes", value=True)
    show_pose = pose_col.checkbox("Pose skeleton", value=True)

    play_col, stop_col = st.columns(2)
    if play_col.button("재생", use_container_width=True, type="primary"):
        st.session_state[PLAYING_KEY] = True
    if stop_col.button("정지", use_container_width=True):
        st.session_state[PLAYING_KEY] = False

    status_ph = st.empty()
    frame_ph = st.empty()

    if not st.session_state.get(PLAYING_KEY):
        status_ph.info("▶︎ 재생을 눌러 실시간 추론을 시작하세요.")
        return

    # Streamlit is single-threaded: the render loop below blocks the script run,
    # so 정지 takes effect at the start of the next rerun rather than mid-clip.
    # The loop still paints each frame into the placeholders the instant it is
    # processed — that incremental render IS the live view (ADR-010). Throughput
    # is throttled by PLAYBACK_FRAME_STRIDE and paced toward the clip's real-time
    # fps below.
    model = build_model(size, classifier_key, classifier_params)
    source = VideoFileSource(selected_video.path, frame_stride=PLAYBACK_FRAME_STRIDE)
    info = read_video_playback_info(selected_video.path)
    frame_interval = PLAYBACK_FRAME_STRIDE / max(info.fps, 1.0)

    target = time.perf_counter()
    rendered = 0
    for overlay, status, confidence in iter_live_frames(
        source, model, show_boxes=show_boxes, show_pose=show_pose
    ):
        frame_ph.image(overlay, channels="RGB", use_container_width=True)
        render_status(status_ph, status, confidence)
        rendered += 1
        target += frame_interval
        delay = target - time.perf_counter()
        if delay > 0:
            time.sleep(delay)

    st.session_state[PLAYING_KEY] = False
    status_ph.info(f"재생 완료 — {rendered} 프레임 처리됨. 다시 재생하려면 ▶︎ 재생.")


if __name__ == "__main__":
    main()
