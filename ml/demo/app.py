"""Streamlit ML-demo UI (PoC).

This is an ML demo surface, NOT the product frontend. The product frontend is
`front/` (Next.js); product-level alerts/webhooks live in `backend/` (NestJS).

Run via root: `pnpm dev:demo`  (uv run --directory ml --group demo streamlit run demo/app.py)
"""

from __future__ import annotations

import streamlit as st

from serving.model import get_model

st.set_page_config(page_title="Fall Detector — Demo", page_icon="🎥")

model = get_model()

st.title("🎥 Fall Detector — ML Demo")
st.caption(f"model: {model.name}  |  version: {model.version}  (PoC placeholder)")

st.markdown(
    "Upload a video to exercise the end-to-end PoC path: "
    "`video → windowing → inference → response`."
)

uploaded = st.file_uploader("Video sample", type=["mp4", "mov", "avi", "mkv"])

if uploaded is not None:
    st.video(uploaded)
    # PoC placeholder: real windowing/inference is wired later.
    dummy_window = [[0.0] * 34 for _ in range(50)]
    prob = model.predict(dummy_window)
    st.metric("Fall probability (placeholder)", f"{prob:.2%}")
    st.info(
        "Placeholder inference. The backend decides whether this prediction "
        "becomes a real alert (policy, dedup, Kakao webhook)."
    )
else:
    st.info("Awaiting a video sample.")
