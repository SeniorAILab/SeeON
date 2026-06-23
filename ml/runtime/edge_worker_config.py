from __future__ import annotations

import json
import os
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError, field_validator

EDGE_CAMERA_CONFIG_ENV = "EDGE_CAMERA_CONFIG"


@dataclass(frozen=True, slots=True)
class EdgeWorkerConfigError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


class CameraRuntimeConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

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


class EdgeWorkerConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    alert_api_url: str = Field(min_length=1)
    heartbeat_api_url: str | None = None
    cameras: tuple[CameraRuntimeConfig, ...] = Field(min_length=1)

    @field_validator("alert_api_url", "heartbeat_api_url")
    @classmethod
    def _require_http_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not (stripped.startswith("http://") or stripped.startswith("https://")):
            raise ValueError("ingest URL must be absolute HTTP(S)")
        return stripped

    def model_post_init(self, __context: object) -> None:
        duplicate_ids = sorted(
            camera_id
            for camera_id, count in Counter(camera.camera_id for camera in self.cameras).items()
            if count > 1
        )
        if duplicate_ids:
            raise EdgeWorkerConfigError(f"duplicate camera_id: {', '.join(duplicate_ids)}")

    @property
    def resolved_heartbeat_api_url(self) -> str:
        if self.heartbeat_api_url is not None:
            return self.heartbeat_api_url
        if self.alert_api_url.endswith("/alerts"):
            return f"{self.alert_api_url.removesuffix('/alerts')}/heartbeat"
        return f"{self.alert_api_url.rstrip('/')}/heartbeat"


def load_edge_worker_config(path: str | Path) -> EdgeWorkerConfig:
    config_path = Path(path)
    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
        return EdgeWorkerConfig.model_validate(raw)
    except OSError as exc:
        raise EdgeWorkerConfigError(f"edge camera config not readable: {config_path}") from exc
    except json.JSONDecodeError as exc:
        raise EdgeWorkerConfigError(f"edge camera config is not valid JSON: {config_path}") from exc
    except ValidationError as exc:
        fields = ", ".join(".".join(str(part) for part in error["loc"]) for error in exc.errors())
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
    "EdgeWorkerConfig",
    "EdgeWorkerConfigError",
    "load_edge_worker_config",
    "resolve_config_path",
]
