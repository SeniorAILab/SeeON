"""Contract tests for the FALL_DEMO_MODE access boundary (ADR-012).

The fail-safe default and the session-upload filter are the privacy
perimeter for deployed demos — these tests pin that behaviour.
"""

from __future__ import annotations

from pathlib import Path

from demo.demo_mode import (
    OPERATOR_MODE,
    PUBLIC_MODE,
    demo_mode,
    filter_videos_for_public_mode,
)
from demo.video_registry import RegisteredVideo, VideoSource


def _video(video_id: str, source: VideoSource, domain: str) -> RegisteredVideo:
    return RegisteredVideo(
        video_id=video_id,
        display_name=video_id.replace("/", " / "),
        path=Path("/tmp") / video_id,
        source=source,
        domain=domain,
    )


def test_mode_defaults_to_public_when_env_is_missing() -> None:
    assert demo_mode(environ={}) == PUBLIC_MODE


def test_mode_is_operator_only_on_exact_opt_in() -> None:
    assert demo_mode(environ={"FALL_DEMO_MODE": "operator"}) == OPERATOR_MODE
    assert demo_mode(environ={"FALL_DEMO_MODE": " OPERATOR "}) == OPERATOR_MODE


def test_unrecognized_mode_values_fail_safe_to_public() -> None:
    for value in ("", "internal", "operatr", "true", "1"):
        assert demo_mode(environ={"FALL_DEMO_MODE": value}) == PUBLIC_MODE


def test_public_filter_keeps_only_session_uploads() -> None:
    session_upload = _video("uploads/mine.mp4", VideoSource.UPLOAD, "uploads")
    foreign_upload = _video("uploads/theirs.mp4", VideoSource.UPLOAD, "uploads")
    internal = _video(
        "nursing-home/processed/room.mp4", VideoSource.PROCESSED, "nursing-home"
    )

    visible = filter_videos_for_public_mode(
        [session_upload, foreign_upload, internal],
        session_upload_ids={"uploads/mine.mp4"},
    )

    assert visible == [session_upload]


def test_public_filter_never_widens_to_internal_sources() -> None:
    # Even a (mis)populated session set cannot surface a non-upload source.
    internal = _video(
        "nursing-home/processed/room.mp4", VideoSource.PROCESSED, "nursing-home"
    )

    visible = filter_videos_for_public_mode(
        [internal], session_upload_ids={"nursing-home/processed/room.mp4"}
    )

    assert visible == []


def test_public_filter_with_empty_session_shows_nothing() -> None:
    upload = _video("uploads/any.mp4", VideoSource.UPLOAD, "uploads")

    assert filter_videos_for_public_mode([upload], session_upload_ids=set()) == []
