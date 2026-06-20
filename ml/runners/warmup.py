"""Minimal runner warmup hook."""

from __future__ import annotations

from typing import Any


def warmup_runner(runner: object) -> object:
    """Trigger a runner's documented cheap warmup hook when present.

    Slice 9 wires this into serving lifespan. Until runners expose a common
    warmup protocol, this is intentionally conservative: call ``warmup()`` when
    the object provides it, otherwise return the runner unchanged.
    """
    warmup = getattr(runner, "warmup", None)
    if callable(warmup):
        result: Any = warmup()
        return runner if result is None else result
    return runner
