"""Serving-backed fall classifier for the Streamlit demo (ADR-029 single path).

The demo extracts pose locally (overlay + window assembly) but the fall-decision
signal must come from the real ml-serving ``/predict`` — never an in-process
shortcut (``docs/rules/streamlit-demo.md`` §8 / ADR-014). This client wraps
``/predict`` (window mode) behind the same ``predict_proba(X) -> [N, 2]``
interface the temporal module already drives, so the only change at the seam is
*which object* it calls.

HTTP uses stdlib ``urllib.request`` (mirroring ``core.alert_client``) — no new
dependency. Any HTTP / parse failure raises: the demo fails loud rather than
quietly degrading to a fake path.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Final

import numpy as np
from numpy.typing import NDArray

SERVING_URL_ENV: Final = "FALL_SERVING_URL"
DEFAULT_TIMEOUT_SEC: Final = 5.0


class ServingPredictError(RuntimeError):
    """Raised when serving /predict is unreachable or returns an unusable body."""


class ServingFallClassifier:
    """Routes window-batch classification through ml-serving ``/predict``.

    ``predict_proba`` accepts the raw per-track window batch ``float[N, W, 51]``
    (17 COCO keypoints x {x, y, conf}) — the same array the temporal module
    builds in ``mode="sequence"``. Each window is POSTed to ``/predict`` which
    runs ``window_to_features`` and the configured model, so serving owns the
    decision (ADR-029).
    """

    def __init__(self, base_url: str, *, timeout_sec: float = DEFAULT_TIMEOUT_SEC) -> None:
        self._url = base_url.rstrip("/") + "/predict"
        self._timeout = timeout_sec

    def predict_proba(self, X: NDArray[np.float32]) -> NDArray[np.float32]:
        arr = np.asarray(X, dtype=np.float32)
        if arr.ndim != 3 or arr.shape[2] != 51:
            raise ValueError(f"expected window batch [N, W, 51], got {arr.shape}")
        probs = np.array(
            [self._predict_one(window) for window in arr], dtype=np.float32
        )
        # [N, 2] to match sklearn predict_proba; caller reads column 1 (fall).
        return np.stack([1.0 - probs, probs], axis=1)

    def _predict_one(self, window: NDArray[np.float32]) -> float:
        body = json.dumps({"window": window.tolist()}).encode("utf-8")
        request = urllib.request.Request(
            self._url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                payload = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise ServingPredictError(
                f"serving /predict returned {exc.code}: {detail}"
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ServingPredictError(
                f"serving /predict unreachable at {self._url}: {exc}"
            ) from exc
        try:
            return float(payload["fall_probability"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ServingPredictError(
                f"serving /predict body missing fall_probability: {payload!r}"
            ) from exc


def serving_url_from_env() -> str | None:
    """Return the configured serving base URL, or None when in-process is used."""
    url = os.environ.get(SERVING_URL_ENV, "").strip()
    return url or None
