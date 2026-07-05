from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from contracts.frame import Frame
from contracts.observation import FrameObservation
from contracts.runner import pose_result
from contracts.tracker import TrackerProtocol
from worker import edge_worker
from worker.camera_worker import CameraWorker
from worker.edge_worker_config import CameraRuntimeConfig, EdgeWorkerConfig
from worker.perception.tracker import GreedyIouTracker
from worker.scheduler import Scheduler
from worker.status_store import StatusStore


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
    def run(self, image: np.ndarray):
        del image
        return pose_result((), ())



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

    assert registry.created == {"pose": 1, "person": 0, "bed": 1, "fall": 1}

    assert isinstance(GreedyIouTracker(), TrackerProtocol)
    assert len({id(classifier) for classifier in classifiers}) == 2
    assert len({id(loop.worker.tracker) for loop in supervisor.loops}) == 2
    assert all(
        not hasattr(classifier, "tracker")
        for classifier in classifiers
        if classifier is not None
    )
    assert all(not hasattr(detector, "_tracker") for detector in detectors)
    assert len({id(detector) for detector in detectors}) == 2
    assert {id(classifier.model) for classifier in classifiers if classifier is not None} == {
        id(registry.fall_model)
    }

def test_camera_worker_stamps_one_shared_tracker_id_for_fall_and_bed_exit() -> None:
    box = (1, 2, 21, 42, 0.9)
    observed: dict[str, tuple[int | None, ...]] = {}

    class _Tracker:
        @property
        def live_ids(self) -> frozenset[int]:
            return frozenset({42})

        def update(self, boxes):
            assert len(boxes) == 1
            return (42,)

    class _PoseRunner:
        calls = 0

        def run(self, image: np.ndarray):
            del image
            self.calls += 1
            keypoints = tuple((1.0, 2.0, 0.9) for _ in range(17))
            return pose_result((keypoints,), (box,))

    class _FallConsumer:
        def classify(
            self,
            observation: FrameObservation,
            frame_w: int,
            frame_h: int,
            live_track_ids: frozenset[int] | None = None,
        ) -> FrameObservation:
            del frame_w, frame_h
            observed["fall"] = observation.track_ids
            assert live_track_ids == frozenset({42})
            return observation

    class _BedExitConsumer:
        last_debug_snapshot = None

        def update(self, observation: FrameObservation, time_sec: float | None = None):
            del time_sec
            observed["bed_exit"] = observation.track_ids
            return None

    pose_runner = _PoseRunner()

    worker = CameraWorker(
        camera_id="camera-1",
        facility_id="facility-1",
        frame_source=(),
        runners={"pose": pose_runner},

        scheduler=Scheduler({"pose": 1}),

        fall_classifier=_FallConsumer(),
        domain_detectors=(_BedExitConsumer(),),
        tracker=_Tracker(),
    )

    observation = worker.process_frame(
        Frame(index=0, time_sec=1.0, image=np.zeros((10, 10, 3), dtype=np.uint8))
    )

    assert observation.track_ids == (42,)
    assert observed == {"fall": (42,), "bed_exit": (42,)}
    assert observation.poses == (tuple((1.0, 2.0, 0.9) for _ in range(17)),)
    assert pose_runner.calls == 1


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
