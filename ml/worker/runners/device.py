"""Device selection for model runners."""

from __future__ import annotations


def select_device() -> str:
    """Return the best available local inference device.

    Degrades to ``"cpu"`` when torch is unavailable or its backend probes fail.
    """
    try:
        import torch
    except Exception:  # noqa: BLE001 - optional runtime dependency boundary
        return "cpu"

    try:
        if torch.cuda.is_available():
            return "cuda"
    except Exception:  # noqa: BLE001,S110 - backend probe must not break startup
        pass

    try:
        mps = getattr(getattr(torch, "backends", None), "mps", None)
        if mps is not None and mps.is_available():
            return "mps"
    except Exception:  # noqa: BLE001,S110 - backend probe must not break startup
        pass

    return "cpu"
