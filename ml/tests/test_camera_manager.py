from __future__ import annotations

from collections.abc import Iterator

import numpy as np

from contracts.frame import Frame
from runtime.camera_manager import CameraConfig, CameraManager
from runtime.incident_manager import IncidentManager
from runtime.scheduler import Scheduler
from runtime.status_store import CameraStatus, StatusStore


class FakeSource:
    def __init__(self, camera_offset: int, frame_count: int = 2) -> None:
        self.camera_offset = camera_offset
        self.frame_count = frame_count

    def __iter__(self) -> Iterator[Frame]:
        for index in range(self.frame_count):
            image = np.full((2, 2, 3), self.camera_offset + index, dtype=np.uint8)
            yield Frame(index=index, time_sec=float(index), image=image)


class FailingSource:
    def __iter__(self) -> Iterator[Frame]:
        raise OSError("camera unavailable")
        yield  # pragma: no cover


class FakePoseRunner:
    def __init__(self) -> None:
        self.images: list[int] = []

    def predict_full(self, image: np.ndarray) -> object:
        self.images.append(int(image[0, 0, 0]))
        pose = (((1, 2, 0.9),),)
        raw_boxes = ((1, 2, 3, 4, 0.8),)
        return pose, raw_boxes


class FakeDetector:
    def __init__(self) -> None:
        self.observations = []

    def update(self, observation, time_sec: float | None = None) -> object:
        self.observations.append(observation)
        return {
            "domain": "fall",
            "event_type": "fall.detected",
            "identity": "same-person",
            "time_sec": time_sec,
        }


class FakeSink:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    def emit(self, event: object) -> None:
        self.events.append(event)  # type: ignore[arg-type]


def test_camera_manager_runs_multiple_cameras_end_to_end_and_suppresses_duplicates() -> None:
    status_store = StatusStore()
    incident_manager = IncidentManager(cooldown_sec=60)
    sink = FakeSink()
    runner_a = FakePoseRunner()
    runner_b = FakePoseRunner()
    detector_a = FakeDetector()
    detector_b = FakeDetector()
    manager = CameraManager(
        status_store=status_store,
        incident_manager=incident_manager,
        event_sink=sink,
        cameras=(
            CameraConfig(
                camera_id="cam-a",
                facility_id="facility-1",
                frame_source=FakeSource(10),
                runners={"pose": runner_a},
                domain_detectors=(detector_a,),
                scheduler=Scheduler({"pose": 1}),
            ),
            CameraConfig(
                camera_id="cam-b",
                facility_id="facility-1",
                frame_source=FakeSource(20),
                runners={"pose": runner_b},
                domain_detectors=(detector_b,),
                scheduler=Scheduler({"pose": 1}),
            ),
        ),
    )

    assert manager.run(max_frames_per_camera=2) == {"cam-a": 2, "cam-b": 2}

    assert runner_a.images == [10, 11]
    assert runner_b.images == [20, 21]
    assert len(detector_a.observations) == 2
    assert detector_a.observations[0].keypoints == (((1, 2, 0.9),),)
    assert detector_a.observations[0].boxes[0].confidence == 0.8
    assert sink.events == [
        {
            "domain": "fall",
            "event_type": "fall.detected",
            "identity": "same-person",
            "time_sec": 0.0,
            "camera_id": "cam-a",
            "facility_id": "facility-1",
        },
        {
            "domain": "fall",
            "event_type": "fall.detected",
            "identity": "same-person",
            "time_sec": 0.0,
            "camera_id": "cam-b",
            "facility_id": "facility-1",
        },
    ]
    assert status_store.get_status("cam-a").status == CameraStatus.READY  # type: ignore[union-attr]
    assert status_store.get_status("cam-b").status == CameraStatus.READY  # type: ignore[union-attr]


def test_camera_manager_source_failure_marks_degraded_without_crashing() -> None:
    status_store = StatusStore()
    manager = CameraManager(
        status_store=status_store,
        incident_manager=IncidentManager(),
        cameras=(
            CameraConfig(
                camera_id="cam-a",
                facility_id="facility-1",
                frame_source=FailingSource(),
                runners={},
            ),
        ),
    )

    assert manager.run(max_frames_per_camera=1) == {"cam-a": 0}

    status = status_store.get_status("cam-a")
    assert status is not None
    assert status.status == CameraStatus.DEGRADED
    assert status.error_category == "OSError"
    ops_summary = [
        (event.event_type, event.camera_id, event.facility_id, event.category)
        for event in status_store.ops_events()
    ]
    assert ops_summary == [("camera.offline", "cam-a", "facility-1", "OSError")]

class _RaisingRunner:
    """A runner whose per-frame inference always fails."""

    def predict_full(self, image: np.ndarray) -> object:
        raise RuntimeError("runner exploded")


def test_per_frame_processing_failure_is_not_reported_as_camera_offline() -> None:
    # A runner/detector exception is a PROCESSING fault, not a source fault: it must
    # surface as a distinct ops event and must NOT be misclassified as camera.offline,
    # and the worker must keep processing subsequent frames.
    status_store = StatusStore()
    sink = FakeSink()
    manager = CameraManager(
        status_store=status_store,
        incident_manager=IncidentManager(),
        event_sink=sink,
        cameras=(
            CameraConfig(
                camera_id="cam-a",
                facility_id="facility-1",
                frame_source=FakeSource(10, frame_count=2),
                runners={"pose": _RaisingRunner()},
                domain_detectors=(FakeDetector(),),
                scheduler=Scheduler({"pose": 1}),
            ),
        ),
    )

    # Both frames are attempted (worker did not die on the first failure).
    assert manager.run(max_frames_per_camera=2) == {"cam-a": 2}

    # The source is healthy, so the camera stays READY (NOT degraded/offline).
    status = status_store.get_status("cam-a")
    assert status is not None
    assert status.status == CameraStatus.READY

    ops_types = [event.event_type for event in status_store.ops_events()]
    # Distinct processing-error evidence, and never camera.offline.
    assert ops_types == ["frame.processing_error", "frame.processing_error"]
    assert "camera.offline" not in ops_types
    # No event reached the sink because processing never completed.
    assert sink.events == []
