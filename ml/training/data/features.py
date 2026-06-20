"""Compatibility shim for window-level feature extraction."""

from __future__ import annotations

from features.window_features import _D, extract_window_features

__all__ = ["_D", "extract_window_features"]
