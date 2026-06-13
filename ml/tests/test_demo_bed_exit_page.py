"""Bed-exit Streamlit page smoke (issue #100, AC-17).

Runs the page through Streamlit's AppTest harness (no browser, no real model —
the not-playing path renders controls only). Asserts the page builds without
exception in operator mode and that the night-mode operator control is present
there but hidden in public mode (FALL_DEMO_MODE fail-safe, ADR-012).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from demo.pages.bed_exit import _should_emit_event_badge

PAGE = str(Path(__file__).resolve().parents[1] / "demo" / "pages" / "bed_exit.py")


def _run(monkeypatch: pytest.MonkeyPatch, mode: str) -> AppTest:
    monkeypatch.setenv("FALL_DEMO_MODE", mode)
    at = AppTest.from_file(PAGE, default_timeout=30)
    at.run()
    return at


def test_page_renders_in_operator_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    at = _run(monkeypatch, "operator")
    assert at.exception is None or len(at.exception) == 0
    assert any(t.value == "침대 이탈 탐지" for t in at.title)
    # input-source selector + page-scoped param controls are present
    assert any(r.label == "입력 소스" for r in at.radio)


def test_night_mode_toggle_present_in_operator_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    at = _run(monkeypatch, "operator")
    assert len(at.toggle) == 1


def test_night_mode_toggle_hidden_in_public_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Public is the fail-safe default: the operator night-mode control must not
    # appear, and the page must still render without error.
    at = _run(monkeypatch, "public")
    assert at.exception is None or len(at.exception) == 0
    assert len(at.toggle) == 0


def test_not_playing_shows_start_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    at = _run(monkeypatch, "operator")
    # Before pressing 시작, the page must not enter the detection loop; the
    # start prompt info message is shown instead.
    assert any("시작" in info.value for info in at.info)


@pytest.mark.parametrize(
    ("night_mode", "is_new_event", "bed_present", "expected"),
    [
        (True, True, True, True),  # night + real onset + bed → 🚨 alert fires
        (False, True, True, False),  # AC-8: daytime onset → monitor-only, no event
        (True, False, True, False),  # no rising edge → no badge
        (True, True, False, False),  # no bed → nothing to exit
    ],
)
def test_event_badge_gated_by_night_mode(
    night_mode: bool, is_new_event: bool, bed_present: bool, expected: bool
) -> None:
    # AC-8: a latched bed-exit event (🚨 badge) fires only in night mode. In
    # daytime the rising edge is still detected (latch count stays honest) but
    # the alert is suppressed — monitor-only. No bed means nothing to exit.
    assert (
        _should_emit_event_badge(
            night_mode=night_mode,
            is_new_event=is_new_event,
            bed_present=bed_present,
        )
        is expected
    )
