from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field

from contracts.frame import FrameSource
from runtime.camera_worker import (
    CameraWorker,
    DomainDetectorProtocol,
    EventSinkProtocol,
    ObservationBuilder,
    PublishEventSinkProtocol,
)
from runtime.incident_manager import IncidentManager
from runtime.scheduler import Scheduler
from runtime.status_store import StatusStore


@dataclass(frozen=True, slots=True)
class CameraConfig:
    camera_id: str
    facility_id: str
    frame_source: FrameSource
    runners: Mapping[str, object]
    domain_detectors: tuple[DomainDetectorProtocol, ...] = ()
    scheduler: Scheduler | None = None


WorkerFactory = Callable[[CameraConfig], CameraWorker]


@dataclass(slots=True)
class CameraManager:
    status_store: StatusStore
    incident_manager: IncidentManager
    event_sink: EventSinkProtocol | PublishEventSinkProtocol | None = None
    observation_builder: ObservationBuilder | None = None
    cameras: tuple[CameraConfig, ...] = ()
    workers: list[CameraWorker] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.workers and self.cameras:
            self.workers.extend(self._build_worker(config) for config in self.cameras)

    @classmethod
    def from_workers(
        cls,
        workers: Iterable[CameraWorker],
        *,
        status_store: StatusStore,
    ) -> CameraManager:
        return cls(
            status_store=status_store,
            incident_manager=IncidentManager(),
            workers=list(workers),
        )

    def add_camera(self, config: CameraConfig) -> CameraWorker:
        worker = self._build_worker(config)
        self.workers.append(worker)
        return worker

    def run(self, *, max_frames_per_camera: int | None = None) -> dict[str, int]:
        return {
            worker.camera_id: worker.run(max_frames=max_frames_per_camera)
            for worker in self.workers
        }

    def status_snapshot(self) -> dict[str, object]:
        return self.status_store.snapshot()

    def _build_worker(self, config: CameraConfig) -> CameraWorker:
        kwargs = {}
        if self.observation_builder is not None:
            kwargs["observation_builder"] = self.observation_builder
        return CameraWorker(
            camera_id=config.camera_id,
            facility_id=config.facility_id,
            frame_source=config.frame_source,
            runners=config.runners,
            scheduler=config.scheduler or Scheduler(),
            domain_detectors=config.domain_detectors,
            event_sink=self.event_sink,
            incident_manager=self.incident_manager,
            status_store=self.status_store,
            **kwargs,
        )
