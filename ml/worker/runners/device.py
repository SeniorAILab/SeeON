"""Device selection for model runners."""

from __future__ import annotations


def select_device(explicit_device: str | None = None) -> str:
    """Return the composition-root inference device for model runners.

    An explicit device from tests/config wins. Auto-selection is intentionally
    conservative: choose CUDA only when torch reports it available, otherwise
    degrade to ``"cpu"`` when torch is unavailable or its backend probes fail.
    """
    if explicit_device is not None:
        return explicit_device

    try:
        import torch
    except Exception:  # noqa: BLE001 - optional runtime dependency boundary
        return "cpu"

    try:
        if torch.cuda.is_available():
            return "cuda"
    except Exception:  # noqa: BLE001,S110 - backend probe must not break startup
        pass

    return "cpu"
