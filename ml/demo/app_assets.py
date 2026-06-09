from __future__ import annotations

import streamlit as st

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
