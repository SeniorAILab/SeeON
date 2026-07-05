from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from contracts.frame import Frame
from contracts.runner import pose_result
from worker.camera_worker import CameraWorker
from worker.domains.fall.detector import FallEventLatch
from worker.fall_window_classifier import FallWindowClassifier
from worker.scheduler import Scheduler


@dataclass(frozen=True, slots=True)
class _FallMetadata:
    window: int = 3
    stride: int = 1


@dataclass(frozen=True, slots=True)
class _FallModel:
    metadata: _FallMetadata = field(default_factory=_FallMetadata)
    operating_threshold: float = 0.5

    def predict(self, features: np.ndarray) -> float:
        del features
        return 0.91


@dataclass(slots=True)
class _PoseRunner:
    def run(self, image: np.ndarray):
        del image
        keypoints = tuple((20, 20, 0.9) for _ in range(17))
        return pose_result((keypoints,), ((10, 10, 40, 60, 0.95),))


@dataclass(slots=True)
class _Sink:
    events: list[dict[str, object]] = field(default_factory=list)

    def emit(self, event: dict[str, object]) -> None:
        self.events.append(event)


def test_worker_emits_fall_event_when_pose_window_reaches_fall_model_threshold() -> None:
    sink = _Sink()
    worker = CameraWorker(
        camera_id="camera-1",
        facility_id="facility-1",
        frame_source=(
            Frame(index=index, time_sec=float(index), image=np.zeros((80, 80, 3), dtype=np.uint8))
            for index in range(3)
        ),
        runners={"pose": _PoseRunner()},
        scheduler=Scheduler({"pose": 1}),
        domain_detectors=(FallEventLatch(),),
        event_sink=sink,
        fall_classifier=FallWindowClassifier(_FallModel()),
    )

    assert worker.run(max_frames=3) == 3
    assert sink.events == [
        {
            "domain": "fall",
            "event_type": "fall",
            "identity": 1,
            "probability": 0.91,
            "time_sec": 2.0,
            "camera_id": "camera-1",
            "facility_id": "facility-1",
            "audit": {
                "clock_source": "edge_wall_clock",
                "operating_threshold": 0.5,
            },
        }
    ]
