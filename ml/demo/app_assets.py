from __future__ import annotations

import streamlit as st

from demo import video_registry as videos
from demo.ui_labels import UPLOAD_VIDEO_LABEL


def handle_upload() -> None:
    uploaded = st.file_uploader(UPLOAD_VIDEO_LABEL, type=["mp4", "mov", "avi", "mkv"])
    if uploaded is None:
        return
    # Dedupe re-uploads within a session so the same file isn't persisted twice.
    seen_uploads = st.session_state.setdefault("seen_uploads", {})
    upload_key = f"{uploaded.name}:{uploaded.size}"
    if upload_key in seen_uploads:
        st.success(f"이미 등록된 영상입니다: {seen_uploads[upload_key]}")
        return
    registered = videos.persist_uploaded_video(uploaded)
    seen_uploads[upload_key] = registered.video_id
    st.success(f"영상 등록 완료: {registered.display_name}")
