from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from api.main import PredictRequest, app, predict
from api.pipeline import PipelineControls, PipelineError
from api.source_registry import SourceRegistry


class StubModel:
    name = "fall-detector"
    version = "test"

    class Metadata:
        window = 2
        feature_dim = 45
        operating_threshold = 0.5

        def asdict(self):
            return {
                "name": "fall-detector",
                "version": "test",
                "window": 2,
                "feature_dim": 45,
                "operating_threshold": 0.5,
            }

    metadata = Metadata()
    model_path = Path("/tmp/model.pkl")

    def predict(self, features):
        return 0.73


def _valid_window(frames: int = 2) -> list[list[float]]:
    frame = []
    for index in range(17):
        frame.extend([0.1 + index * 0.01, 0.2 + index * 0.01, 0.9])
    return [list(frame) for _ in range(frames)]


class StubPipeline:
    def __init__(self, *, error: Exception | None = None) -> None:
        self.error = error
        self.calls = []

    def predict_path(
        self, path: Path, controls: PipelineControls, source_duration_sec: float
    ) -> float:
        self.calls.append(("path", path, controls, source_duration_sec))
        controls.validate(source_duration_sec)
        if self.error:
            raise self.error
        return 0.73

    def predict_source(self, source, controls: PipelineControls) -> float:
        self.calls.append(("live", source, controls))
        if self.error:
            raise self.error
        return 0.61


def _request(tmp_path: Path, mapping: dict, pipeline: StubPipeline | None = None):
    app.state.source_registry = SourceRegistry.from_mapping(mapping, base_dir=tmp_path)
    app.state.fall_pipeline = pipeline or StubPipeline()
    app.state.live_sources = {}
    return SimpleNamespace(app=app)


@pytest.fixture(autouse=True)
def _patch_model(monkeypatch):
    import api.main as main

    monkeypatch.setattr(main, "get_model", lambda: StubModel())
    yield
    for name in ("source_registry", "fall_pipeline", "live_sources"):
        if hasattr(app.state, name):
            delattr(app.state, name)


def _video(tmp_path: Path, name: str = "clip.mp4") -> Path:
    path = tmp_path / name
    path.write_bytes(b"not-real-video-but-registry-safe")
    return path


def _predict(payload: dict, request):
    return predict(PredictRequest.model_validate(payload), request)


def _raises_http(payload: dict, request) -> HTTPException:
    with pytest.raises(HTTPException) as exc:
        _predict(payload, request)
    return exc.value


def test_valid_allowlisted_source_positive(tmp_path: Path):
    _video(tmp_path)
    pipeline = StubPipeline()
    request = _request(
        tmp_path,
        {"safe": {"path": "clip.mp4", "duration_sec": 10, "mime_type": "video/mp4"}},
        pipeline,
    )

    res = _predict({"source_id": "safe", "duration_sec": 2, "max_frames": 5}, request)

    assert res.model_dump() == {
        "model": "fall-detector",
        "version": "test",
        "fall_probability": 0.73,
        "operating_threshold": 0.5,
        "is_fall": True,
    }
    assert pipeline.calls[0][0] == "path"


def test_valid_window_positive(tmp_path: Path):
    request = _request(tmp_path, {})

    res = _predict({"window": _valid_window()}, request)

    assert res.model_dump() == {
        "model": "fall-detector",
        "version": "test",
        "fall_probability": 0.73,
        "operating_threshold": 0.5,
        "is_fall": True,
    }


@pytest.mark.parametrize("window", [[], [[0.0] * 50]])
def test_malformed_window_rejected(tmp_path: Path, window: list[list[float]]):
    exc = _raises_http({"window": window}, _request(tmp_path, {}))

    assert exc.status_code == 400
    assert "window" in exc.detail


def test_window_and_source_id_rejected_by_schema():
    with pytest.raises(ValidationError):
        PredictRequest.model_validate({"source_id": "safe", "window": _valid_window()})


def test_unknown_source_rejected(tmp_path: Path):
    exc = _raises_http({"source_id": "missing"}, _request(tmp_path, {}))
    assert exc.status_code == 400
    assert "unknown source" in exc.detail


@pytest.mark.parametrize("source_id", ["../secret.mp4", "/tmp/secret.mp4", "~/secret.mp4"])
def test_traversal_and_raw_paths_rejected(tmp_path: Path, source_id: str):
    exc = _raises_http({"source_id": source_id}, _request(tmp_path, {}))
    assert exc.status_code == 400
    assert "path" in exc.detail or "traversal" in exc.detail


@pytest.mark.parametrize(
    "payload", [{"path": "/tmp/x.mp4"}, {"source_id": "safe", "path": "x.mp4"}]
)
def test_abs_raw_path_field_rejected(payload: dict):
    with pytest.raises(ValidationError):
        PredictRequest.model_validate(payload)


def test_device_index_rejected(tmp_path: Path):
    exc = _raises_http({"source_id": "0"}, _request(tmp_path, {}))
    assert exc.status_code == 400
    assert "device" in exc.detail


@pytest.mark.parametrize("source_id", ["rtsp://camera/1", "camera:0", "http://camera/live.m3u8"])
def test_live_descriptor_rejected(tmp_path: Path, source_id: str):
    exc = _raises_http({"source_id": source_id}, _request(tmp_path, {}))
    assert exc.status_code == 400
    assert "live descriptor" in exc.detail


def test_invalid_ext_mime_rejected(tmp_path: Path):
    _video(tmp_path, "clip.txt")
    request = _request(
        tmp_path,
        {"bad": {"path": "clip.txt", "duration_sec": 5, "mime_type": "text/plain"}},
    )
    exc = _raises_http({"source_id": "bad"}, request)
    assert exc.status_code == 400
    assert "extension" in exc.detail


def test_over_duration_rejected(tmp_path: Path):
    _video(tmp_path)
    request = _request(tmp_path, {"safe": {"path": "clip.mp4", "duration_sec": 5}})
    exc = _raises_http({"source_id": "safe", "start_sec": 4, "duration_sec": 2}, request)
    assert exc.status_code == 400
    assert "exceeds source duration" in exc.detail


def test_over_frame_budget_rejected_by_schema():
    with pytest.raises(ValidationError):
        PredictRequest.model_validate({"source_id": "safe", "max_frames": 301})


def test_invalid_stride_rejected_by_schema():
    with pytest.raises(ValidationError):
        PredictRequest.model_validate({"source_id": "safe", "frame_stride": 0})


def test_timeout_returns_408(tmp_path: Path):
    _video(tmp_path)
    from api.pipeline import PipelineTimeoutError

    request = _request(
        tmp_path,
        {"safe": {"path": "clip.mp4", "duration_sec": 10}},
        StubPipeline(error=PipelineTimeoutError("prediction timed out")),
    )
    exc = _raises_http({"source_id": "safe"}, request)
    assert exc.status_code == 408


@pytest.mark.parametrize(
    "message",
    [
        "no person detected in requested source window",
        "insufficient person keypoint window: got 1, need 2",
    ],
)
def test_no_person_no_window_are_explicit_errors(tmp_path: Path, message: str):
    _video(tmp_path)
    request = _request(
        tmp_path,
        {"safe": {"path": "clip.mp4", "duration_sec": 10}},
        StubPipeline(error=PipelineError(message)),
    )
    exc = _raises_http({"source_id": "safe"}, request)
    assert exc.status_code == 400
    assert message in exc.detail


def test_trusted_live_source_positive(tmp_path: Path):
    pipeline = StubPipeline()
    request = _request(
        tmp_path,
        {"cam-a": {"path": "ignored", "duration_sec": 1, "kind": "live", "trusted_live": True}},
        pipeline,
    )
    app.state.live_sources = {"cam-a": object()}
    res = _predict({"source_id": "cam-a", "duration_sec": 1, "max_frames": 2}, request)
    assert res.fall_probability == 0.61
    assert pipeline.calls[0][0] == "live"
    assert res.operating_threshold == 0.5
    assert res.is_fall is True


def test_untrusted_live_source_rejected(tmp_path: Path):
    request = _request(
        tmp_path,
        {"cam-a": {"path": "ignored", "duration_sec": 1, "kind": "live", "trusted_live": False}},
    )
    exc = _raises_http({"source_id": "cam-a"}, request)
    assert exc.status_code == 400
    assert "trusted" in exc.detail
