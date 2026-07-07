from __future__ import annotations

from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass, field, replace
from typing import Protocol

from contracts.event import EventPayload, MutableEventPayload
from contracts.frame import Frame, FrameSource
from contracts.observation import (
    BedRegionCacheState,
    BedRegionDebugSnapshot,
    BoundingBox,
    DetectionResult,
    FrameObservation,
)
from contracts.runner import (
    BedBoxOutput,
    BedRunnerResult,
    BoxOutput,
    DetectionRunnerResult,
    PersonRunnerResult,
    PoseOutput,
    PoseRunnerResult,
    RunnerOutput,
    RunnerProtocol,
)
from contracts.tracker import TrackerProtocol
from events.schemas import build_audit_envelope
from worker.domains.bed_exit.schema import BedExitDebugSnapshot, DomainDebugSnapshot
from worker.fall_window_classifier import FallWindowClassifier
from worker.incident_manager import IncidentManager
from worker.overlay_renderer import OverlayRenderer
from worker.perception.observation_builder import build_frame_observation
from worker.perception.scene_state import SceneState
from worker.perception.tracker import GreedyIouTracker
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


class ClipRecorderProtocol(Protocol):
    def on_frame(self, camera_id: str, frame: Frame) -> bool: ...
    def on_event(
        self, camera_id: str, event_ref: str, event_type: str | None = None
    ) -> str | None: ...


class OverlaySinkProtocol(Protocol):
    def publish(
        self,
        camera_id: str,
        frame: Frame,
        observation: FrameObservation,
        debug_snapshots: tuple[DomainDebugSnapshot, ...],
    ) -> None: ...


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
    scene_state: SceneState | None = None
    overlay_sink: OverlaySinkProtocol | None = None
    tracker: TrackerProtocol = field(default_factory=GreedyIouTracker)
    snapshot_renderer: OverlayRenderer | None = None
    detector_version: str | None = None
    clip_recorder: ClipRecorderProtocol | None = None

    def __post_init__(self) -> None:
        if self.scene_state is None:
            self.scene_state = SceneState(self.camera_id)

    def _bind_source_liveness_callbacks(self) -> None:
        bind = getattr(self.frame_source, "set_liveness_callbacks", None)
        if not callable(bind):
            return
        bind(
            on_reconnecting=lambda reason: self.status_store.record_camera_reconnecting(
                self.camera_id,
                self.facility_id,
                "rtsp_reconnecting",
                detail=reason,
            ),
            on_recovered=lambda reason: self.status_store.record_camera_recovered(
                self.camera_id,
                self.facility_id,
                detail=reason,
            ),
        )

    def run(self, *, max_frames: int | None = None) -> int:
        processed = 0
        self.status_store.set_status(self.camera_id, self.facility_id, CameraStatus.STARTING)
        if self.scene_state is not None:
            self.scene_state.reset_for_new_source("source_iterator_start")
        # Source construction is the camera/source boundary: failure soft-degrades.
        try:
            self._bind_source_liveness_callbacks()
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
                if self.scene_state is not None:
                    self.scene_state.reset_for_new_source("source_failure")
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
        """Record a per-frame processing failure WITHOUT marking the camera offline."""
        category = exc.__class__.__name__
        self.status_store.record_ops_event(
            "frame.processing_error",
            self.camera_id,
            self.facility_id,
            category,
            detail=str(exc) or None,
        )

    def process_frame(self, frame: Frame) -> FrameObservation:
        self._record_clip_frame(frame)
        scheduled_tasks = self.scheduler.tasks_for_frame(frame.index)
        outputs = self._run_scheduled_runners(frame, scheduled_tasks)
        observation, bed_debug = self._build_observation(
            outputs,
            frame_index=frame.index,
            bed_scheduled="bed" in scheduled_tasks,
            bed_interval=self.scheduler.task_intervals.get("bed", 30),
        )
        observation = replace(observation, track_ids=self.tracker.update(observation.boxes))
        if self.fall_classifier is not None:
            observation = self.fall_classifier.classify(
                observation,
                frame.image.shape[1],
                frame.image.shape[0],
                self.tracker.live_ids,
            )
        if self.scene_state is not None:
            self.scene_state.update(
                observation,
                track_ids=tuple(
                    track_id
                    for track_id in observation.track_ids
                    if track_id is not None
                ),
            )
        debug_snapshots: list[DomainDebugSnapshot] = []
        for detector in self.domain_detectors:
            detector_result = detector.update(observation, time_sec=frame.time_sec)
            debug_snapshot = _domain_debug_snapshot(detector, frame.index, bed_debug)
            if debug_snapshot is not None:
                debug_snapshots.append(debug_snapshot)
            for event in _events_from_detector(detector_result):
                event = _with_camera_identity(
                    event,
                    self.camera_id,
                    self.facility_id,
                    frame.time_sec,
                )
                if self.incident_manager.admit(event, now_sec=frame.time_sec):
                    event["clip_id"] = self._record_clip_event(event)
                    self._attach_alert_metadata(event, frame, observation, tuple(debug_snapshots))
                    self._emit(event)
        if self.overlay_sink is not None:
            self.overlay_sink.publish(
                self.camera_id,
                frame,
                observation,
                tuple(debug_snapshots),
            )
        return observation
    def _attach_alert_metadata(
        self,
        event: MutableEventPayload,
        frame: Frame,
        observation: FrameObservation,
        debug_snapshots: tuple[DomainDebugSnapshot, ...],
    ) -> None:
        if event.get("event_type") not in {"fall", "bed-exit"}:
            return
        try:
            model = getattr(self.fall_classifier, "model", None)
            model_version = _str_or_none(getattr(model, "version", None))
            operating_threshold = _float_or_none(getattr(model, "operating_threshold", None))
            event["audit"] = build_audit_envelope(
                model_version=model_version,
                detector_version=self.detector_version,
                operating_threshold=operating_threshold,
            )
            if self.snapshot_renderer is not None:
                snapshot = self.snapshot_renderer.encode_jpeg_bounded(
                    frame,
                    observation,
                    debug_snapshots,
                )
                if snapshot is not None:
                    event["snapshot_jpeg"] = snapshot
        except Exception:  # noqa: BLE001 - audit/snapshot metadata must not block alert emit
            return


    def _run_scheduled_runners(
        self,
        frame: Frame,
        scheduled_tasks: tuple[str, ...] | None = None,
    ) -> dict[str, RunnerOutput]:
        outputs: dict[str, RunnerOutput] = {}
        tasks = (
            scheduled_tasks
            if scheduled_tasks is not None
            else self.scheduler.tasks_for_frame(frame.index)
        )
        for task in tasks:
            runner = self.runners.get(task)
            if runner is None:
                continue
            outputs[task] = _run_runner(runner, frame)
        return outputs

    def _build_observation(
        self,
        outputs: Mapping[str, RunnerOutput],
        *,
        frame_index: int | None = None,
        bed_scheduled: bool = False,
        bed_interval: int = 30,
    ) -> tuple[FrameObservation, BedRegionDebugSnapshot]:
        detections: DetectionResult | None = None
        poses: PoseOutput | None = None
        raw_boxes: BoxOutput | None = None
        bed_boxes: tuple[BoundingBox, ...] | None = None

        pose_output = outputs.get("pose")
        if isinstance(pose_output, DetectionRunnerResult):
            detections = pose_output.detections
        elif isinstance(pose_output, PoseRunnerResult):
            poses = pose_output.poses
            raw_boxes = pose_output.boxes

        person_output = outputs.get("person")
        if isinstance(person_output, DetectionRunnerResult):
            detections = person_output.detections
            raw_boxes = None
        elif isinstance(person_output, PersonRunnerResult):
            raw_boxes = person_output.boxes
        bed_output = outputs.get("bed")
        if isinstance(bed_output, BedRunnerResult):
            bed_boxes = _bed_boxes_from_output(bed_output.boxes)

        observation = self.observation_builder(
            detections=detections,
            raw_boxes=raw_boxes,
            poses=poses,
            bed_boxes=bed_boxes,
        )
        if frame_index is None or self.scene_state is None:
            debug = BedRegionDebugSnapshot(
                source=BedRegionCacheState.FRESH if bed_boxes else BedRegionCacheState.EMPTY,
                age_frames=0 if bed_boxes else None,
            )
            return observation, debug
        resolved, debug = self.scene_state.resolve_bed_regions(
            observation,
            frame_index=frame_index,
            bed_scheduled=bed_scheduled,
            bed_interval=bed_interval,
        )
        self._record_bed_debug(debug)
        return resolved, debug

    def _record_bed_debug(self, debug: BedRegionDebugSnapshot) -> None:
        self.status_store.record_ops_event(
            "bed_roi.cache",
            self.camera_id,
            self.facility_id,
            debug.source,
            detail=(
                f"age={debug.age_frames};empty_cycles={debug.empty_cycles}"
                + (f";reset={debug.reset_reason}" if debug.reset_reason else "")
            ),
        )

    def _record_clip_frame(self, frame: Frame) -> None:
        if self.clip_recorder is None:
            return
        try:
            self.clip_recorder.on_frame(self.camera_id, frame)
        except Exception:  # noqa: BLE001 - recorder backpressure/failure must not block inference
            return

    def _record_clip_event(self, event: EventPayload) -> str | None:
        if self.clip_recorder is None:
            return None
        try:
            return self.clip_recorder.on_event(
                self.camera_id, _event_ref(event), _event_type(event)
            )
        except Exception:  # noqa: BLE001 - recorder finalize failure must not block alert emit
            return None

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
        self.status_store.record_camera_reconnecting(
            self.camera_id,
            self.facility_id,
            category,
            detail=str(exc) or None,
        )


def _str_or_none(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _float_or_none(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def _domain_debug_snapshot(
    detector: DomainDetectorProtocol,
    frame_index: int,
    bed_debug: BedRegionDebugSnapshot,
) -> DomainDebugSnapshot | None:
    snapshot = getattr(detector, "last_debug_snapshot", None)
    if isinstance(snapshot, BedExitDebugSnapshot):
        return DomainDebugSnapshot(
            domain="bed_exit",
            bed_exit=replace(snapshot, frame_index=frame_index, bed_region=bed_debug),
        )
    return None


def _run_runner(runner: RunnerProtocol, frame: Frame) -> RunnerOutput:
    method = getattr(runner, "run", None)
    if callable(method):
        return method(frame.image)
    if callable(runner):
        return runner(frame.image)
    raise TypeError(f"runner {runner!r} has no supported invocation method")




def _bed_box_from_output(item: BedBoxOutput) -> BoundingBox:
    values = tuple(item)
    if len(values) == 6:
        x1, y1, x2, y2, confidence, polygon = values
        return BoundingBox(int(x1), int(y1), int(x2), int(y2), float(confidence), tuple(polygon))
    x1, y1, x2, y2, confidence = values[:5]
    return BoundingBox(int(x1), int(y1), int(x2), int(y2), float(confidence))


def _bed_boxes_from_output(output: Iterable[BedBoxOutput]) -> tuple[BoundingBox, ...]:
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


def _event_ref(event: EventPayload) -> str:
    for key in ("event_id", "identity", "detected_at", "time_sec"):
        value = event.get(key)
        if value is not None and str(value) != "":
            return str(value)
    return str(event.get("event_type", "event"))


def _event_type(event: EventPayload) -> str | None:
    value = event.get("event_type")
    if value is None or str(value) == "":
        return None
    return str(value)

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
