"""Compatibility shim for the perception tracker public surface."""

from __future__ import annotations

from features.geometry import greedy_match, iou
from perception.tracker import GreedyIouTracker, _Track

__all__ = ["GreedyIouTracker", "_Track", "greedy_match", "iou"]
