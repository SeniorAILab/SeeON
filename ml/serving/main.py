"""FastAPI serving app for safe full-pipeline fall prediction."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from serving.model import ModelLoadError, get_model
from serving.pipeline import (
    DEFAULT_DURATION_SEC,
    DEFAULT_FRAME_STRIDE,
    DEFAULT_MAX_FRAMES,
    DEFAULT_POSE_SIZE,
    DEFAULT_TIMEOUT_SEC,
    MAX_DURATION_SEC,
    MAX_FRAME_STRIDE,
    MAX_MAX_FRAMES,
    MAX_TIMEOUT_SEC,
    FallPipeline,
    PipelineControls,
    PipelineError,
    PipelineTimeoutError,
    pose_weight_available,
)
from serving.source_registry import SourceRegistryError, get_source_registry

app = FastAPI(title="fall-detector serving", version="0.2.0")


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: str | None = Field(default=None, min_length=1)
    upload_id: str | None = Field(default=None, min_length=1)
    start_sec: Annotated[float, Field(ge=0)] = 0.0
    duration_sec: Annotated[float, Field(gt=0, le=MAX_DURATION_SEC)] = DEFAULT_DURATION_SEC
    frame_stride: Annotated[int, Field(ge=1, le=MAX_FRAME_STRIDE)] = DEFAULT_FRAME_STRIDE
    max_frames: Annotated[int, Field(ge=1, le=MAX_MAX_FRAMES)] = DEFAULT_MAX_FRAMES
    timeout_sec: Annotated[float, Field(gt=0, le=MAX_TIMEOUT_SEC)] = DEFAULT_TIMEOUT_SEC

    @model_validator(mode="after")
    def exactly_one_source(self) -> PredictRequest:
        if bool(self.source_id) == bool(self.upload_id):
            raise ValueError("exactly one of source_id or upload_id is required")
        return self


class PredictResponse(BaseModel):
    model: str
    version: str
    fall_probability: float


def _registry(request: Request):
    return getattr(request.app.state, "source_registry", None) or get_source_registry()


def _pipeline(request: Request) -> FallPipeline:
    override = getattr(request.app.state, "fall_pipeline", None)
    if override is not None:
        return override
    return FallPipeline(get_model())


@app.get("/health")
def health() -> dict[str, Any]:
    try:
        model = get_model()
        metadata = model.metadata_dict()
        artifact_available = model.model_path.exists()
        model_status = "ok"
        model_error = None
    except ModelLoadError as exc:
        metadata = None
        artifact_available = False
        model_status = "error"
        model_error = str(exc)
    return {
        "status": "ok" if model_status == "ok" else "degraded",
        "model": metadata,
        "metadata": metadata,
        "model_type": None if metadata is None else metadata.get("model_type"),
        "model_status": model_status,
        "model_error": model_error,
        "pose": {
            "size": DEFAULT_POSE_SIZE,
            "weight_available": pose_weight_available(DEFAULT_POSE_SIZE),
        },
        "artifacts": {"random_forest_available": artifact_available},
    }


def _raise_missing_live_source() -> None:
    raise SourceRegistryError("trusted live source has no bounded server-side FrameSource")


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest, request: Request) -> PredictResponse:
    try:
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
        model = get_model()
    except SourceRegistryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PipelineTimeoutError as exc:
        raise HTTPException(status_code=408, detail=str(exc)) from exc
    except (PipelineError, ModelLoadError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PredictResponse(
        model=model.name,
        version=model.version,
        fall_probability=probability,
    )
