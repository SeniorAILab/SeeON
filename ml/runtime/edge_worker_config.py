from __future__ import annotations

import os
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, TypeAlias
from urllib.parse import urlsplit, urlunsplit

import yaml
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    ValidationError,
    ValidationInfo,
    field_validator,
    model_validator,
)

EDGE_CAMERA_CONFIG_ENV = "EDGE_CAMERA_CONFIG"
INGEST_ENDPOINT_SUFFIXES: Final = {
    "alert_api_url": "/ingest/alerts",
    "heartbeat_api_url": "/ingest/heartbeat",
}
KNOWN_DOMAIN_NAMES: Final = frozenset(
    {"fall", "bed_exit", "wheelchair_standup", "long_lie", "risk"}
)
ConfigValue: TypeAlias = (
    str | int | float | bool | None | list["ConfigValue"] | dict[str, "ConfigValue"]
)


@dataclass(frozen=True, slots=True)
class EdgeWorkerConfigError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


class CameraRuntimeConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    camera_id: str = Field(min_length=1)
    facility_id: str = Field(min_length=1)
    resident_id: str | None = None
    rtsp_url: str = Field(min_length=1)
    ingest_key_id: str = Field(min_length=1)
    ingest_secret: SecretStr = Field(repr=False)
    heartbeat_interval_sec: float = Field(default=30.0, gt=0)
    frame_stride: int = Field(default=1, gt=0)
    label: str | None = None

    @field_validator("camera_id", "facility_id", "ingest_key_id")
    @classmethod
    def _strip_required_text(cls, value: str) -> str:
        stripped = value.strip()
        if stripped == "":
            raise ValueError("must not be blank")
        return stripped

    @field_validator("rtsp_url")
    @classmethod
    def _require_rtsp_url(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped.lower().startswith("rtsp://"):
            raise ValueError("rtsp_url must start with rtsp://")
        return stripped

    @field_validator("resident_id")
    @classmethod
    def _normalize_resident_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return None if stripped == "" else stripped


class IngestConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    alert_api_url: str = Field(min_length=1)
    heartbeat_api_url: str | None = None


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


class WorkerModelsConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    fall: FallModelConfig | None = None


class DomainsConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    enabled: tuple[str, ...] | None = None

    @field_validator("enabled")
    @classmethod
    def _validate_domains(cls, value: tuple[str, ...] | None) -> tuple[str, ...] | None:
        if value is None:
            return None
        unknown = sorted(set(value) - KNOWN_DOMAIN_NAMES)
        if unknown:
            raise ValueError(f"domains.enabled contains unknown domain: {', '.join(unknown)}")
        return value


class EdgeWorkerConfig(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    version: int = 1
    ingest: IngestConfig | None = None
    alert_api_url: str = Field(min_length=1)
    heartbeat_api_url: str | None = None
    runtime: WorkerRuntimeConfig = Field(default_factory=WorkerRuntimeConfig)
    models: WorkerModelsConfig = Field(default_factory=WorkerModelsConfig)
    domains: DomainsConfig = Field(default_factory=DomainsConfig)
    cameras: tuple[CameraRuntimeConfig, ...] = Field(min_length=1)

    @model_validator(mode="before")
    @classmethod
    def _flatten_ingest(cls, data: ConfigValue) -> ConfigValue:
        if not isinstance(data, dict):
            return data
        ingest = data.get("ingest")
        if not isinstance(ingest, dict):
            return data
        flattened = dict(data)
        flattened.setdefault("alert_api_url", ingest.get("alert_api_url"))
        flattened.setdefault("heartbeat_api_url", ingest.get("heartbeat_api_url"))
        return flattened

    @field_validator("alert_api_url", "heartbeat_api_url")
    @classmethod
    def _require_http_url(cls, value: str | None, info: ValidationInfo) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        parsed = urlsplit(stripped)
        if parsed.scheme.lower() not in {"http", "https"} or parsed.netloc == "":
            raise EdgeWorkerConfigError(f"{info.field_name} must be absolute HTTP(S)")
        if parsed.query or parsed.fragment:
            raise EdgeWorkerConfigError(f"{info.field_name} must not include query or fragment")
        path = parsed.path.rstrip("/")
        expected_suffix = INGEST_ENDPOINT_SUFFIXES.get(str(info.field_name))
        if expected_suffix is not None and not path.endswith(expected_suffix):
            raise EdgeWorkerConfigError(
                f"{info.field_name} must target backend {expected_suffix}"
            )
        return urlunsplit(parsed._replace(path=path))

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
        return self.domains.enabled

    @property
    def resolved_heartbeat_api_url(self) -> str:
        if self.heartbeat_api_url is not None:
            return self.heartbeat_api_url
        if self.alert_api_url.endswith("/alerts"):
            return f"{self.alert_api_url.removesuffix('/alerts')}/heartbeat"
        return f"{self.alert_api_url.rstrip('/')}/heartbeat"


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
        print("usage: python -m runtime.edge_worker_config --check", file=sys.stderr)
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
    "CameraRuntimeConfig",
    "DomainsConfig",
    "EdgeWorkerConfig",
    "EdgeWorkerConfigError",
    "FallModelConfig",
    "IngestConfig",
    "WorkerModelsConfig",
    "WorkerRuntimeConfig",
    "load_edge_worker_config",
    "resolve_config_path",
]
