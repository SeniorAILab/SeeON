from __future__ import annotations

import streamlit as st

from demo import demo_videos
from demo import video_registry as videos


def handle_upload() -> None:
    uploaded = st.file_uploader("Upload additional video", type=["mp4", "mov", "avi", "mkv"])
    if uploaded is None:
        return
    seen_uploads = st.session_state.setdefault("seen_uploads", {})
    upload_key = f"{uploaded.name}:{uploaded.size}"
    if upload_key in seen_uploads:
        st.success(f"Upload already registered: {seen_uploads[upload_key]}")
        return
    registered = videos.persist_uploaded_video(uploaded)
    seen_uploads[upload_key] = registered.path.name
    st.success(f"Upload registered: {registered.display_name}")


def ensure_demo_videos_registered() -> None:
    added_names: list[str] = []
    failed_names: list[str] = []
    for video in demo_videos.available_demo_videos():
        if demo_videos.demo_video_exists(video):
            continue
        try:
            path = demo_videos.materialize_demo_video(video)
            added_names.append(path.name)
        except demo_videos.DemoVideoDownloadError:
            failed_names.append(video.display_name)
    if added_names:
        st.success(f"Demo videos registered: {', '.join(added_names)}")
    if failed_names:
        st.warning(f"Demo video download skipped: {', '.join(failed_names)}")
