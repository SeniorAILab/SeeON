"""FastAPI serving app (online lifecycle).

PoC end-to-end path:
    video sample -> windowing -> model inference -> FastAPI response -> backend webhook

ML returns predictions only. Product-level alert decisions (policy, dedup,
webhook dispatch) belong to the backend, not here.
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from serving.model import get_model

app = FastAPI(title="fall-detector serving", version="0.1.0")


class PredictRequest(BaseModel):
    # A window of frames/keypoints. PoC accepts a list of float vectors.
    window: list[list[float]] = Field(default_factory=list)


class PredictResponse(BaseModel):
    model: str
    version: str
    fall_probability: float


@app.get("/health")
def health() -> dict:
    model = get_model()
    return {"status": "ok", "model": model.name, "version": model.model_type}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    model = get_model()
    prob = model.predict(req.window)
    return PredictResponse(
        model=model.name,
        version=model.model_type,
        fall_probability=prob,
    )
