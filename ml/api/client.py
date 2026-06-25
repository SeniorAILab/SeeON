"""Serving-backed fall classifier for the Streamlit demo (ADR-029 single path)."""

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
PREDICT_WINDOW_PATH: Final = "/debug/predict/window"


class ServingPredictError(RuntimeError):
    """Raised when api prediction is unreachable or returns an unusable body."""


class ServingFallClassifier:
    """Routes demo window-batch classification through api HTTP."""

    def __init__(self, base_url: str, *, timeout_sec: float = DEFAULT_TIMEOUT_SEC) -> None:
        self._url = base_url.rstrip("/") + PREDICT_WINDOW_PATH
        self._timeout = timeout_sec

    def predict_proba(self, X: NDArray[np.float32]) -> NDArray[np.float32]:
        arr = np.asarray(X, dtype=np.float32)
        if arr.ndim != 3 or arr.shape[2] != 51:
            raise ValueError(f"expected window batch [N, W, 51], got {arr.shape}")
        probs = np.array([self._predict_one(window) for window in arr], dtype=np.float32)
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
                f"api {PREDICT_WINDOW_PATH} returned {exc.code}: {detail}"
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ServingPredictError(
                f"api {PREDICT_WINDOW_PATH} unreachable at {self._url}: {exc}"
            ) from exc
        try:
            return float(payload["fall_probability"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ServingPredictError(
                f"api {PREDICT_WINDOW_PATH} body missing fall_probability: {payload!r}"
            ) from exc


def serving_url_from_env() -> str | None:
    """Return the configured api base URL, or None when no api URL is set."""
    url = os.environ.get(SERVING_URL_ENV, "").strip()
    return url or None
