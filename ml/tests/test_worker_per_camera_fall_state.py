from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from runtime.edge_worker_config import CameraRuntimeConfig, EdgeWorkerConfig
from runtime.status_store import StatusStore
from worker import edge_worker


@dataclass(frozen=True, slots=True)
class _FallMetadata:
    window: int = 3
    stride: int = 1
    mode: str = "sequence"


@dataclass(frozen=True, slots=True)
class _FallModel:
    metadata: _FallMetadata = field(default_factory=_FallMetadata)
    operating_threshold: float = 0.5

    def predict(self, features: np.ndarray) -> float:
        return 0.91 if features.shape == (3, 51) else 0.0


class _Runner:
    def run(self, image: np.ndarray) -> tuple[()]:
        del image
        return ()


@dataclass(slots=True)
class _Registry:
    created: dict[str, int] = field(
        default_factory=lambda: {"pose": 0, "person": 0, "bed": 0, "fall": 0}
    )
    fall_model: _FallModel = field(default_factory=_FallModel)
    pose_runner: _Runner = field(default_factory=_Runner)
    person_runner: _Runner = field(default_factory=_Runner)
    bed_runner: _Runner = field(default_factory=_Runner)

    def create(self, task: str, **kwargs: object) -> object:
        del kwargs
        self.created[task] += 1
        if task == "pose":
            return self.pose_runner
        if task == "person":
            return self.person_runner
        if task == "bed":
            return self.bed_runner
        if task == "fall":
            return self.fall_model
        raise AssertionError(task)


def test_fall_classifier_state_is_per_camera() -> None:
    registry = _Registry()
    supervisor = edge_worker._build_supervisor(
        _two_camera_config(), StatusStore(), registry=registry
    )

    classifiers = [loop.worker.fall_classifier for loop in supervisor.loops]
    detectors = [loop.worker.domain_detectors[0] for loop in supervisor.loops]

    assert registry.created == {"pose": 1, "person": 1, "bed": 1, "fall": 1}
    assert len({id(classifier) for classifier in classifiers}) == 2
    assert len({id(detector) for detector in detectors}) == 2
    assert {id(classifier.model) for classifier in classifiers if classifier is not None} == {
        id(registry.fall_model)
    }


def _two_camera_config() -> EdgeWorkerConfig:
    return EdgeWorkerConfig(
        version=1,
        relay={"url": "http://127.0.0.1:8000", "token": "relay-token"},
        cameras=tuple(
            CameraRuntimeConfig(
                camera_id=f"camera-{index}",
                facility_id="facility-1",
                resident_id=f"resident-{index}",
                rtsp_url=f"rtsp://camera-{index}.local/trackID=2",
            )
            for index in range(1, 3)
        ),
    )
