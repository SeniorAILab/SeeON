from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from contracts.frame import Frame
from contracts.observation import FrameObservation
from worker.camera_worker import CameraWorker
from worker.scheduler import Scheduler


class _Detector:
    def update(self, observation: FrameObservation, time_sec: float | None = None):
        del observation, time_sec
        return {"event_type": "bed-exit", "probability": 0.9, "event_id": "evt-1"}


@dataclass(slots=True)
class _Sink:
    events: list[dict[str, object]] = field(default_factory=list)

    def emit(self, event: dict[str, object]) -> None:
        self.events.append(dict(event))


@dataclass(slots=True)
class _Recorder:
    clip_id: str | None
    event_refs: list[tuple[str, str]] = field(default_factory=list)

    def on_frame(self, camera_id: str, frame: Frame) -> bool:
        del camera_id, frame
        return True

    def on_event(self, camera_id: str, event_ref: str) -> str | None:
        self.event_refs.append((camera_id, event_ref))
        return self.clip_id


def _frame() -> Frame:
    return Frame(index=0, time_sec=12.0, image=np.zeros((8, 8, 3), dtype=np.uint8))


def test_camera_worker_propagates_recorder_clip_id_on_event() -> None:
    sink = _Sink()
    recorder = _Recorder("clip-123")
    worker = CameraWorker(
        "cam-1",
        "facility-1",
        (),
        {},
        scheduler=Scheduler({}),
        domain_detectors=(_Detector(),),
        event_sink=sink,
        clip_recorder=recorder,
    )

    worker.process_frame(_frame())

    assert recorder.event_refs == [("cam-1", "evt-1")]
    assert sink.events[0]["clip_id"] == "clip-123"


def test_camera_worker_sets_null_clip_id_without_recorder() -> None:
    sink = _Sink()
    worker = CameraWorker(
        "cam-1",
        "facility-1",
        (),
        {},
        scheduler=Scheduler({}),
        domain_detectors=(_Detector(),),
        event_sink=sink,
    )

    worker.process_frame(_frame())

    assert sink.events[0]["clip_id"] is None
