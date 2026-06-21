"""Compatibility shim for the serving HTTP client."""

from serving.client import (
    DEFAULT_TIMEOUT_SEC,
    SERVING_URL_ENV,
    ServingFallClassifier,
    ServingPredictError,
    serving_url_from_env,
)

__all__ = [
    "DEFAULT_TIMEOUT_SEC",
    "SERVING_URL_ENV",
    "ServingFallClassifier",
    "ServingPredictError",
    "serving_url_from_env",
]
