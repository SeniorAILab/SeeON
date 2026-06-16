"""FALL_DEMO_MODE policy — app-layer access separation (ADR-028 Demo Access Boundary).

The video registry stays mode-agnostic; this module owns the mode resolution
and the public-mode visibility filter that app.py applies on top of it.
Pure (no streamlit import) so the policy is unit-testable.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Mapping
from typing import Final

from demo.video_registry import RegisteredVideo, VideoSource

MODE_ENV_VAR: Final = "FALL_DEMO_MODE"
PUBLIC_MODE: Final = "public"
OPERATOR_MODE: Final = "operator"


def demo_mode(environ: Mapping[str, str] = os.environ) -> str:
    """Resolve the demo mode from the environment.

    Fail-safe: anything other than the exact opt-in value ``operator``
    (missing, empty, typo) resolves to ``public`` — a deployment that forgets
    the variable must never expose internal footage.
    """
    value = environ.get(MODE_ENV_VAR, PUBLIC_MODE).strip().lower()
    return OPERATOR_MODE if value == OPERATOR_MODE else PUBLIC_MODE


def filter_videos_for_public_mode(
    videos: Iterable[RegisteredVideo],
    session_upload_ids: set[str],
) -> list[RegisteredVideo]:
    """Public-mode visibility: only uploads made in the current session.

    Internal domain sources are dropped regardless of *session_upload_ids* —
    the filter never widens what the caller listed.
    """
    return [
        video
        for video in videos
        if video.source is VideoSource.UPLOAD and video.video_id in session_upload_ids
    ]
