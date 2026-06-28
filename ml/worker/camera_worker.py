from __future__ import annotations

from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Protocol

from contracts.event import EventPayload, MutableEventPayload
from contracts.frame import Frame, FrameSource
from contracts.observation import BoundingBox, DetectionResult, FrameObservation
from contracts.runner import BedBoxOutput, BoxOutput, PoseOutput, RunnerOutput, RunnerProtocol
from worker.fall_window_classifier import FallWindowClassifier
from worker.incident_manager import IncidentManager
from worker.perception.observation_builder import build_frame_observation
from worker.scheduler import Scheduler
from worker.status_store import CameraStatus, StatusStore


class DomainDetectorProtocol(Protocol):
    def update(
        self, observation: FrameObservation, time_sec: float | None = None
    ) -> EventPayload | Iterable[EventPayload] | None: ...


class EventSinkProtocol(Protocol):
    def emit(self, event: EventPayload) -> None: ...


class PublishEventSinkProtocol(Protocol):
    def publish(self, event: EventPayload) -> None: ...


ObservationBuilder = Callable[..., FrameObservation]


@dataclass(slots=True)
class CameraWorker:
    camera_id: str
    facility_id: str
    frame_source: FrameSource
    runners: Mapping[str, RunnerProtocol]
    observation_builder: ObservationBuilder = build_frame_observation
    scheduler: Scheduler = field(default_factory=Scheduler)
    domain_detectors: tuple[DomainDetectorProtocol, ...] = ()
    event_sink: EventSinkProtocol | PublishEventSinkProtocol | None = None
    incident_manager: IncidentManager = field(default_factory=IncidentManager)
    status_store: StatusStore = field(default_factory=StatusStore)
    fall_classifier: FallWindowClassifier | None = None

    def run(self, *, max_frames: int | None = None) -> int:
        processed = 0
        self.status_store.set_status(self.camera_id, self.facility_id, CameraStatus.STARTING)
        # Source construction is the camera/source boundary: failure soft-degrades.
        try:
            frame_iter = iter(self.frame_source)
        except Exception as exc:  # noqa: BLE001 - source construction soft-degrades worker
            self._mark_source_failure(exc)
            return processed
        self.status_store.set_status(self.camera_id, self.facility_id, CameraStatus.READY)
        while max_frames is None or processed < max_frames:
            try:
                frame = next(frame_iter)
            except StopIteration:
                break
            except Exception as exc:  # noqa: BLE001 - source iteration soft-degrades worker
                self._mark_source_failure(exc)
                continue
            # Per-frame processing (runners/perception/domains/incident/sink) is a
            # distinct failure domain: it MUST NOT be misreported as camera.offline.
            try:
                self.process_frame(frame)
            except Exception as exc:  # noqa: BLE001 - processing error is distinct from source failure
                self._mark_processing_failure(exc)
            processed += 1
        return processed

    def _mark_processing_failure(self, exc: Exception) -> None:
        """Record a per-frame processing failure WITHOUT marking the camera offline.

        Runner/perception/domain/incident/sink errors are processing-domain faults,
        not source faults; they surface as a distinct ops event preserving the true
        failure category while the camera/source stays READY.
        """
        category = exc.__class__.__name__
        self.status_store.record_ops_event(
            "frame.processing_error",
            self.camera_id,
            self.facility_id,
            category,
            detail=str(exc) or None,
        )

    def process_frame(self, frame: Frame) -> FrameObservation:
        outputs = self._run_scheduled_runners(frame)
        observation = self._build_observation(outputs)
        if self.fall_classifier is not None:
            observation = self.fall_classifier.classify(
                observation,
                frame.image.shape[1],
                frame.image.shape[0],
            )
        for detector in self.domain_detectors:
            detector_result = detector.update(observation, time_sec=frame.time_sec)
            for event in _events_from_detector(detector_result):
                event = _with_camera_identity(
                    event,
                    self.camera_id,
                    self.facility_id,
                    frame.time_sec,
                )
                if self.incident_manager.admit(event, now_sec=frame.time_sec):
                    self._emit(event)
        return observation

    def _run_scheduled_runners(self, frame: Frame) -> dict[str, RunnerOutput]:
        outputs: dict[str, RunnerOutput] = {}
        for task in self.scheduler.tasks_for_frame(frame.index):
            runner = self.runners.get(task)
            if runner is None:
                continue
            outputs[task] = _run_runner(runner, frame)
        return outputs

    def _build_observation(self, outputs: Mapping[str, RunnerOutput]) -> FrameObservation:
        detections: DetectionResult | None = None
        poses: PoseOutput | None = None
        raw_boxes: BoxOutput | None = None
        bed_boxes: tuple[BoundingBox, ...] | None = None

        pose_output = outputs.get("pose")
        if isinstance(pose_output, DetectionResult):
            detections = pose_output
        elif _is_pose_box_pair(pose_output):
            poses, raw_boxes = pose_output

        person_output = outputs.get("person")
        if isinstance(person_output, DetectionResult):
            detections = person_output
            raw_boxes = None
        elif person_output is not None and not _is_pose_box_pair(person_output):
            raw_boxes = person_output
        bed_output = outputs.get("bed")
        if bed_output is not None:
            bed_boxes = _bed_boxes_from_output(bed_output)

        return self.observation_builder(
            detections=detections,
            raw_boxes=raw_boxes,
            poses=poses,
            bed_boxes=bed_boxes,
        )

    def _emit(self, event: EventPayload) -> None:
        if self.event_sink is None:
            return
        emit = getattr(self.event_sink, "emit", None)
        if callable(emit):
            emit(event)
            return
        publish = getattr(self.event_sink, "publish", None)
        if callable(publish):
            publish(event)

    def _mark_source_failure(self, exc: Exception) -> None:
        category = exc.__class__.__name__
        self.status_store.set_status(
            self.camera_id,
            self.facility_id,
            CameraStatus.DEGRADED,
            error_category=category,
        )
        self.status_store.record_ops_event(
            "camera.offline",
            self.camera_id,
            self.facility_id,
            category,
            detail=str(exc) or None,
        )


def _run_runner(runner: RunnerProtocol, frame: Frame) -> RunnerOutput:
    for method_name in ("predict_full", "detect_beds", "predict", "run"):
        method = getattr(runner, method_name, None)
        if method is not None:
            return method(frame.image)
    if callable(runner):
        return runner(frame.image)
    raise TypeError(f"runner {runner!r} has no supported invocation method")


def _is_pose_box_pair(value: RunnerOutput | None) -> bool:
    if not isinstance(value, tuple) or len(value) != 2:
        return False
    poses, raw_boxes = value
    return _is_nested_sequence(poses) and _is_nested_sequence(raw_boxes)


def _is_nested_sequence(
    value: RunnerOutput | BedBoxOutput | int | float | str | bytes | None,
) -> bool:
    if not isinstance(value, Sequence) or isinstance(value, str | bytes):
        return False
    if len(value) == 0:
        return True
    first = value[0]
    return isinstance(first, Sequence) and not isinstance(first, str | bytes)


def _bed_box_from_output(item: BedBoxOutput) -> BoundingBox:
    values = tuple(item)
    if len(values) == 6:
        x1, y1, x2, y2, confidence, polygon = values
        return BoundingBox(int(x1), int(y1), int(x2), int(y2), float(confidence), tuple(polygon))
    x1, y1, x2, y2, confidence = values[:5]
    return BoundingBox(int(x1), int(y1), int(x2), int(y2), float(confidence))


def _bed_boxes_from_output(output: RunnerOutput) -> tuple[BoundingBox, ...]:
    if isinstance(output, DetectionResult):
        return ()
    if _is_pose_box_pair(output):
        return ()
    return tuple(_bed_box_from_output(item) for item in output)


def _events_from_detector(
    result: EventPayload | Iterable[EventPayload] | None,
) -> Iterator[EventPayload]:
    if result is None:
        return iter(())
    if isinstance(result, Mapping):
        return iter((result,))
    if isinstance(result, Iterable) and not isinstance(result, str | bytes):
        return iter(result)
    return iter((result,))


def _with_camera_identity(
    event: EventPayload,
    camera_id: str,
    facility_id: str,
    time_sec: float,
) -> EventPayload:
    enriched: MutableEventPayload = dict(event)
    enriched.setdefault("camera_id", camera_id)
    enriched.setdefault("facility_id", facility_id)
    enriched.setdefault("time_sec", time_sec)
    return enriched
