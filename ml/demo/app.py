"""Streamlit ML demo — real-time per-frame fall-detection inference viewer.

This is an ML demo surface, NOT the product frontend.  The product frontend is
``front/`` (Next.js); product-level alerts and webhooks live in ``backend/``
(NestJS).  See ADR-003 for the lifecycle boundary and ADR-010 for the live
per-frame inference mode decision.
"""
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
    render_live_controls,
    render_status,
    select_classifier_params,
    select_classifier_spec,
    select_decision_threshold,
)
from demo.live_view import FallEventLatch, iter_live_frames, render_due  # noqa: E402
from demo.model_bootstrap import ensure_fall_models  # noqa: E402
from demo.seam import VideoFileSource  # noqa: E402
from demo.video_playback import read_video_playback_info  # noqa: E402

st.set_page_config(page_title="Fall Detector Demo", layout="wide")

# Cloud deploys build from the weight-less GitHub repo; reacquire fall weights
# before any classifier load. No-op when ml/models/fall/ is already populated.
ensure_fall_models()

# Rendering decimation only — inference always consumes every consecutive
# frame (train/serve parity, ADR-013; see demo-live-inference-frame-parity).
RENDER_FRAME_STRIDE: Final = 4
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
    decision_threshold = select_decision_threshold(selected_spec)
    classifier_params = select_classifier_params()

    _render_live_viewer(
        selected_video=selected_video,
        classifier_key=classifier_key,
        classifier_params=classifier_params,
        decision_threshold=decision_threshold,
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
        col_domain, col_role = st.columns(2)
        selected_domain = col_domain.segmented_control(
            "도메인",
            options=domain_options,
            default=domain_options[0] if domain_options else None,
        )
        if selected_domain is None:
            return []
        if selected_domain == videos.UPLOADS_DOMAIN:
            return videos.list_registered_videos(include_sources=(videos.VideoSource.UPLOAD,))
        role_options = videos.list_roles_for_domain(selected_domain)
        if not role_options:
            return []
        selected_role = col_role.segmented_control(
            "종류",
            options=role_options,
            format_func=lambda r: r.value,
            default=role_options[0],
        )
        if selected_role is None:
            return []
        return videos.list_registered_videos(
            include_sources=(selected_role,),
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
    decision_threshold: float | None = None,
) -> None:
    st.subheader("Live Playback")
    st.caption(str(selected_video.path))

    size, show_boxes, show_pose = render_live_controls(
        PLAYING_KEY, start_label="재생", stop_label="정지"
    )

    event_ph = st.empty()
    status_ph = st.empty()
    frame_ph = st.empty()

    if not st.session_state.get(PLAYING_KEY):
        status_ph.info("▶︎ 재생을 눌러 실시간 추론을 시작하세요.")
        return

    # Streamlit is single-threaded: the render loop below blocks the script run,
    # so 정지 takes effect at the start of the next rerun rather than mid-clip.
    # Inference consumes EVERY consecutive frame (stride-1 source) so live
    # windows match the training/eval pipelines (ADR-013 anti-skew); only the
    # placeholder repaint is decimated via render_due — that incremental
    # render IS the live view (ADR-010). Pacing targets the clip's native fps
    # and degrades to slower-than-real-time when pose can't keep up — frames
    # are never skipped to catch up.
    model = build_model(size, classifier_key, classifier_params, decision_threshold)
    source = VideoFileSource(selected_video.path)
    info = read_video_playback_info(selected_video.path)
    frame_interval = 1.0 / max(info.fps, 1.0)

    target = time.perf_counter()
    processed = 0
    last_painted_fall = False
    latch = FallEventLatch()
    for overlay, status, confidence in iter_live_frames(
        source, model, show_boxes=show_boxes, show_pose=show_pose
    ):
        processed += 1
        # Latched event badge: repainted only on a rising edge (정상→낙상);
        # the raw per-frame status below stays untouched (ADR-005 §5 — the
        # badge aggregates real inference, it never invents state).
        if latch.update(status.is_fall, processed * frame_interval):
            event_ph.error(
                f"🚨 낙상 감지 {latch.event_count}회 — "
                f"최초 {latch.first_event_sec:.1f}초 시점 (영상 종료까지 유지)"
            )
        if render_due(
            processed,
            RENDER_FRAME_STRIDE,
            is_fall=status.is_fall,
            last_painted_fall=last_painted_fall,
        ):
            frame_ph.image(overlay, channels="RGB", use_container_width=True)
            render_status(status_ph, status, confidence)
            last_painted_fall = status.is_fall
        target += frame_interval
        delay = target - time.perf_counter()
        if delay > 0:
            time.sleep(delay)

    st.session_state[PLAYING_KEY] = False
    status_ph.info(f"재생 완료 — {processed} 프레임 처리됨. 다시 재생하려면 ▶︎ 재생.")


if __name__ == "__main__":
    main()
