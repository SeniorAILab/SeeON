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
from demo.classifiers import CLASSIFIER_REGISTRY, ClassifierParams, ClassifierSpec  # noqa: E402
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

    selected_spec: ClassifierSpec = st.selectbox(
        "분류 모델",
        options=CLASSIFIER_REGISTRY,
        format_func=lambda spec: spec.display_name,
    )
    if not selected_spec.available:
        st.info("규칙기반 분류만 현재 지원됩니다. 선택한 모델은 준비중입니다.")
    classifier_key: str | None = selected_spec.key if selected_spec.available else None

    with st.expander("탐지 파라미터", expanded=False):
        col1, col2 = st.columns(2)
        conf = col1.number_input(
            "신뢰도 임계값 (conf)", min_value=0.01, max_value=1.0, value=0.05, step=0.01
        )
        window = col1.number_input("윈도우 (frames)", min_value=1, value=60, step=1)
        stride_param = col2.number_input("스트라이드 (frames)", min_value=1, value=15, step=1)
        sustained = col2.number_input(
            "낙상 판단 지속시간 (초)", min_value=0.1, max_value=30.0, value=2.0, step=0.1
        )
    classifier_params = ClassifierParams(
        confidence=float(conf),
        window=int(window),
        stride=int(stride_param),
        sustained_down_sec=float(sustained),
    )

    _render_native_player(
        selected_video=selected_video,
        classifier_key=classifier_key,
        classifier_params=classifier_params,
    )


def _render_native_player(
    selected_video: videos.RegisteredVideo,
    classifier_key: str | None = None,
    classifier_params: ClassifierParams | None = None,
) -> None:
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
        classifier_key=classifier_key,
        classifier_params=classifier_params,
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
                classifier_key=classifier_key,
                classifier_params=classifier_params,
            )
            progress_bar.progress(1.0)
            native_video_path = result.path
            st.success(f"Native player ready: {result.path.name}")

    if native_video_path.exists():
        st.video(str(native_video_path))


if __name__ == "__main__":
    main()
