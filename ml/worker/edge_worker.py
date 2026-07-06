from __future__ import annotations

import base64
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime

from contracts.event import EventPayload
from contracts.runner import RunnerProtocol
from contracts.worker_config import CONFIG_VERSION_KEY, PulledWorkerConfig
from worker.camera_worker import CameraWorker, DomainDetectorProtocol
from worker.config_pull import load_edge_worker_config_from_relay, pull_worker_config
from worker.config_resolver import resolve_night_window
from worker.domains import DOMAIN_REGISTRY
from worker.domains.bed_exit.detector import BedExitMonitor, NightWindow
from worker.edge_worker_config import (
    EDGE_CAMERA_CONFIG_ENV,
    CameraRuntimeConfig,
    EdgeWorkerConfig,
    EdgeWorkerConfigError,
    load_edge_worker_config,
    resolve_config_path,
)
from worker.edge_worker_supervisor import EdgeWorkerSupervisor
from worker.fall_window_classifier import FallModelProtocol, FallWindowClassifier
from worker.mjpeg_server import (
    MjpegServer,
    OverlayFrameBuffer,
    OverlayPublisher,
    dev_mjpeg_enabled,
    dev_mjpeg_host,
    dev_mjpeg_port,
)
from worker.overlay_renderer import OverlayRenderer
from worker.perception.tracker import GreedyIouTracker
from worker.runners.device import select_device
from worker.runners.registry import DEFAULT_REGISTRY, ModelRegistry
from worker.runners.torch_lstm_fall import LstmFallRunner, ModelLoadError
from worker.runners.warmup import warmup_runner
from worker.scheduler import Scheduler
from worker.sources.rtsp import RTSPSource
from worker.sources.rtsp_backend import OpenCVRTSPBackend, RTSPBackend
from worker.status_store import StatusStore

# Phase-1 audit metadata identifies this worker-owned domain detector bundle.
DETECTOR_VERSION = "worker-domain-detectors-v1"
@dataclass(frozen=True, slots=True)
class _Options:
    config_path: str | None
    check_config: bool
    max_frames_per_camera: int | None
    heartbeat_on_start: bool


@dataclass(frozen=True, slots=True)
class _StartupConfig:
    config: EdgeWorkerConfig
    registry_version: int
    source: str
    yaml_config: EdgeWorkerConfig | None = None
    pulled: PulledWorkerConfig | None = None


@dataclass(frozen=True, slots=True)
class _RunnerBundle:
    pose: RunnerProtocol
    bed: RunnerProtocol

    def as_mapping(self) -> Mapping[str, RunnerProtocol]:
        return {"pose": self.pose, "bed": self.bed}


@dataclass(frozen=True, slots=True)
class _WorkerResources:
    clients: Mapping[str, _RelayClient]
    runners: _RunnerBundle
    fall_model: FallModelProtocol
    status_store: StatusStore
    config: EdgeWorkerConfig
    overlay_publisher: OverlayPublisher | None = None
    stop_event: threading.Event | None = None


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    try:
        options = _parse_args(args)
        startup = _load_startup_config(options)
    except EdgeWorkerConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    effective_config = startup.config
    config_version = startup.registry_version
    boot_registry_version = startup.registry_version
    if options.check_config:
        print(
            json.dumps(
                {"ok": True, "cameras": len(effective_config.cameras)}, separators=(",", ":")
            )
        )
        return 0
    relay_url = os.environ.get("RELAY_URL", str(effective_config.relay.url))
    relay_token = os.environ.get("RELAY_TOKEN")
    print(f"worker config source: {startup.source}", file=sys.stderr)

    status_store = StatusStore()
    mjpeg_server: MjpegServer | None = None
    if effective_config.dev_mjpeg.enabled or dev_mjpeg_enabled():
        overlay_buffer = OverlayFrameBuffer()
        for camera in effective_config.cameras:
            overlay_buffer.register_camera(camera.camera_id)
        mjpeg_server = MjpegServer(
            overlay_buffer,
            host=(
                effective_config.dev_mjpeg.host
                if effective_config.dev_mjpeg.enabled
                else dev_mjpeg_host()
            ),
            port=(
                effective_config.dev_mjpeg.port
                if effective_config.dev_mjpeg.enabled
                else dev_mjpeg_port()
            ),
        )
        mjpeg_server.start()
        overlay_publisher = OverlayPublisher(overlay_buffer)
    else:
        overlay_publisher = None
    try:
        supervisor = _build_supervisor(
            effective_config,
            status_store,
            overlay_publisher=overlay_publisher,
            config_version=config_version,
            restart_check=_restart_check(relay_url, relay_token, boot_registry_version),
            yaml_config=startup.yaml_config,
            pulled=startup.pulled,
            relay_url=relay_url,
            relay_token=relay_token,
        )
    except (ModelLoadError, TypeError) as exc:
        if mjpeg_server is not None:
            mjpeg_server.stop()
        print(str(exc), file=sys.stderr)
        return 2
    try:
        result = supervisor.run(
            max_frames_per_camera=options.max_frames_per_camera,
            heartbeat_on_start=options.heartbeat_on_start,
        )
    finally:
        if mjpeg_server is not None:
            mjpeg_server.stop()
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


def _load_startup_config(options: _Options) -> _StartupConfig:
    if _yaml_config_requested(options):
        config = load_edge_worker_config(resolve_config_path(options.config_path))
        print(
            f"{EDGE_CAMERA_CONFIG_ENV} YAML bootstrap is configured; "
            "worker config pull is bypassed",
            file=sys.stderr,
        )
        return _StartupConfig(
            config=config, registry_version=0, source="yaml", yaml_config=config
        )

    relay_url = _required_env("RELAY_URL")
    relay_token = os.environ.get("RELAY_TOKEN")
    loaded = load_edge_worker_config_from_relay(relay_url, relay_token)
    if loaded is None:
        raise EdgeWorkerConfigError("worker config pull failed and LKG is unavailable")
    config, registry_version, source = loaded
    return _StartupConfig(config=config, registry_version=registry_version, source=source)


def _yaml_config_requested(options: _Options) -> bool:
    if options.config_path is not None:
        return True
    return bool(os.environ.get(EDGE_CAMERA_CONFIG_ENV, "").strip())


def _required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value == "":
        raise EdgeWorkerConfigError(f"{name} is required when {EDGE_CAMERA_CONFIG_ENV} is unset")
    return value


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
    overlay_publisher: OverlayPublisher | None = None,
    config_version: int = 0,
    restart_check: Callable[[], bool] | None = None,
    yaml_config: EdgeWorkerConfig | None = None,
    pulled: PulledWorkerConfig | None = None,
    relay_url: str | None = None,
    relay_token: str | None = None,
) -> EdgeWorkerSupervisor:
    model_registry = DEFAULT_REGISTRY if registry is None else registry
    device = select_device()
    clients = {
        camera.camera_id: _relay_client(config, camera, config_version)
        for camera in config.cameras
    }
    stop_event = threading.Event()
    resources = _WorkerResources(
        clients=clients,
        runners=_build_runner_bundle(model_registry, device=device),
        fall_model=_build_fall_model(config, model_registry),
        status_store=status_store,
        config=config,
        overlay_publisher=overlay_publisher,
        stop_event=stop_event,
    )
    workers_and_detectors = tuple(
        _worker_with_detectors(camera, resources) for camera in config.cameras
    )
    workers = tuple(worker for worker, _detectors in workers_and_detectors)
    bed_exit_monitors = tuple(
        detector
        for _worker, detectors in workers_and_detectors
        for detector in detectors
        if isinstance(detector, BedExitMonitor)
    )
    night_window_source = config if yaml_config is None else yaml_config
    night_window = resolve_night_window(night_window_source, pulled)
    for monitor in bed_exit_monitors:
        monitor.update_night_window(night_window)
    interval = min(camera.heartbeat_interval_sec for camera in config.cameras)
    config_refresh = None
    if relay_url is not None:
        config_refresh = _config_refresh(
            relay_url,
            relay_token,
            bed_exit_monitors,
            night_window_source,
            night_window,
        )
    return EdgeWorkerSupervisor.from_workers(
        workers,
        status_store=status_store,
        heartbeat_sinks=clients,
        heartbeat_interval_sec=interval,
        stop_event=stop_event,
        restart_check=restart_check,
        config_refresh=config_refresh,
    )


def _build_runner_bundle(registry: ModelRegistry, *, device: str) -> _RunnerBundle:
    return _RunnerBundle(
        pose=warmup_runner(registry.create("pose", device=device)),
        bed=warmup_runner(registry.create("bed", device=device)),
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


def _decode_backend(camera: CameraRuntimeConfig) -> RTSPBackend:
    if camera.decode_backend in (None, "opencv"):
        return OpenCVRTSPBackend()
    raise ValueError(f"unsupported decode_backend: {camera.decode_backend}")


def _worker_with_detectors(
    camera: CameraRuntimeConfig,
    resources: _WorkerResources,
) -> tuple[CameraWorker, tuple[DomainDetectorProtocol, ...]]:
    detectors = _domain_detectors(resources.config)
    return _worker(camera, resources, domain_detectors=detectors), detectors


def _worker(
    camera: CameraRuntimeConfig,
    resources: _WorkerResources,
    *,
    domain_detectors: tuple[DomainDetectorProtocol, ...] | None = None,
) -> CameraWorker:
    runtime = resources.config.runtime
    tracker = GreedyIouTracker()
    return CameraWorker(
        camera_id=camera.camera_id,
        facility_id=camera.facility_id,
        frame_source=RTSPSource(
            camera.inference_rtsp_url,
            max_failures=runtime.max_failures,
            open_timeout_ms=runtime.open_timeout_ms,
            read_timeout_ms=runtime.read_timeout_ms,
            # Production keeps retrying indefinitely so recoverable safety cameras
            # come back online; each camera has its own capture thread, reports
            # DEGRADED while down, and is promptly cancellable via stop_event.
            backoff_wait=resources.stop_event.wait if resources.stop_event is not None else None,
            stop_requested=(
                resources.stop_event.is_set if resources.stop_event is not None else None
            ),
            backend=_decode_backend(camera),
            target_fps=camera.fps,
            pace_wait=resources.stop_event.wait if resources.stop_event is not None else None,
        ),
        runners=resources.runners.as_mapping(),
        scheduler=Scheduler(
            {
                "pose": camera.frame_stride,
                "bed": max(30, camera.frame_stride),
            }
        ),
        domain_detectors=(
            _domain_detectors(resources.config) if domain_detectors is None else domain_detectors
        ),
        event_sink=resources.clients[camera.camera_id],
        status_store=resources.status_store,
        fall_classifier=FallWindowClassifier(resources.fall_model),
        tracker=tracker,
        overlay_sink=resources.overlay_publisher,
        snapshot_renderer=OverlayRenderer(),
        detector_version=DETECTOR_VERSION,
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
    config_version: int = 0
    failure_count: int = 0

    def __post_init__(self) -> None:
        self.alert_url = _parse_http_url(self.alert_url)
        self.heartbeat_url = _parse_http_url(self.heartbeat_url)
        self.relay_token = _required(self.relay_token, "relay_token")

    def send_heartbeat(self) -> bool:
        return self._post(
            self.heartbeat_url,
            {
                "camera_id": self.camera_id,
                "facility_id": self.facility_id,
                CONFIG_VERSION_KEY: self.config_version,
            },
        )

    def emit(self, event: EventPayload) -> None:
        event_type = str(event.get("event_type", ""))
        if event_type not in {"fall", "bed-exit"}:
            return
        evidence = dict(event)
        event_audit = evidence.pop("audit", None)
        snapshot_jpeg = evidence.pop("snapshot_jpeg", None)
        payload: dict[str, object] = {
            "event_type": "bed-exit" if event_type == "bed-exit" else "fall",
            "probability": _event_probability(event),
            "detected_at": str(event.get("detected_at", "")) or _utc_timestamp(),
            "camera_id": self.camera_id,
            "facility_id": self.facility_id,
            "evidence": evidence,
        }
        if self.resident_id is not None:
            payload["resident_id"] = self.resident_id
        if isinstance(event_audit, dict):
            payload["audit"] = {**event_audit, CONFIG_VERSION_KEY: self.config_version}
        if isinstance(snapshot_jpeg, bytes):
            payload["snapshot_jpeg_base64"] = base64.b64encode(snapshot_jpeg).decode("ascii")
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


def _relay_client(
    config: EdgeWorkerConfig,
    camera: CameraRuntimeConfig,
    config_version: int = 0,
) -> _RelayClient:
    return _RelayClient(
        alert_url=config.relay_alert_url,
        heartbeat_url=config.relay_heartbeat_url,
        camera_id=camera.camera_id,
        facility_id=camera.facility_id,
        resident_id=camera.resident_id,
        relay_token=config.relay.token.get_secret_value(),
        config_version=config_version,
    )


def _restart_check(
    relay_url: str,
    relay_token: str | None,
    boot_registry_version: int,
    *,
    poll_interval_sec: float = 60.0,
    monotonic: Callable[[], float] = time.monotonic,
) -> Callable[[], bool]:
    last_checked = -poll_interval_sec

    def _check() -> bool:
        nonlocal last_checked
        now = monotonic()
        if now - last_checked < poll_interval_sec:
            return False
        last_checked = now
        pulled = pull_worker_config(relay_url, relay_token)
        if pulled is None or pulled.config_version <= boot_registry_version:
            return False
        print(
            f"worker registry_version changed "
            f"{boot_registry_version}->{pulled.config_version}; exiting for restart",
            file=sys.stderr,
        )
        return True

    return _check

def _config_refresh(
    relay_url: str,
    relay_token: str | None,
    bed_exit_monitors: tuple[BedExitMonitor, ...],
    yaml_config: EdgeWorkerConfig,
    initial_window: NightWindow | None,
    *,
    pull_config: Callable[[str, str | None], PulledWorkerConfig | None] = pull_worker_config,
) -> Callable[[], None]:
    last_applied = initial_window

    def _refresh() -> None:
        nonlocal last_applied
        try:
            pulled = pull_config(relay_url, relay_token)
            if pulled is None:
                return
            night_window = resolve_night_window(yaml_config, pulled)
            if night_window == last_applied:
                return
            for monitor in bed_exit_monitors:
                monitor.update_night_window(night_window)
            last_applied = night_window
        except Exception:  # noqa: BLE001 - config refresh is best-effort; keep last window
            return

    return _refresh



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
