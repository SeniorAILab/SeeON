from __future__ import annotations

# Bootstrap: put the ml/ project root on sys.path so `streamlit run demo/app.py`
# (which only adds ml/demo/ to the path) resolves the same package-qualified
# imports — `demo.*` / `util.*` — that pytest uses via pythonpath=["."]. This is
# the single import contract; demo modules no longer carry try/except shims.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from typing import Final  # noqa: E402

import streamlit as st  # noqa: E402

from demo import app_assets  # noqa: E402
from demo import video_registry as videos  # noqa: E402
from demo.annotated_video import annotated_video_path, build_annotated_video  # noqa: E402
from demo.model_modules import POSE_MODEL_SIZES  # noqa: E402

st.set_page_config(page_title="Fall Detector Demo", layout="wide")

PLAYBACK_FRAME_STRIDE: Final = 4


def main() -> None:
    st.title("Fall Detector Demo")
    st.caption("Local ML demo only. This is not a clinical prediction or backend alert flow.")

    app_assets.handle_upload()
    registered_videos = videos.list_registered_videos(
        include_sources=(videos.VideoSource.PROCESSED, videos.VideoSource.UPLOAD),
    )
    if not registered_videos:
        st.warning("No processed videos found under ml/data/processed.")
        return

    selected_video = st.selectbox(
        "Video",
        options=registered_videos,
        format_func=lambda video: video.display_name,
    )
    _render_native_player(selected_video=selected_video)


def _render_native_player(selected_video: videos.RegisteredVideo) -> None:
    st.subheader("Playback")
    st.caption(str(selected_video.path))

    size_col, boxes_col, pose_col = st.columns([2, 1, 1])
    size = size_col.selectbox("YOLO26-pose size", options=POSE_MODEL_SIZES)
    show_boxes = boxes_col.checkbox("Bounding boxes", value=True)
    show_pose = pose_col.checkbox("Pose skeleton", value=True)

    native_video_path = annotated_video_path(
        source_path=selected_video.path,
        size=size,
        show_boxes=show_boxes,
        show_pose=show_pose,
        frame_stride=PLAYBACK_FRAME_STRIDE,
    )
    if not native_video_path.exists():
        if st.button("네이티브 플레이어 생성", use_container_width=True):
            progress_bar = st.progress(0.0)
            result = build_annotated_video(
                source_path=selected_video.path,
                size=size,
                show_boxes=show_boxes,
                show_pose=show_pose,
                frame_stride=PLAYBACK_FRAME_STRIDE,
                progress_callback=progress_bar.progress,
            )
            progress_bar.progress(1.0)
            native_video_path = result.path
            st.success(f"Native player ready: {result.path.name}")

    if native_video_path.exists():
        st.video(str(native_video_path))


if __name__ == "__main__":
    main()
