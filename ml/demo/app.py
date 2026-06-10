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
from demo.classifier_module import FallClassifierModule  # noqa: E402
from demo.classifiers import (  # noqa: E402
    CLASSIFIER_REGISTRY,
    ClassifierParams,
    ClassifierSpec,
    build_classifier,
)
from demo.live_view import iter_live_frames  # noqa: E402
from demo.model_modules import POSE_MODEL_SIZES, YoloPoseModule  # noqa: E402
from demo.playback_status import CurrentPlaybackStatus  # noqa: E402
from demo.seam import ModelModule, VideoFileSource  # noqa: E402
from demo.temporal_module import TEMPORAL_MODEL_KEYS  # noqa: E402
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

    _render_live_viewer(
        selected_video=selected_video,
        classifier_key=classifier_key,
        classifier_params=classifier_params,
    )


def _build_model(
    size: str,
    classifier_key: str | None,
    classifier_params: ClassifierParams,
) -> ModelModule:
    """Compose the per-playback model: pose alone, or pose + fall classifier.

    A fresh model (hence a fresh classifier with cleared state) is built on every
    재생 so replays never inherit a prior run's fall timer.
    """
    pose = YoloPoseModule(size=size, confidence=classifier_params.confidence)
    if classifier_key is None:
        return pose
    if classifier_key in TEMPORAL_MODEL_KEYS:
        from demo.temporal_module import build_temporal_model

        return build_temporal_model(classifier_key, pose)
    classifier = build_classifier(classifier_key, classifier_params)
    return FallClassifierModule(pose_module=pose, classifier=classifier)


def _render_status(
    placeholder: st.delta_generator.DeltaGenerator,
    status: CurrentPlaybackStatus,
    confidence: float,
) -> None:
    body = f"**{status.label}** · {status.detail} · 낙상도 {confidence:.0%} · {status.pose_label}"
    if status.is_fall:
        placeholder.error(f"🔴 {body}")
    else:
        placeholder.success(f"🟢 {body}")


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
    model = _build_model(size, classifier_key, classifier_params)
    source = VideoFileSource(selected_video.path, frame_stride=PLAYBACK_FRAME_STRIDE)
    info = read_video_playback_info(selected_video.path)
    frame_interval = PLAYBACK_FRAME_STRIDE / max(info.fps, 1.0)

    target = time.perf_counter()
    rendered = 0
    for overlay, status, confidence in iter_live_frames(
        source, model, show_boxes=show_boxes, show_pose=show_pose
    ):
        frame_ph.image(overlay, channels="RGB", use_container_width=True)
        _render_status(status_ph, status, confidence)
        rendered += 1
        target += frame_interval
        delay = target - time.perf_counter()
        if delay > 0:
            time.sleep(delay)

    st.session_state[PLAYING_KEY] = False
    status_ph.info(f"재생 완료 — {rendered} 프레임 처리됨. 다시 재생하려면 ▶︎ 재생.")


if __name__ == "__main__":
    main()
