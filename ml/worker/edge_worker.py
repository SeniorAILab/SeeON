from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime

from contracts.event import EventPayload
from contracts.runner import RunnerProtocol
from domains import DOMAIN_REGISTRY
from runners.device import select_device
from runners.registry import DEFAULT_REGISTRY, ModelRegistry
from runners.torch_lstm_fall import LstmFallRunner, ModelLoadError
from sources.rtsp import RTSPSource
from worker.camera_worker import CameraWorker, DomainDetectorProtocol
from worker.edge_worker_config import (
    CameraRuntimeConfig,
    EdgeWorkerConfig,
    EdgeWorkerConfigError,
    load_edge_worker_config,
    resolve_config_path,
)
from worker.edge_worker_supervisor import EdgeWorkerSupervisor
from worker.fall_window_classifier import FallModelProtocol, FallWindowClassifier
from worker.scheduler import Scheduler
from worker.status_store import StatusStore


@dataclass(frozen=True, slots=True)
class _Options:
    config_path: str | None
    check_config: bool
    max_frames_per_camera: int | None
    heartbeat_on_start: bool


@dataclass(frozen=True, slots=True)
class _RunnerBundle:
    pose: RunnerProtocol
    person: RunnerProtocol
    bed: RunnerProtocol

    def as_mapping(self) -> Mapping[str, RunnerProtocol]:
        return {"pose": self.pose, "person": self.person, "bed": self.bed}


@dataclass(frozen=True, slots=True)
class _WorkerResources:
    clients: Mapping[str, _RelayClient]
    runners: _RunnerBundle
    fall_model: FallModelProtocol
    status_store: StatusStore
    config: EdgeWorkerConfig


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    try:
        options = _parse_args(args)
        config = load_edge_worker_config(resolve_config_path(options.config_path))
    except EdgeWorkerConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if options.check_config:
        print(json.dumps({"ok": True, "cameras": len(config.cameras)}, separators=(",", ":")))
        return 0
    status_store = StatusStore()
    try:
        supervisor = _build_supervisor(config, status_store)
    except (ModelLoadError, TypeError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    result = supervisor.run(
        max_frames_per_camera=options.max_frames_per_camera,
        heartbeat_on_start=options.heartbeat_on_start,
    )
    print(
        json.dumps({"processed": result, "status": status_store.snapshot()}, separators=(",", ":"))
    )
    if options.max_frames_per_camera is not None and any(
        count < options.max_frames_per_camera for count in result.values()
    ):
        return 1
    return 0


def _parse_args(args: list[str]) -> _Options:
    config_path: str | None = None
    check_config = False
    heartbeat_on_start = False
    max_frames_per_camera: int | None = None
    index = 0
    while index < len(args):
        arg = args[index]
        if arg == "--config":
            index += 1
            if index >= len(args):
                raise EdgeWorkerConfigError("--config requires a path")
            config_path = args[index]
        elif arg == "--check-config":
            check_config = True
        elif arg == "--heartbeat-on-start":
            heartbeat_on_start = True
        elif arg == "--max-frames-per-camera":
            index += 1
            if index >= len(args):
                raise EdgeWorkerConfigError("--max-frames-per-camera requires a value")
            max_frames_per_camera = _positive_int(args[index], "--max-frames-per-camera")
        else:
            raise EdgeWorkerConfigError(f"unknown argument: {arg}")
        index += 1
    return _Options(
        config_path=config_path,
        check_config=check_config,
        max_frames_per_camera=max_frames_per_camera,
        heartbeat_on_start=heartbeat_on_start,
    )


def _positive_int(raw: str, name: str) -> int:
    try:
        value = int(raw)
    except ValueError as exc:
        raise EdgeWorkerConfigError(f"{name} must be an integer") from exc
    if value <= 0:
        raise EdgeWorkerConfigError(f"{name} must be > 0")
    return value


def _build_supervisor(
    config: EdgeWorkerConfig,
    status_store: StatusStore,
    *,
    registry: ModelRegistry | None = None,
) -> EdgeWorkerSupervisor:
    model_registry = DEFAULT_REGISTRY if registry is None else registry
    device = select_device()
    clients = {camera.camera_id: _relay_client(config, camera) for camera in config.cameras}
    resources = _WorkerResources(
        clients=clients,
        runners=_build_runner_bundle(model_registry, device=device),
        fall_model=_build_fall_model(config, model_registry),
        status_store=status_store,
        config=config,
    )
    workers = tuple(_worker(camera, resources) for camera in config.cameras)
    interval = min(camera.heartbeat_interval_sec for camera in config.cameras)
    return EdgeWorkerSupervisor.from_workers(
        workers,
        status_store=status_store,
        heartbeat_sinks=clients,
        heartbeat_interval_sec=interval,
    )


def _build_runner_bundle(registry: ModelRegistry, *, device: str) -> _RunnerBundle:
    return _RunnerBundle(
        pose=registry.create("pose", device=device),
        person=registry.create("person", device=device),
        bed=registry.create("bed", device=device),
    )


def _build_fall_model(config: EdgeWorkerConfig, registry: ModelRegistry) -> FallModelProtocol:
    fall_config = config.models.fall
    if fall_config is not None:
        return LstmFallRunner.from_artifact_dir(fall_config.artifact_dir)
    model = registry.create("fall")
    return _require_fall_model(model)


def _require_fall_model(model: RunnerProtocol) -> FallModelProtocol:
    if not isinstance(model, FallModelProtocol):
        raise TypeError("fall model must expose operating_threshold and predict")
    return model


def _worker(camera: CameraRuntimeConfig, resources: _WorkerResources) -> CameraWorker:
    runtime = resources.config.runtime
    return CameraWorker(
        camera_id=camera.camera_id,
        facility_id=camera.facility_id,
        frame_source=RTSPSource(
            camera.rtsp_url,
            max_failures=runtime.max_failures,
            open_timeout_ms=runtime.open_timeout_ms,
            read_timeout_ms=runtime.read_timeout_ms,
        ),
        runners=resources.runners.as_mapping(),
        scheduler=Scheduler(
            {
                "pose": camera.frame_stride,
                "person": camera.frame_stride,
                "bed": max(30, camera.frame_stride),
            }
        ),
        domain_detectors=_domain_detectors(resources.config),
        event_sink=resources.clients[camera.camera_id],
        status_store=resources.status_store,
        fall_classifier=FallWindowClassifier(resources.fall_model),
    )


def _domain_config_payload(config: EdgeWorkerConfig, name: str) -> dict[str, object] | None:
    domain_config = config.domains.domain_config(name)
    if domain_config is None:
        return None
    return domain_config.model_dump(exclude={"enabled"}, exclude_none=True)


def _domain_detectors(config: EdgeWorkerConfig) -> tuple[DomainDetectorProtocol, ...]:
    enabled = config.enabled_domains
    return tuple(
        registration.factory(_domain_config_payload(config, name))
        for name, registration in DOMAIN_REGISTRY.items()
        if (registration.enabled if enabled is None else name in enabled)
    )


@dataclass(slots=True)
class _RelayClient:
    alert_url: str
    heartbeat_url: str
    camera_id: str
    facility_id: str
    resident_id: str | None
    relay_token: str
    timeout_sec: float = 0.5
    failure_count: int = 0

    def __post_init__(self) -> None:
        self.alert_url = _parse_http_url(self.alert_url)
        self.heartbeat_url = _parse_http_url(self.heartbeat_url)
        self.relay_token = _required(self.relay_token, "relay_token")

    def send_heartbeat(self) -> bool:
        return self._post(
            self.heartbeat_url,
            {"camera_id": self.camera_id, "facility_id": self.facility_id},
        )

    def emit(self, event: EventPayload) -> None:
        event_type = str(event.get("event_type", ""))
        if event_type not in {"fall", "bed-exit"}:
            return
        payload: dict[str, object] = {
            "event_type": "bed-exit" if event_type == "bed-exit" else "fall",
            "probability": _event_probability(event),
            "detected_at": str(event.get("detected_at", "")) or _utc_timestamp(),
            "camera_id": self.camera_id,
            "facility_id": self.facility_id,
            "evidence": dict(event),
        }
        if self.resident_id is not None:
            payload["resident_id"] = self.resident_id
        self._post(self.alert_url, payload)

    def _post(self, url: str, payload: dict[str, object]) -> bool:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-Edge-Relay-Token": self.relay_token,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_sec) as response:
                response.read()
        except (TimeoutError, OSError, urllib.error.URLError, urllib.error.HTTPError):
            self.failure_count += 1
            return False
        return True


def _relay_client(config: EdgeWorkerConfig, camera: CameraRuntimeConfig) -> _RelayClient:
    return _RelayClient(
        alert_url=config.relay_alert_url,
        heartbeat_url=config.relay_heartbeat_url,
        camera_id=camera.camera_id,
        facility_id=camera.facility_id,
        resident_id=camera.resident_id,
        relay_token=config.relay.token.get_secret_value(),
    )


def _parse_http_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.netloc == "":
        raise ValueError(f"relay URL must be absolute HTTP(S): {url}")
    return url


def _required(value: str, name: str) -> str:
    stripped = value.strip()
    if stripped == "":
        raise ValueError(f"{name} must be set")
    return stripped


def _event_probability(event: EventPayload) -> float:
    value = event.get("probability", event.get("confidence", 1.0))
    if isinstance(value, int | float):
        return min(1.0, max(0.0, float(value)))
    return 1.0


def _utc_timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ("main",)
