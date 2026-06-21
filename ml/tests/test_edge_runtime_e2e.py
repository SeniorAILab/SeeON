from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from contracts.event import Level
from contracts.frame import Frame
from contracts.observation import BoundingBox, DetectionLabel, DetectionResult, FrameObservation
from domains import DOMAIN_REGISTRY
from events.outbox import Outbox
from events.publisher import StubEventPublisher
from events.schemas import EmittedEvent, build_emitted_event
from runtime.camera_manager import CameraConfig
from runtime.edge_runtime import EdgeRuntime
from runtime.scheduler import Scheduler


@dataclass(slots=True)
class _FakeFrameSource:
    frames: int
    live: bool = False

    def __iter__(self):
        for index in range(self.frames):
            image = np.zeros((24, 24, 3), dtype=np.uint8)
            image[0, 0, 0] = index
            yield Frame(index=index, time_sec=float(index), image=image)


class _PoseRunner:
    def __init__(self, *, fall_frames: set[int]) -> None:
        self.fall_frames = fall_frames
        self.calls: list[int] = []

    def predict(self, image: np.ndarray) -> DetectionResult:
        frame_index = int(image[0, 0, 0])
        self.calls.append(frame_index)
        is_fall = frame_index in self.fall_frames
        person_box = (
            BoundingBox(4, 4, 14, 14, 0.95)
            if frame_index <= 1
            else BoundingBox(7, 7, 17, 17, 0.95)
        )
        return DetectionResult(
            boxes=(person_box,),
            labels=(DetectionLabel("FALL" if is_fall else "NORMAL", 0.9, is_fall),),
            keypoints=(((5, 5, 0.9),) * 17,),
        )


class _BedRunner:
    def __init__(self) -> None:
        self.calls: list[int] = []

    def detect_beds(self, image: np.ndarray) -> tuple[tuple[int, int, int, int, float], ...]:
        frame_index = int(image[0, 0, 0])
        self.calls.append(frame_index)
        return ((0, 0, 15, 15, 0.99),)


class _OutboxSink:
    def __init__(self, outbox: Outbox) -> None:
        self.outbox = outbox
        self.seen: list[EmittedEvent] = []

    def emit(self, event: object) -> None:
        emitted = _to_emitted(event)
        self.seen.append(emitted)
        self.outbox.buffer(emitted)


class _FallObservationDomain:
    def __init__(self) -> None:
        self._latch = DOMAIN_REGISTRY["fall"].factory()
        self.observations: list[FrameObservation] = []

    def update(
        self, observation: FrameObservation, time_sec: float | None = None
    ) -> dict[str, Any] | None:
        self.observations.append(observation)
        is_fall = any(label.is_fall for label in observation.labels)
        event = self._latch.update_event(is_fall, 0.0 if time_sec is None else time_sec)
        if event is None:
            return None
        return {
            "domain": "fall",
            "event_type": "fall",
            "lifecycle": "detected",
            "severity": Level.HIGH.value,
            "identity": "resident-1",
            "evidence": {
                "event_count": event.event_count,
                "onset_sec": event.onset_sec,
                "pose_count": len(observation.poses),
            },
        }


class _BedExitObservationDomain:
    def __init__(self) -> None:
        self._monitor = DOMAIN_REGISTRY["bed_exit"].factory()
        self._monitor._hold_frames = 1
        self._monitor._grace_frames = 0
        self._monitor._min_containment = 0.8
        self.observations: list[FrameObservation] = []

    def update(
        self, observation: FrameObservation, time_sec: float | None = None
    ) -> tuple[dict[str, Any], ...]:
        self.observations.append(observation)
        frame = self._monitor.update(
            bed_boxes=observation.bed_boxes,
            person_boxes=observation.boxes,
        )
        return tuple(
            {
                "domain": "bed_exit",
                "event_type": "bed-exit",
                "lifecycle": "detected",
                "severity": Level.MEDIUM.value,
                "identity": f"person-{event.person_id}-bed-{event.bed_id}",
                "evidence": {"person_id": event.person_id, "bed_id": event.bed_id},
            }
            for event in frame.events
        )


def _to_emitted(event: object) -> EmittedEvent:
    assert isinstance(event, dict)
    return build_emitted_event(
        facility=str(event["facility_id"]),
        camera=str(event["camera_id"]),
        domain=str(event["domain"]),
        event_type=str(event["event_type"]),
        lifecycle=event.get("lifecycle", "detected"),
        severity=str(event["severity"]),
        evidence=dict(event.get("evidence", {})),
    )


def _camera(
    camera_id: str, *, frames: int, fall_frames: set[int], live: bool = False
) -> tuple[
    CameraConfig,
    _PoseRunner,
    _BedRunner,
    _FallObservationDomain,
    _BedExitObservationDomain,
]:
    pose = _PoseRunner(fall_frames=fall_frames)
    bed = _BedRunner()
    fall = _FallObservationDomain()
    bed_exit = _BedExitObservationDomain()
    config = CameraConfig(
        camera_id=camera_id,
        facility_id="facility-a",
        frame_source=_FakeFrameSource(frames=frames, live=live),
        runners={"pose": pose, "bed": bed},
        scheduler=Scheduler({"pose": 1, "bed": 1}),
        domain_detectors=(fall, bed_exit),
    )
    return config, pose, bed, fall, bed_exit


def test_edge_runtime_e2e_publishes_events_and_suppresses_cooldown_duplicate() -> None:
    publisher = StubEventPublisher()
    outbox = Outbox(publisher=publisher)
    sink = _OutboxSink(outbox)
    cam_a, pose_a, bed_a, fall_a, bed_exit_a = _camera(
        "camera-a", frames=6, fall_frames={1, 3}
    )
    cam_b, pose_b, bed_b, fall_b, bed_exit_b = _camera(
        "camera-b", frames=6, fall_frames={1}
    )

    runtime = EdgeRuntime(event_sink=sink, camera_configs=(cam_a, cam_b))

    assert runtime.run(max_frames_per_camera=6) == {"camera-a": 6, "camera-b": 6}
    assert outbox.pending_count == 4
    assert outbox.flush() == 4

    assert pose_a.calls == [0, 1, 2, 3, 4, 5]
    assert bed_a.calls == [0, 1, 2, 3, 4, 5]
    assert pose_b.calls == [0, 1, 2, 3, 4, 5]
    assert bed_b.calls == [0, 1, 2, 3, 4, 5]
    cam_a_observations = fall_a.observations + bed_exit_a.observations
    cam_b_observations = fall_b.observations + bed_exit_b.observations
    assert all(isinstance(obs, FrameObservation) for obs in cam_a_observations)
    assert all(isinstance(obs, FrameObservation) for obs in cam_b_observations)

    payloads = [event.as_dict() for event in publisher.published]
    assert payloads == [event.as_dict() for event in sink.seen]
    assert {(event["camera"], event["domain"], event["event_type"]) for event in payloads} == {
        ("camera-a", "fall", "fall"),
        ("camera-a", "bed_exit", "bed-exit"),
        ("camera-b", "fall", "fall"),
        ("camera-b", "bed_exit", "bed-exit"),
    }
    assert [event["camera"] for event in payloads].count("camera-a") == 2
    assert [event["camera"] for event in payloads].count("camera-b") == 2
    cam_a_falls = [
        event
        for event in payloads
        if event["camera"] == "camera-a" and event["domain"] == "fall"
    ]
    assert cam_a_falls == [
        {
            "facility": "facility-a",
            "camera": "camera-a",
            "domain": "fall",
            "event_type": "fall",
            "lifecycle": "detected",
            "severity": "HIGH",
            "front_event_type": "FALL_RISK",
            "evidence": {"event_count": 1, "onset_sec": 1.0, "pose_count": 1},
        }
    ]


def test_edge_runtime_fake_webcam_live_source_uses_same_runtime_path() -> None:
    publisher = StubEventPublisher()
    outbox = Outbox(publisher=publisher)
    sink = _OutboxSink(outbox)
    cam, pose, bed, fall, bed_exit = _camera("webcam-0", frames=6, fall_frames={1}, live=True)

    runtime = EdgeRuntime(event_sink=sink, camera_configs=(cam,))

    assert runtime.run(max_frames_per_camera=6) == {"webcam-0": 6}
    assert outbox.flush() == 2
    assert pose.calls == [0, 1, 2, 3, 4, 5]
    assert bed.calls == [0, 1, 2, 3, 4, 5]
    assert len(fall.observations) == 6
    assert len(bed_exit.observations) == 6
    assert [event.camera for event in publisher.published] == ["webcam-0", "webcam-0"]
    assert {event.domain for event in publisher.published} == {"fall", "bed_exit"}
