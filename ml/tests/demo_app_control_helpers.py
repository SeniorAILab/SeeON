"""Reusable AppTest widget lookup helpers for the Streamlit demo."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any


def assert_no_exception(at: Any, context: str = "AppTest run") -> None:
    """Fail with a consistent message when Streamlit raised during a run."""
    assert not at.exception, f"{context} raised: {at.exception}"


def labels(widgets: Iterable[Any]) -> list[str]:
    """Return rendered widget labels for assertion diagnostics."""
    return [widget.label for widget in widgets]


def find_labeled(widgets: Iterable[Any], label: str, kind: str) -> Any:
    """Return the first widget with ``label`` or fail with available labels."""
    widget_list = list(widgets)
    for widget in widget_list:
        if widget.label == label:
            return widget
    raise AssertionError(
        f"{kind} labelled {label!r} not found; available labels: {labels(widget_list)}"
    )


def require_exactly_one_labeled(widgets: Iterable[Any], label: str, kind: str) -> Any:
    """Return the only widget with ``label`` or fail with a count diagnostic."""
    matches = [widget for widget in widgets if widget.label == label]
    assert len(matches) == 1, f"Expected exactly 1 {kind} labelled {label!r}, found {len(matches)}"
    return matches[0]


def session_state_bool(at: Any, key: str, *, default: bool = False) -> bool:
    """Read a boolean from AppTest SafeSessionState with an absence default."""
    try:
        return bool(at.session_state[key])
    except KeyError:
        return default
