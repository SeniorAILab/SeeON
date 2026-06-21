from __future__ import annotations

from dataclasses import dataclass, field

from runtime.camera_manager import CameraConfig, CameraManager
from runtime.camera_worker import EventSinkProtocol, ObservationBuilder, PublishEventSinkProtocol
from runtime.incident_manager import IncidentManager
from runtime.status_store import StatusStore


@dataclass(slots=True)
class EdgeRuntime:
    event_sink: EventSinkProtocol | PublishEventSinkProtocol | None = None
    camera_configs: tuple[CameraConfig, ...] = ()
    observation_builder: ObservationBuilder | None = None
    status_store: StatusStore = field(default_factory=StatusStore)
    incident_manager: IncidentManager = field(default_factory=IncidentManager)
    camera_manager: CameraManager = field(init=False)

    def __post_init__(self) -> None:
        self.camera_manager = CameraManager(
            status_store=self.status_store,
            incident_manager=self.incident_manager,
            event_sink=self.event_sink,
            observation_builder=self.observation_builder,
            cameras=self.camera_configs,
        )

    def run(self, *, max_frames_per_camera: int | None = None) -> dict[str, int]:
        return self.camera_manager.run(max_frames_per_camera=max_frames_per_camera)

    def status_snapshot(self) -> dict[str, object]:
        return self.status_store.snapshot()
