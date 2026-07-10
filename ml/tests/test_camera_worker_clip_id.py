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

class _SequenceDetector:
    def update(self, observation: FrameObservation, time_sec: float | None = None):
        del observation, time_sec
        return [
            {"event_type": "bed-exit", "probability": 0.9, "event_id": "evt-1"},
            {"event_type": "bed-exit", "probability": 0.9, "event_id": "evt-2"},
        ]
class _IdentitylessSequenceDetector:
    def update(self, observation: FrameObservation, time_sec: float | None = None):
        del observation, time_sec
        return [
            {"event_type": "bed-exit", "probability": 0.9},
            {"event_type": "bed-exit", "probability": 0.9},
        ]

class _TwoFrameDetector:
    def __init__(self) -> None:
        self._events = iter(
            (
                {"event_type": "bed-exit", "probability": 0.9, "event_id": "evt-1"},
                {"event_type": "bed-exit", "probability": 0.9, "event_id": "evt-2"},
            )
        )

    def update(self, observation: FrameObservation, time_sec: float | None = None):
        del observation, time_sec
        return next(self._events)




@dataclass(slots=True)
class _Sink:
    events: list[dict[str, object]] = field(default_factory=list)

    def emit(self, event: dict[str, object]) -> None:
        self.events.append(dict(event))


@dataclass(slots=True)
class _Recorder:
    clip_id: str | None
    event_refs: list[tuple[str, str]] = field(default_factory=list)
    event_types: list[str | None] = field(default_factory=list)
    allow_new_clips: list[bool] = field(default_factory=list)

    def on_frame(self, camera_id: str, frame: Frame) -> bool:
        del camera_id, frame
        return True

    def on_event(
        self,
        camera_id: str,
        event_ref: str,
        event_type: str | None = None,
        *,
        allow_new_clip: bool = True,
    ) -> str | None:
        self.event_refs.append((camera_id, event_ref))
        self.event_types.append(event_type)
        self.allow_new_clips.append(allow_new_clip)
        return self.clip_id

@dataclass(slots=True)
class _AttachOnlyRecorder:
    active_clip_id: str | None = None

    def on_frame(self, camera_id: str, frame: Frame) -> bool:
        del camera_id, frame
        return True

    def on_event(
        self,
        camera_id: str,
        event_ref: str,
        event_type: str | None = None,
        *,
        allow_new_clip: bool = True,
    ) -> str | None:
        del camera_id, event_ref, event_type
        if self.active_clip_id is not None:
            return self.active_clip_id
        if not allow_new_clip:
            return None
        self.active_clip_id = "clip-123"
        return self.active_clip_id



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
    assert recorder.event_types == ["bed-exit"]
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
def test_camera_worker_emits_distinct_events_while_throttling_clip_recording(monkeypatch) -> None:
    sink = _Sink()
    recorder = _Recorder("clip-123")
    times = iter((100.0, 100.0, 101.0, 101.0))
    monkeypatch.setattr("worker.camera_worker.time.monotonic", lambda: next(times))
    worker = CameraWorker(
        "cam-1",
        "facility-1",
        (),
        {},
        scheduler=Scheduler({}),
        domain_detectors=(_SequenceDetector(),),
        event_sink=sink,
        clip_recorder=recorder,
        clip_recording_min_interval_sec=30.0,
    )

    worker.process_frame(_frame())

    assert [event["event_id"] for event in sink.events] == ["evt-1", "evt-2"]
    assert recorder.event_refs == [("cam-1", "evt-1"), ("cam-1", "evt-2")]
    assert recorder.allow_new_clips == [True, False]
    assert [event["clip_id"] for event in sink.events] == ["clip-123", "clip-123"]
def test_camera_worker_throttle_does_not_open_clip_after_active_clip_ends(monkeypatch) -> None:
    sink = _Sink()
    recorder = _AttachOnlyRecorder()
    times = iter((100.0, 100.0, 101.0, 101.0))
    monkeypatch.setattr("worker.camera_worker.time.monotonic", lambda: next(times))
    worker = CameraWorker(
        "cam-1",
        "facility-1",
        (),
        {},
        scheduler=Scheduler({}),
        domain_detectors=(_TwoFrameDetector(),),
        event_sink=sink,
        clip_recorder=recorder,
        clip_recording_min_interval_sec=30.0,
    )

    worker.process_frame(_frame())
    recorder.active_clip_id = None
    worker.process_frame(_frame())

    assert [event["clip_id"] for event in sink.events] == ["clip-123", None]

def test_camera_worker_emits_identityless_events_within_incident_cooldown(monkeypatch) -> None:
    sink = _Sink()
    times = iter((100.0, 101.0))
    monkeypatch.setattr("worker.camera_worker.time.monotonic", lambda: next(times))
    worker = CameraWorker(
        "cam-1",
        "facility-1",
        (),
        {},
        scheduler=Scheduler({}),
        domain_detectors=(_IdentitylessSequenceDetector(),),
        event_sink=sink,
    )

    worker.process_frame(_frame())

    assert len(sink.events) == 2
