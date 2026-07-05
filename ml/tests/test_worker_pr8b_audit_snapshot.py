from __future__ import annotations

import base64
import json
import urllib.request
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np
import pytest

from contracts.frame import Frame
from contracts.observation import FrameObservation
from contracts.runner import RunnerOutput, person_result
from events.schemas import CLOCK_SOURCE_EDGE_WALL
from worker.camera_worker import CameraWorker
from worker.edge_worker import _RelayClient
from worker.overlay_renderer import MAX_SNAPSHOT_BYTES, OverlayRenderer
from worker.scheduler import Scheduler


class _Runner:
    def run(self, image: np.ndarray) -> RunnerOutput:
        del image
        return person_result(((1, 1, 20, 20, 0.9),))


class _Detector:
    def __init__(self, event_type: str) -> None:
        self.event_type = event_type

    def update(
        self,
        observation: FrameObservation,
        time_sec: float | None = None,
    ) -> dict[str, object]:
        del observation, time_sec
        return {"event_type": self.event_type, "probability": 0.87}


@dataclass(slots=True)
class _Sink:
    events: list[dict[str, Any]] = field(default_factory=list)

    def emit(self, event: dict[str, Any]) -> None:
        self.events.append(dict(event))


class _Model:
    version = "fall-model-v1"
    operating_threshold = 0.73


@dataclass(slots=True)
class _FallClassifier:
    model: _Model = field(default_factory=_Model)

    def classify(
        self,
        observation: FrameObservation,
        width: int,
        height: int,
        live_ids: set[int],
    ) -> FrameObservation:
        del width, height, live_ids
        return observation


class _SnapshotRenderer:
    def encode_jpeg_bounded(
        self,
        frame: Frame,
        observation: FrameObservation,
        debug_snapshots: tuple[object, ...] = (),
        *,
        max_bytes: int = MAX_SNAPSHOT_BYTES,
    ) -> bytes | None:
        del frame, observation, debug_snapshots, max_bytes
        return b"jpeg-bytes"


class _FakeHTTPResponse:
    def __enter__(self) -> _FakeHTTPResponse:
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        del exc_type, exc, tb

    def read(self) -> bytes:
        return b"{}"


def _frame() -> Frame:
    return Frame(index=1, time_sec=123.0, image=np.zeros((64, 64, 3), dtype=np.uint8))


def _worker(
    event_type: str,
    *,
    snapshot_renderer: object | None = None,
    fall_classifier: object | None = None,
) -> tuple[CameraWorker, _Sink]:
    sink = _Sink()
    worker = CameraWorker(
        "camera-1",
        "facility-1",
        (),
        {"person": _Runner()},
        scheduler=Scheduler({"person": 1}),
        domain_detectors=(_Detector(event_type),),
        event_sink=sink,
        fall_classifier=fall_classifier,  # type: ignore[arg-type]
        snapshot_renderer=snapshot_renderer,  # type: ignore[arg-type]
        detector_version="detector-v1",
    )
    return worker, sink


def test_overlay_renderer_encode_jpeg_bounded_returns_size_limited_bytes() -> None:
    jpeg = OverlayRenderer().encode_jpeg_bounded(
        Frame(index=1, time_sec=1.0, image=np.zeros((480, 640, 3), dtype=np.uint8)),
        FrameObservation(),
    )

    assert jpeg is not None
    assert jpeg.startswith(b"\xff\xd8")
    assert len(jpeg) <= MAX_SNAPSHOT_BYTES


def test_overlay_renderer_encode_jpeg_bounded_returns_none_on_encode_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(*args: object, **kwargs: object) -> tuple[bool, np.ndarray]:
        del args, kwargs
        raise cv2.error("encode failed")

    monkeypatch.setattr(cv2, "imencode", fail)

    assert OverlayRenderer().encode_jpeg_bounded(_frame(), FrameObservation()) is None


@pytest.mark.parametrize("event_type", ["fall", "bed-exit"])
def test_camera_worker_attaches_audit_and_snapshot_for_alert_events(event_type: str) -> None:
    worker, sink = _worker(
        event_type,
        snapshot_renderer=_SnapshotRenderer(),
        fall_classifier=_FallClassifier(),
    )

    worker.process_frame(_frame())

    assert len(sink.events) == 1
    event = sink.events[0]
    assert event["audit"] == {
        "clock_source": CLOCK_SOURCE_EDGE_WALL,
        "model_version": "fall-model-v1",
        "detector_version": "detector-v1",
        "operating_threshold": 0.73,
    }
    assert event["snapshot_jpeg"] == b"jpeg-bytes"


def test_camera_worker_attaches_audit_without_snapshot_renderer() -> None:
    worker, sink = _worker("fall", fall_classifier=_FallClassifier())

    worker.process_frame(_frame())

    assert sink.events[0]["audit"]["clock_source"] == CLOCK_SOURCE_EDGE_WALL
    assert "snapshot_jpeg" not in sink.events[0]


def test_camera_worker_leaves_non_alert_event_unaffected() -> None:
    worker, sink = _worker(
        "movement-increase",
        snapshot_renderer=_SnapshotRenderer(),
        fall_classifier=_FallClassifier(),
    )

    worker.process_frame(_frame())

    assert "audit" not in sink.events[0]
    assert "snapshot_jpeg" not in sink.events[0]


def test_relay_client_forwards_audit_snapshot_and_keeps_evidence_clean(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, object]] = []

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> _FakeHTTPResponse:
        del timeout
        captured.append(json.loads(request.data.decode("utf-8")))
        return _FakeHTTPResponse()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    client = _RelayClient(
        alert_url="http://127.0.0.1:8000/api/v1/relay/alerts",
        heartbeat_url="http://127.0.0.1:8000/api/v1/relay/heartbeat",
        camera_id="camera-1",
        facility_id="facility-1",
        resident_id=None,
        relay_token="token",
        config_version=7,
    )

    client.emit(
        {
            "event_type": "fall",
            "detected_at": "2026-06-23T12:00:00.000Z",
            "probability": 0.91,
            "audit": {"clock_source": CLOCK_SOURCE_EDGE_WALL, "model_version": "model-v1"},
            "snapshot_jpeg": b"jpeg-bytes",
        }
    )

    payload = captured[0]
    assert payload["audit"] == {
        "clock_source": CLOCK_SOURCE_EDGE_WALL,
        "model_version": "model-v1",
        "config_version": 7,
    }
    assert payload["snapshot_jpeg_base64"] == base64.b64encode(b"jpeg-bytes").decode("ascii")
    assert "audit" not in payload["evidence"]
    assert "snapshot_jpeg" not in payload["evidence"]


def test_relay_client_envelope_less_event_keeps_prior_payload_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, object]] = []

    def fake_urlopen(request: urllib.request.Request, timeout: float) -> _FakeHTTPResponse:
        del timeout
        captured.append(json.loads(request.data.decode("utf-8")))
        return _FakeHTTPResponse()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    client = _RelayClient(
        alert_url="http://127.0.0.1:8000/api/v1/relay/alerts",
        heartbeat_url="http://127.0.0.1:8000/api/v1/relay/heartbeat",
        camera_id="camera-1",
        facility_id="facility-1",
        resident_id="resident-1",
        relay_token="token",
    )

    client.emit(
        {
            "event_type": "bed-exit",
            "detected_at": "2026-06-23T12:00:00.000Z",
            "probability": 0.91,
        }
    )

    assert captured == [
        {
            "event_type": "bed-exit",
            "probability": 0.91,
            "detected_at": "2026-06-23T12:00:00.000Z",
            "camera_id": "camera-1",
            "facility_id": "facility-1",
            "evidence": {
                "event_type": "bed-exit",
                "detected_at": "2026-06-23T12:00:00.000Z",
                "probability": 0.91,
            },
            "resident_id": "resident-1",
        }
    ]
