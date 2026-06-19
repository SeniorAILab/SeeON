"""Streamlit ML demo — real-time per-frame fall-detection inference viewer.

This is an ML demo surface, NOT the product frontend.  The product frontend is
``front/`` (Next.js); product-level alerts and webhooks live in ``backend/``
(NestJS).  See ADR-024 for the demo/product surface boundary and ADR-010 for the live
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
from datetime import UTC, datetime  # noqa: E402
from typing import Final  # noqa: E402

import streamlit as st  # noqa: E402

from core.alert_client import AlertClient  # noqa: E402
from core.bed_detector import BedDetector  # noqa: E402
from core.classifiers import ClassifierParams  # noqa: E402
from core.contract import CameraSource, FrameSource, VideoFileSource  # noqa: E402
from core.playback_status import CurrentPlaybackStatus  # noqa: E402
from demo import app_assets  # noqa: E402
from demo import video_registry as videos  # noqa: E402
from demo.demo_ui import (  # noqa: E402
    LiveSourceOption,
    build_model,
    render_live_controls,
    render_live_source_selection,
    render_status,
    select_classifier_params,
    select_classifier_spec,
    select_decision_threshold,
)
from demo.live_view import (  # noqa: E402
    DetectionLossMonitor,
    FallEventLatch,
    iter_live_frames,
    render_due,
)
from demo.model_bootstrap import ensure_fall_models  # noqa: E402
from demo.ui_labels import (  # noqa: E402
    DOMAIN_SELECT_LABEL,
    ROLE_SELECT_LABEL,
    VIDEO_SELECT_LABEL,
)
from demo.video_playback import read_video_playback_info  # noqa: E402

APP_PAGE_TITLE: Final = "eldercare-fall-ai"

st.set_page_config(page_title=APP_PAGE_TITLE, layout="wide")

# Cloud deploys build from the weight-less GitHub repo; reacquire fall weights
# before any classifier load. No-op when ml/models/fall/ is already populated.
ensure_fall_models()

# Rendering decimation only — inference always consumes every consecutive
# frame (train/serve parity, ADR-013; see demo-live-inference-frame-parity).
RENDER_FRAME_STRIDE: Final = 4
PLAYING_KEY: Final = "live_playing"


def main() -> None:
    brand_html = (
        '<div style="background:#4A90E2;padding:0.5rem 1.25rem;'
        'border-radius:6px;margin-bottom:0.5rem;">'
        '<span style="color:#fff;font-size:1.4rem;font-weight:700;'
        f'letter-spacing:0.03em;">{APP_PAGE_TITLE}</span>'
        '<span style="color:rgba(255,255,255,0.75);font-size:0.9rem;'
        'font-weight:400;margin-left:0.75rem;">낙상 감지 AI 데모</span>'
        "</div>"
    )
    st.markdown(brand_html, unsafe_allow_html=True)
    st.caption(
        "로컬 ML 데모 전용 — 실시간 프레임 단위 추론 (ADR-010). "
        "임상 진단 또는 백엔드 알림 서비스가 아닙니다."
    )

    app_assets.handle_upload()
    registered_videos = _list_videos()

    source_options = render_live_source_selection(
        registered_videos=registered_videos,
        label=VIDEO_SELECT_LABEL,
    )
    selected_source, camera_index = source_options

    selected_spec = select_classifier_spec()
    classifier_key: str | None = selected_spec.key if selected_spec.available else None
    decision_threshold = select_decision_threshold(selected_spec)
    classifier_params = select_classifier_params()

    _render_live_viewer(
        selected_source=selected_source,
        camera_index=camera_index,
        classifier_key=classifier_key,
        classifier_params=classifier_params,
        decision_threshold=decision_threshold,
    )


def _list_videos() -> list[videos.RegisteredVideo]:
    """Resolve the video dropdown options via the domain/role selector.

    Domain selector over ml/data/{domain}/{processed,raw} plus uploads, then a
    role selector within the chosen domain. This is a local developer tool, so
    every internal data source is listed (ADR-045 — demo is local-only).
    """
    domain_options = [*videos.list_domains(), videos.UPLOADS_DOMAIN]
    col_domain, col_role = st.columns(2)
    selected_domain = col_domain.segmented_control(
        DOMAIN_SELECT_LABEL,
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
        ROLE_SELECT_LABEL,
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


def _source_caption(selected_source: LiveSourceOption, camera_index: int) -> str:
    if selected_source.kind == "camera":
        return f"노트북 카메라 index {camera_index}"
    assert selected_source.video is not None
    return str(selected_source.video.path)


def _source_id_for_selection(selected_source: LiveSourceOption, camera_index: int) -> str:
    if selected_source.kind == "camera":
        return f"camera:{camera_index}"
    assert selected_source.video is not None
    return selected_source.video.video_id


def _frame_source_for_selection(
    selected_source: LiveSourceOption,
    camera_index: int,
) -> FrameSource:
    if selected_source.kind == "camera":
        return CameraSource(camera_index)
    assert selected_source.video is not None
    return VideoFileSource(selected_source.video.path)


def _frame_interval_for_selection(selected_source: LiveSourceOption) -> float:
    if selected_source.kind == "camera":
        return 0.0
    assert selected_source.video is not None
    info = read_video_playback_info(selected_source.video.path)
    return 1.0 / max(info.fps, 1.0)


def _render_live_viewer(
    selected_source: LiveSourceOption,
    camera_index: int,
    classifier_key: str | None,
    classifier_params: ClassifierParams,
    decision_threshold: float | None = None,
) -> None:
    st.subheader("실시간 재생")
    st.caption(_source_caption(selected_source, camera_index))

    size, show_boxes, show_pose = render_live_controls(
        PLAYING_KEY, start_label="재생", stop_label="정지"
    )

    event_ph = st.empty()
    bed_event_ph = st.empty()
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
    source = _frame_source_for_selection(selected_source, camera_index)
    frame_interval = _frame_interval_for_selection(selected_source)

    target = time.perf_counter()
    stream_started = target
    processed = 0
    last_painted_fall = False
    latch = FallEventLatch()
    loss_monitor = DetectionLossMonitor()
    source_id = _source_id_for_selection(selected_source, camera_index)
    alert_client = AlertClient.from_env(source_id=source_id)
    bed_detector = BedDetector()
    try:
        for overlay, status, confidence in iter_live_frames(
            source,
            model,
            show_boxes=show_boxes,
            show_pose=show_pose,
            bed_detector=bed_detector,
        ):
            processed += 1
            frame_time_sec = (
                processed * frame_interval
                if frame_interval > 0.0
                else time.perf_counter() - stream_started
            )
            detected_at = _utc_now_iso()
            # Latched event badge: repainted only on a rising edge (정상→낙상);
            # the raw per-frame status below stays untouched (ADR-027 — the
            # badge aggregates real inference, it never invents state).
            if latch.update(status.is_fall, frame_time_sec):
                if alert_client is not None:
                    alert_client.send(
                        event_type="fall",
                        detected_at=detected_at,
                        confidence=confidence,
                    )
                event_ph.error(
                    f"🚨 낙상 감지 {latch.event_count}회 — "
                    f"최초 {latch.first_event_sec:.1f}초 시점 (영상 종료까지 유지)"
                )
            if status.bed_exit_events:
                if alert_client is not None:
                    alert_client.send(event_type="bed-exit", detected_at=detected_at)
                bed_event_ph.warning(_bed_exit_badge_text(status))
            if loss_monitor.update(pose_count=status.pose_count, time_sec=frame_time_sec):
                if alert_client is not None:
                    alert_client.send(
                        event_type="detection-lost",
                        detected_at=detected_at,
                    )
            if render_due(
                processed,
                RENDER_FRAME_STRIDE,
                is_fall=status.is_fall,
                last_painted_fall=last_painted_fall,
            ):
                frame_ph.image(overlay, channels="RGB", use_container_width=True)
                render_status(
                    status_ph,
                    status,
                    confidence,
                    alert_status=_status_alert_text(
                        alert_client.status_text() if alert_client is not None else None,
                        status,
                    ),
                )
                last_painted_fall = status.is_fall
            if frame_interval > 0.0:
                target += frame_interval
                delay = target - time.perf_counter()
                if delay > 0:
                    time.sleep(delay)
    finally:
        if alert_client is not None:
            alert_client.close()

    if selected_source.kind == "camera" and processed == 0:
        st.session_state[PLAYING_KEY] = False
        status_ph.error(
            f"카메라 index {camera_index}에서 프레임을 읽지 못했습니다. "
            "카메라 연결/권한 또는 다른 앱의 점유 상태를 확인하세요."
        )
        return

    st.session_state[PLAYING_KEY] = False
    status_ph.info(f"재생 완료 — {processed} 프레임 처리됨. 다시 재생하려면 ▶︎ 재생.")


def _bed_exit_badge_text(status: CurrentPlaybackStatus) -> str:
    event_count = status.bed_exit_event_count
    first_sec = status.first_bed_exit_sec
    return f"🛏️ 침대 이탈 {event_count}회 — 최초 {first_sec:.1f}초 시점 (영상 종료까지 유지)"


def _status_alert_text(alert_status: str | None, status: CurrentPlaybackStatus) -> str | None:
    if status.bed_count != 0:
        return alert_status
    no_bed = "침대 없음 — 낙상만 모니터링"
    if alert_status is None:
        return no_bed
    return f"{no_bed} · {alert_status}"


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


if __name__ == "__main__":
    main()
