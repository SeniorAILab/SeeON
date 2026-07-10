from __future__ import annotations

import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, TypeAlias
from urllib.parse import urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import yaml
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    ValidationError,
    field_validator,
    model_validator,
)

EDGE_CAMERA_CONFIG_ENV = "EDGE_CAMERA_CONFIG"
EDGE_RELAY_ALERTS_PATH: Final = "/api/v1/relay/alerts"
EDGE_RELAY_HEARTBEAT_PATH: Final = "/api/v1/relay/heartbeat"
KNOWN_DOMAIN_NAMES: Final = frozenset(
    {"fall", "bed_exit", "wheelchair_standup", "long_lie", "risk"}
)
HHMM_PATTERN: Final = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
SUPPORTED_DECODE_BACKENDS: Final = frozenset({"auto", "nvdec", "opencv", "cpu"})
ML_WORKER_DEV_MJPEG_ENV: Final = "ML_WORKER_DEV_MJPEG"
ML_WORKER_DEV_MJPEG_HOST_ENV: Final = "ML_WORKER_DEV_MJPEG_HOST"
ML_WORKER_DEV_MJPEG_PORT_ENV: Final = "ML_WORKER_DEV_MJPEG_PORT"
ConfigValue: TypeAlias = (
    str | int | float | bool | None | list["ConfigValue"] | dict[str, "ConfigValue"]
)


@dataclass(frozen=True, slots=True)
class EdgeWorkerConfigError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


class CameraStreamsConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    sub: str = Field(min_length=1)
    main: str | None = None

    @field_validator("sub", "main")
    @classmethod
    def _require_rtsp_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_rtsp_url(value, "streams")


class CameraRuntimeConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    camera_id: str = Field(min_length=1)
    facility_id: str = Field(min_length=1)
    resident_id: str | None = None
    rtsp_url: str | None = Field(default=None, min_length=1)
    streams: CameraStreamsConfig | None = None
    fps: float = Field(default=5.0, gt=0)
    heartbeat_interval_sec: float = Field(default=30.0, gt=0)
    frame_stride: int = Field(default=1, gt=0)
    label: str | None = None
    decode_backend: str | None = None


    @field_validator("camera_id", "facility_id")
    @classmethod
    def _strip_required_text(cls, value: str) -> str:
        stripped = value.strip()
        if stripped == "":
            raise ValueError("must not be blank")
        return stripped

    @field_validator("rtsp_url")
    @classmethod
    def _require_rtsp_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_rtsp_url(value, "rtsp_url")

    @field_validator("resident_id")
    @classmethod
    def _normalize_resident_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return None if stripped == "" else stripped

    @field_validator("decode_backend")
    @classmethod
    def _validate_decode_backend(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in SUPPORTED_DECODE_BACKENDS:
            raise ValueError(
                "decode_backend must be one of auto, nvdec, opencv, cpu"
            )
        return normalized
    @model_validator(mode="after")
    def _require_inference_stream(self) -> CameraRuntimeConfig:
        if self.rtsp_url is None and self.streams is None:
            raise ValueError("camera must define rtsp_url or streams.sub")
        return self

    @property
    def inference_rtsp_url(self) -> str:
        if self.streams is not None:
            return self.streams.sub
        if self.rtsp_url is None:
            raise ValueError("camera must define rtsp_url or streams.sub")
        return self.rtsp_url

    @property
    def main_rtsp_url(self) -> str | None:
        return None if self.streams is None else self.streams.main




def _normalize_rtsp_url(value: str, field_name: str) -> str:
    stripped = value.strip()
    if not stripped.lower().startswith("rtsp://"):
        raise ValueError(f"{field_name} must start with rtsp://")
    return stripped


class RelayConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    url: str = Field(min_length=1)
    token: SecretStr = Field(repr=False)

    @field_validator("url")
    @classmethod
    def _require_http_url(cls, value: str) -> str:
        return _normalize_http_base_url(value, "relay.url")


class WorkerRuntimeConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    max_failures: int = Field(default=30, gt=0)
    open_timeout_ms: int = Field(default=5000, gt=0)
    read_timeout_ms: int = Field(default=5000, gt=0)


class FallModelConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    type: Literal["lstm"]
    framework: Literal["pytorch"]
    mode: Literal["sequence"]
    artifact_dir: Path
    weights: str = Field(default="model.pt", min_length=1)
    architecture: str = Field(default="arch.json", min_length=1)
    metadata: str = Field(default="metadata.yaml", min_length=1)
    window: int = Field(gt=0)
    stride: int = Field(gt=0)
    input_shape: tuple[int, int]
    operating_threshold: float = Field(ge=0.0, le=1.0)

    @field_validator("artifact_dir")
    @classmethod
    def _expand_artifact_dir(cls, value: Path) -> Path:
        return Path(os.path.expanduser(str(value))).resolve()

    @field_validator("metadata")
    @classmethod
    def _require_metadata_yaml(cls, value: str) -> str:
        if value != "metadata.yaml":
            raise ValueError("metadata must be metadata.yaml")
        return value

    @model_validator(mode="after")
    def _validate_lstm_artifact_contract(self) -> FallModelConfig:
        if self.input_shape != (self.window, 51):
            raise ValueError("input_shape must be [window, 51]")
        for relative in (self.weights, self.architecture, self.metadata):
            path = self.artifact_dir / relative
            if not path.exists():
                raise ValueError(f"missing {relative} at {path}")
        return self


class DevMjpegConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    enabled: bool = False
    host: str = "127.0.0.1"
    port: int = Field(default=8090, gt=0, le=65535)


class WorkerModelsConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    fall: FallModelConfig | None = None


class NightWindowConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    start: str
    end: str
    tz: str

    @field_validator("start", "end")
    @classmethod
    def _validate_hhmm(cls, value: str) -> str:
        if not HHMM_PATTERN.fullmatch(value):
            raise ValueError("night window time must use HH:MM")
        return value

    @field_validator("tz")
    @classmethod
    def _validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except Exception as exc:
            raise ValueError("night window tz must be a valid IANA timezone") from exc
        return value


class FallDomainConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    enabled: bool = True


class BedExitDomainConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    enabled: bool = True
    night_window: NightWindowConfig | None = None


class DisabledDomainConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    enabled: Literal[False] = False


class DomainsConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    enabled: tuple[str, ...] | None = None
    fall: FallDomainConfig | None = None
    bed_exit: BedExitDomainConfig | None = None
    wheelchair_standup: DisabledDomainConfig | None = None
    long_lie: DisabledDomainConfig | None = None
    risk: DisabledDomainConfig | None = None

    @field_validator("enabled")
    @classmethod
    def _validate_domains(cls, value: tuple[str, ...] | None) -> tuple[str, ...] | None:
        if value is None:
            return None
        unknown = sorted(set(value) - KNOWN_DOMAIN_NAMES)
        if unknown:
            raise ValueError(f"domains.enabled contains unknown domain: {', '.join(unknown)}")
        return value

    @model_validator(mode="after")
    def _reject_mixed_legacy_and_map(self) -> DomainsConfig:
        if self.enabled is not None and any(
            name in self.model_fields_set for name in KNOWN_DOMAIN_NAMES
        ):
            raise ValueError("domains.enabled cannot be combined with per-domain config")
        return self

    def domain_config(self, name: str) -> BaseModel | None:
        if name not in KNOWN_DOMAIN_NAMES:
            raise ValueError(f"unknown domain: {name}")
        return getattr(self, name)

    @property
    def enabled_domains(self) -> tuple[str, ...] | None:
        if self.enabled is not None:
            return self.enabled
        configured = tuple(
            name
            for name in ("fall", "bed_exit", "wheelchair_standup", "long_lie", "risk")
            if name in self.model_fields_set
            and (config := self.domain_config(name)) is not None
            and config.enabled
        )
        return configured if configured else None


class EdgeWorkerConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    version: int = 1
    relay: RelayConfig
    runtime: WorkerRuntimeConfig = Field(default_factory=WorkerRuntimeConfig)
    models: WorkerModelsConfig = Field(default_factory=WorkerModelsConfig)
    domains: DomainsConfig = Field(default_factory=DomainsConfig)
    dev_mjpeg: DevMjpegConfig = Field(default_factory=DevMjpegConfig)
    cameras: tuple[CameraRuntimeConfig, ...] = Field(min_length=1)

    @model_validator(mode="before")
    @classmethod
    def _reject_legacy_backend_ingest(cls, data: ConfigValue) -> ConfigValue:
        if not isinstance(data, dict):
            return data
        legacy_fields = [
            name for name in ("ingest", "alert_api_url", "heartbeat_api_url") if name in data
        ]
        for index, camera in enumerate(data.get("cameras", ())):
            if isinstance(camera, dict):
                for name in (f"ingest_{'key_id'}", f"ingest_{'secret'}"):
                    if name in camera:
                        legacy_fields.append(f"cameras.{index}.{name}")
        if legacy_fields:
            raise ValueError(
                "worker config must use relay only; backend ingest fields are forbidden: "
                + ", ".join(legacy_fields)
            )
        return data

    def model_post_init(self, __context: None) -> None:
        duplicate_ids = sorted(
            camera_id
            for camera_id, count in Counter(camera.camera_id for camera in self.cameras).items()
            if count > 1
        )
        if duplicate_ids:
            raise EdgeWorkerConfigError(f"duplicate camera_id: {', '.join(duplicate_ids)}")

    @property
    def enabled_domains(self) -> tuple[str, ...] | None:
        return self.domains.enabled_domains

    @property
    def relay_alert_url(self) -> str:
        return f"{self.relay.url}{EDGE_RELAY_ALERTS_PATH}"

    @property
    def relay_heartbeat_url(self) -> str:
        return f"{self.relay.url}{EDGE_RELAY_HEARTBEAT_PATH}"


def _normalize_http_base_url(value: str, field_name: str) -> str:
    stripped = value.strip()
    parsed = urlsplit(stripped)
    if parsed.scheme.lower() not in {"http", "https"} or parsed.netloc == "":
        raise EdgeWorkerConfigError(f"{field_name} must be absolute HTTP(S)")
    if parsed.query or parsed.fragment:
        raise EdgeWorkerConfigError(f"{field_name} must not include query or fragment")
    return urlunsplit(parsed._replace(path=parsed.path.rstrip("/")))


def load_edge_worker_config(path: str | Path) -> EdgeWorkerConfig:
    config_path = Path(path)
    if config_path.suffix.lower() == ".json":
        raise EdgeWorkerConfigError(
            f"edge camera config must be YAML, JSON is not supported: {config_path}"
        )
    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise EdgeWorkerConfigError(
                f"edge camera config must contain a YAML mapping: {config_path}"
            )
        return EdgeWorkerConfig.model_validate(raw)
    except OSError as exc:
        raise EdgeWorkerConfigError(f"edge camera config not readable: {config_path}") from exc
    except yaml.YAMLError as exc:
        raise EdgeWorkerConfigError(f"edge camera config is not valid YAML: {config_path}") from exc
    except ValidationError as exc:
        fields = ", ".join(
            f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
            for error in exc.errors()
        )
        raise EdgeWorkerConfigError(f"edge camera config invalid: {fields}") from exc


def resolve_config_path(value: str | None = None) -> Path:
    raw_path = value if value is not None else os.environ.get(EDGE_CAMERA_CONFIG_ENV, "")
    stripped = raw_path.strip()
    if stripped == "":
        raise EdgeWorkerConfigError(
            f"edge camera config path required via --config or {EDGE_CAMERA_CONFIG_ENV}"
        )
    return Path(stripped)


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args != ["--check"]:
        print("usage: python -m worker.edge_worker_config --check", file=sys.stderr)
        return 2
    try:
        config = load_edge_worker_config(resolve_config_path())
    except EdgeWorkerConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(f"edge camera config ok: {len(config.cameras)} cameras")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "EDGE_CAMERA_CONFIG_ENV",
    "DevMjpegConfig",
    "ML_WORKER_DEV_MJPEG_ENV",
    "ML_WORKER_DEV_MJPEG_HOST_ENV",
    "ML_WORKER_DEV_MJPEG_PORT_ENV",
    "CameraRuntimeConfig",
    "CameraStreamsConfig",
    "BedExitDomainConfig",
    "DisabledDomainConfig",
    "DomainsConfig",
    "EdgeWorkerConfig",
    "EdgeWorkerConfigError",
    "FallModelConfig",
    "FallDomainConfig",
    "RelayConfig",
    "NightWindowConfig",
    "WorkerModelsConfig",
    "WorkerRuntimeConfig",
    "load_edge_worker_config",
    "resolve_config_path",
]
