"""Debug prediction routes for serving."""

from __future__ import annotations

from typing import Annotated, Any

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from serving.model import DEFAULT_OPERATING_THRESHOLD, ModelLoadError, get_model
from serving.pipeline import (
    DEFAULT_DURATION_SEC,
    DEFAULT_FRAME_STRIDE,
    DEFAULT_MAX_FRAMES,
    DEFAULT_TIMEOUT_SEC,
    MAX_DURATION_SEC,
    MAX_FRAME_STRIDE,
    MAX_MAX_FRAMES,
    MAX_TIMEOUT_SEC,
    FallPipeline,
    PipelineControls,
    PipelineError,
    PipelineTimeoutError,
    window_to_features,
)
from serving.source_registry import SourceRegistryError, get_source_registry

router = APIRouter(tags=["debug"])


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: str | None = Field(default=None, min_length=1)
    upload_id: str | None = Field(default=None, min_length=1)
    window: list[list[float]] | None = None
    start_sec: Annotated[float, Field(ge=0)] = 0.0
    duration_sec: Annotated[float, Field(gt=0, le=MAX_DURATION_SEC)] = DEFAULT_DURATION_SEC
    frame_stride: Annotated[int, Field(ge=1, le=MAX_FRAME_STRIDE)] = DEFAULT_FRAME_STRIDE
    max_frames: Annotated[int, Field(ge=1, le=MAX_MAX_FRAMES)] = DEFAULT_MAX_FRAMES
    timeout_sec: Annotated[float, Field(gt=0, le=MAX_TIMEOUT_SEC)] = DEFAULT_TIMEOUT_SEC

    @model_validator(mode="after")
    def exactly_one_source(self) -> PredictRequest:
        provided = sum(
            (
                self.source_id is not None,
                self.upload_id is not None,
                self.window is not None,
            )
        )
        if provided != 1:
            raise ValueError("exactly one of source_id, upload_id, or window is required")
        return self


class PredictResponse(BaseModel):
    model: str
    version: str
    fall_probability: float
    operating_threshold: float
    is_fall: bool


def _registry(request: Request):
    return getattr(request.app.state, "source_registry", None) or get_source_registry()


def _model(request: Request) -> Any:
    override = getattr(request.app.state, "model", None)
    return override if override is not None else get_model()


def _pipeline(request: Request) -> FallPipeline:
    override = getattr(request.app.state, "fall_pipeline", None)
    if override is not None:
        return override
    return FallPipeline(_model(request))


def _operating_threshold(model: Any) -> float:
    threshold = getattr(model, "operating_threshold", None)
    if threshold is not None:
        return float(threshold)
    metadata = getattr(model, "metadata", None)
    threshold = getattr(metadata, "operating_threshold", None)
    if threshold is not None:
        return float(threshold)
    return DEFAULT_OPERATING_THRESHOLD


def _predict_response(model: Any, probability: float) -> PredictResponse:
    threshold = _operating_threshold(model)
    return PredictResponse(
        model=model.name,
        version=model.version,
        fall_probability=probability,
        operating_threshold=threshold,
        is_fall=probability >= threshold,
    )


def _window_features(window: list[list[float]]) -> np.ndarray:
    if len(window) < 1:
        raise ValueError("window must contain at least one frame")
    for index, row in enumerate(window):
        if len(row) != 51:
            raise ValueError(f"window frame {index} must contain 51 values")
    arr = np.asarray(window, dtype=np.float32).reshape(len(window), 17, 3)
    if not np.isfinite(arr).all():
        raise ValueError("window values must be finite")
    if ((arr[:, :, 2] < 0.0) | (arr[:, :, 2] > 1.0)).any():
        raise ValueError("window confidence values must be between 0 and 1")
    return window_to_features([arr[index] for index in range(arr.shape[0])])


def _raise_missing_live_source() -> None:
    raise SourceRegistryError("trusted live source has no bounded server-side FrameSource")


@router.post("/debug/predict/window", response_model=PredictResponse)
def predict_window(req: PredictRequest, request: Request) -> PredictResponse:
    if req.window is None:
        raise HTTPException(status_code=400, detail="window is required")
    return _predict(req, request)


@router.post("/debug/predict/source", response_model=PredictResponse)
def predict_source(req: PredictRequest, request: Request) -> PredictResponse:
    if req.window is not None:
        raise HTTPException(status_code=400, detail="source_id or upload_id is required")
    return _predict(req, request)


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest, request: Request) -> PredictResponse:
    """Temporary Slice 11 removal alias for window-mode callers."""
    return _predict(req, request)


def _predict(req: PredictRequest, request: Request) -> PredictResponse:
    try:
        model = _model(request)
        if req.window is not None:
            probability = model.predict(_window_features(req.window))
        else:
            resolved = _registry(request).resolve(source_id=req.source_id, upload_id=req.upload_id)
            if resolved.is_live:
                live_sources = getattr(request.app.state, "live_sources", {})
                source = live_sources.get(resolved.record.source_id)
                if source is None:
                    _raise_missing_live_source()
                controls = PipelineControls(
                    start_sec=0.0,
                    duration_sec=req.duration_sec,
                    frame_stride=req.frame_stride,
                    max_frames=req.max_frames,
                    timeout_sec=req.timeout_sec,
                )
                probability = _pipeline(request).predict_source(source, controls)
            else:
                controls = PipelineControls(
                    start_sec=req.start_sec,
                    duration_sec=req.duration_sec,
                    frame_stride=req.frame_stride,
                    max_frames=req.max_frames,
                    timeout_sec=req.timeout_sec,
                )
                probability = _pipeline(request).predict_path(
                    resolved.path, controls, resolved.record.duration_sec
                )
    except SourceRegistryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PipelineTimeoutError as exc:
        raise HTTPException(status_code=408, detail=str(exc)) from exc
    except (PipelineError, ModelLoadError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _predict_response(model, probability)
