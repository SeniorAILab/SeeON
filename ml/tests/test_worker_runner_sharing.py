from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from pydantic import SecretStr

from runtime.camera_worker import RunnerOutput
from runtime.edge_worker_config import CameraRuntimeConfig, EdgeWorkerConfig
from runtime.status_store import StatusStore


class _Runner:
    def run(self, image: np.ndarray) -> RunnerOutput:
        del image
        return ()


@dataclass(frozen=True, slots=True)
class _FallMetadata:
    window: int = 30
    stride: int = 5


@dataclass(frozen=True, slots=True)
class _FallModel:
    metadata: _FallMetadata = field(default_factory=_FallMetadata)
    operating_threshold: float = 0.5

    def predict(self, features: np.ndarray) -> float:
        del features
        return 0.0


@dataclass(slots=True)
class _CountingRegistry:
    pose_runner: _Runner = field(default_factory=_Runner)
    bed_runner: _Runner = field(default_factory=_Runner)
    fall_model: _FallModel = field(default_factory=_FallModel)
    created: dict[str, int] = field(default_factory=lambda: {"pose": 0, "bed": 0, "fall": 0})

    def create(self, task: str) -> RunnerOutput | _Runner | _FallModel:
        self.created[task] += 1
        if task == "pose":
            return self.pose_runner
        if task == "bed":
            return self.bed_runner
        if task == "fall":
            return self.fall_model
        raise AssertionError(f"unexpected task {task}")


def test_worker_builds_pose_and_bed_runners_once_for_four_cameras(monkeypatch) -> None:
    from worker import edge_worker

    registry = _CountingRegistry()
    monkeypatch.setattr(edge_worker, "DEFAULT_REGISTRY", registry)

    supervisor = edge_worker._build_supervisor(_four_camera_config(), StatusStore())

    assert registry.created == {"pose": 1, "bed": 1, "fall": 1}
    assert {
        id(loop.worker.runners["pose"])
        for loop in supervisor.loops
    } == {id(registry.pose_runner)}
    assert {
        id(loop.worker.runners["bed"])
        for loop in supervisor.loops
    } == {id(registry.bed_runner)}


def _four_camera_config() -> EdgeWorkerConfig:
    return EdgeWorkerConfig(
        alert_api_url="http://backend.local/ingest/alerts",
        heartbeat_api_url="http://backend.local/ingest/heartbeat",
        cameras=tuple(
            CameraRuntimeConfig(
                camera_id=f"camera-{index}",
                facility_id="facility-1",
                resident_id=None,
                rtsp_url=f"rtsp://camera-{index}.local/trackID=2",
                ingest_key_id=f"key-{index}",
                ingest_secret=SecretStr(f"secret-{index}"),
            )
            for index in range(1, 5)
        ),
    )
