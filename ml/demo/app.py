from __future__ import annotations

import time
from typing import Final

import app_assets
import pretrained as weights
import streamlit as st
import video_registry as videos
from annotated_video import annotated_video_path, build_annotated_video
from model_registry import ModelSpec, available_pretrained_specs
from playback_status import CurrentPlaybackStatus, current_playback_status
from video_playback import (
    clamp_seek_time,
    iter_playback_frames,
    jump_seek_time,
    read_frame_at_time,
    read_video_playback_info,
)
from yolo_overlay import render_yolo_overlay
from yolo_runtime import YoloFallRunner, YoloPoseRunner

st.set_page_config(page_title="Fall Detector Demo", layout="wide")

DEFAULT_FALL_THRESHOLD: Final = 0.15
VISIBLE_POSE_CONFIDENCE: Final = 0.2
PLAYBACK_FRAME_STRIDE: Final = 4
PLAYBACK_DELAY_SEC: Final = 0.01
SEEK_STEP_SEC: Final = 10.0


def main() -> None:
    st.title("Fall Detector Demo")
    st.caption("Local ML demo only. This is not a clinical prediction or backend alert flow.")

    app_assets.handle_upload()
    app_assets.ensure_demo_videos_registered()
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
    model_specs = available_pretrained_specs()
    model_specs_by_id = {spec.model_id: spec for spec in model_specs}
    selected_spec_id = st.selectbox(
        "Model",
        options=list(model_specs_by_id),
        format_func=lambda model_id: model_specs_by_id[model_id].display_name,
    )
    selected_spec = model_specs_by_id[selected_spec_id]

    _render_video_review(
        selected_video=selected_video,
        spec=selected_spec,
    )


def _render_video_review(
    selected_video: videos.RegisteredVideo,
    spec: ModelSpec,
) -> None:
    st.subheader("Playback")
    st.caption(str(selected_video.path))
    playback_info = read_video_playback_info(selected_video.path)
    native_video_path = annotated_video_path(
        source_path=selected_video.path,
        spec=spec,
        threshold=DEFAULT_FALL_THRESHOLD,
        frame_stride=PLAYBACK_FRAME_STRIDE,
    )
    if not native_video_path.exists():
        native_clicked = st.button("네이티브 플레이어 생성", use_container_width=True)
        if native_clicked:
            progress_bar = st.progress(0.0)
            result = build_annotated_video(
                source_path=selected_video.path,
                spec=spec,
                threshold=DEFAULT_FALL_THRESHOLD,
                frame_stride=PLAYBACK_FRAME_STRIDE,
                progress_callback=progress_bar.progress,
            )
            progress_bar.progress(1.0)
            native_video_path = result.path
            st.success(f"Native player ready: {result.path.name}")

    if native_video_path.exists():
        st.video(str(native_video_path))
        return

    control_prev, control_play, control_next = st.columns(3)
    with control_prev:
        _render_jump_button(
            label="10s 뒤로",
            selected_video=selected_video,
            delta_sec=-SEEK_STEP_SEC,
            duration_sec=playback_info.duration_sec,
        )
    with control_play:
        run_clicked = st.button("재생", type="primary", use_container_width=True)
    with control_next:
        _render_jump_button(
            label="10s 앞으로",
            selected_video=selected_video,
            delta_sec=SEEK_STEP_SEC,
            duration_sec=playback_info.duration_sec,
        )
    seek_sec = _render_seek_controls(
        selected_video=selected_video,
        duration_sec=playback_info.duration_sec,
    )
    frame_column, status_column = st.columns([4, 1])
    with frame_column:
        frame_slot = st.empty()
    with status_column:
        status_slot = st.empty()

    if not run_clicked:
        preview_frame = read_frame_at_time(path=selected_video.path, time_sec=seek_sec)
        if preview_frame is not None:
            frame_slot.image(preview_frame, channels="RGB", width="stretch")
        _render_current_status(
            status_slot=status_slot,
            status=current_playback_status(analyses=(), pose_count=0, time_sec=seek_sec),
        )
        return

    runner = _load_fall_runner(spec=spec)
    pose_runner = _load_pose_runner()
    alerted = False
    decoded_frame = False
    for frame_index, time_sec, frame in iter_playback_frames(
        path=selected_video.path,
        start_sec=seek_sec,
        frame_stride=PLAYBACK_FRAME_STRIDE,
    ):
        decoded_frame = True
        analyses = (runner.predict_frame(frame=frame, frame_index=frame_index, time_sec=time_sec),)
        poses = () if pose_runner is None else pose_runner.predict_poses(frame)
        pose_count = _visible_pose_count(poses)
        current_status = current_playback_status(
            analyses=analyses,
            pose_count=pose_count,
            time_sec=time_sec,
        )
        overlay = render_yolo_overlay(frame=frame, analyses=analyses, poses=poses)
        frame_slot.image(overlay, channels="RGB", width="stretch")
        _render_current_status(status_slot=status_slot, status=current_status)
        if current_status.is_fall:
            if not alerted:
                st.toast(current_status.detail)
                alerted = True
        time.sleep(PLAYBACK_DELAY_SEC)

    if not decoded_frame:
        status_slot.warning("No decodable frames were found for this video.")


def _render_seek_controls(
    selected_video: videos.RegisteredVideo,
    duration_sec: float,
) -> float:
    seek_key = _seek_state_key(selected_video)
    current_seek = clamp_seek_time(
        value_sec=float(st.session_state.get(seek_key, 0.0)),
        duration_sec=duration_sec,
    )
    st.session_state[seek_key] = current_seek
    max_slider_sec = max(duration_sec, 0.1)
    return st.slider(
        "타임라인",
        min_value=0.0,
        max_value=max_slider_sec,
        step=0.5,
        format="%.1f s",
        key=seek_key,
    )


def _render_jump_button(
    label: str,
    selected_video: videos.RegisteredVideo,
    delta_sec: float,
    duration_sec: float,
) -> None:
    seek_key = _seek_state_key(selected_video)
    st.button(
        label,
        use_container_width=True,
        on_click=_jump_seek_state,
        args=(seek_key, delta_sec, duration_sec),
    )


def _jump_seek_state(seek_key: str, delta_sec: float, duration_sec: float) -> None:
    st.session_state[seek_key] = jump_seek_time(
        current_sec=float(st.session_state.get(seek_key, 0.0)),
        delta_sec=delta_sec,
        duration_sec=duration_sec,
    )


def _seek_state_key(selected_video: videos.RegisteredVideo) -> str:
    return f"seek_sec:{selected_video.video_id}"


def _load_fall_runner(spec: ModelSpec) -> YoloFallRunner:
    weights.materialize_pretrained_artifact(spec)
    return YoloFallRunner(spec=spec, threshold=DEFAULT_FALL_THRESHOLD)


def _load_pose_runner() -> YoloPoseRunner | None:
    try:
        return YoloPoseRunner()
    except (ImportError, OSError, RuntimeError) as error:
        st.warning(f"Pose model unavailable: {error}")
        return None


def _visible_pose_count(poses: tuple[tuple[tuple[int, int, float], ...], ...]) -> int:
    return sum(
        1
        for pose in poses
        if any(confidence >= VISIBLE_POSE_CONFIDENCE for _x, _y, confidence in pose)
    )


def _render_current_status(status_slot, status: CurrentPlaybackStatus) -> None:
    with status_slot.container():
        st.metric("현재 상태", status.label)
        st.caption(status.pose_label)
        if status.is_fall:
            st.error(status.detail)
        else:
            st.success(status.detail)


if __name__ == "__main__":
    main()
