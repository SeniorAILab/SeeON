from __future__ import annotations

import threading
from collections.abc import Iterator

import numpy as np

from contracts.frame import Frame, FrameSource
from runtime.camera_worker import CameraWorker
from runtime.edge_worker_supervisor import EdgeWorkerSupervisor
from runtime.scheduler import Scheduler
from runtime.status_store import CameraStatus, StatusStore


class _FiniteSource:
    def __init__(self, offset: int, count: int = 3) -> None:
        self.offset = offset
        self.count = count

    def __iter__(self) -> Iterator[Frame]:
        for index in range(self.count):
            image = np.full((1, 1, 3), self.offset + index, dtype=np.uint8)
            yield Frame(index=index, time_sec=float(index), image=image)


class _FailingSource:
    def __iter__(self) -> Iterator[Frame]:
        raise OSError("rtsp offline")
        yield


class _ThreadRecordingRunner:
    def __init__(self) -> None:
        self.thread_names: list[str] = []
        self.values: list[int] = []

    def run(self, image: np.ndarray) -> object:
        self.thread_names.append(threading.current_thread().name)
        self.values.append(int(image[0, 0, 0]))
        return None


def test_one_offline_camera_does_not_stop_other_three() -> None:
    status_store = StatusStore()
    workers = [
        _worker("camera-1", _FiniteSource(10), status_store),
        _worker("camera-2", _FiniteSource(20), status_store),
        _worker("camera-3", _FailingSource(), status_store),
        _worker("camera-4", _FiniteSource(40), status_store),
    ]
    supervisor = EdgeWorkerSupervisor.from_workers(workers, status_store=status_store)

    result = supervisor.run(max_frames_per_camera=1)

    assert result == {"camera-1": 1, "camera-2": 1, "camera-3": 0, "camera-4": 1}
    assert _camera_status(status_store, "camera-3") == CameraStatus.DEGRADED
    assert _camera_status(status_store, "camera-1") == CameraStatus.READY
    assert _camera_status(status_store, "camera-2") == CameraStatus.READY
    assert _camera_status(status_store, "camera-4") == CameraStatus.READY


def test_runner_called_by_scheduler_only() -> None:
    status_store = StatusStore()
    runner = _ThreadRecordingRunner()
    worker = CameraWorker(
        camera_id="camera-1",
        facility_id="facility-1",
        frame_source=_FiniteSource(10, count=2),
        runners={"pose": runner},
        scheduler=Scheduler({"pose": 1}),
        status_store=status_store,
    )
    supervisor = EdgeWorkerSupervisor.from_workers((worker,), status_store=status_store)

    assert supervisor.run(max_frames_per_camera=1) == {"camera-1": 1}

    assert runner.values
    assert runner.thread_names
    assert all(not name.startswith("edge-capture") for name in runner.thread_names)


def _worker(camera_id: str, source: FrameSource, status_store: StatusStore) -> CameraWorker:
    return CameraWorker(
        camera_id=camera_id,
        facility_id="facility-1",
        frame_source=source,
        runners={},
        status_store=status_store,
    )


def _camera_status(status_store: StatusStore, camera_id: str) -> CameraStatus:
    status = status_store.get_status(camera_id)
    assert status is not None
    return status.status
