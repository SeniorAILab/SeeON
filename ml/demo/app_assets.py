from __future__ import annotations

import streamlit as st

from demo import video_registry as videos

SESSION_UPLOAD_IDS_KEY = "session_upload_ids"


def handle_upload() -> None:
    uploaded = st.file_uploader("Upload additional video", type=["mp4", "mov", "avi", "mkv"])
    if uploaded is None:
        return
    # Session-scoped upload ids drive public-mode visibility (demo_mode.py):
    # an external tester only ever sees what this set contains.
    session_upload_ids: set[str] = st.session_state.setdefault(SESSION_UPLOAD_IDS_KEY, set())
    seen_uploads = st.session_state.setdefault("seen_uploads", {})
    upload_key = f"{uploaded.name}:{uploaded.size}"
    if upload_key in seen_uploads:
        session_upload_ids.add(seen_uploads[upload_key])
        st.success(f"Upload already registered: {seen_uploads[upload_key]}")
        return
    registered = videos.persist_uploaded_video(uploaded)
    seen_uploads[upload_key] = registered.video_id
    session_upload_ids.add(registered.video_id)
    st.success(f"Upload registered: {registered.display_name}")
