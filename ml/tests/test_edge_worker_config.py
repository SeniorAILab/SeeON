from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from edge_worker_fixtures import edge_config_payload

from runtime.edge_worker_config import EdgeWorkerConfigError, load_edge_worker_config


def test_edge_worker_config_loads_four_cameras_and_redacts_secrets(tmp_path: Path) -> None:
    config_path = tmp_path / "ml-worker.yaml"
    config_path.write_text(yaml.safe_dump(edge_config_payload()), encoding="utf-8")

    config = load_edge_worker_config(config_path)

    assert len(config.cameras) == 4
    assert [camera.camera_id for camera in config.cameras] == [
        "camera-1",
        "camera-2",
        "camera-3",
        "camera-4",
    ]
    assert config.alert_api_url == "http://backend.local/ingest/alerts"
    assert config.heartbeat_api_url == "http://backend.local/ingest/heartbeat"
    assert "secret-1" not in repr(config)


def test_edge_worker_config_rejects_duplicate_camera_ids(tmp_path: Path) -> None:
    payload = edge_config_payload()
    payload["cameras"][1]["camera_id"] = "camera-1"
    config_path = tmp_path / "ml-worker.yaml"
    config_path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    with pytest.raises(EdgeWorkerConfigError, match="duplicate camera_id"):
        load_edge_worker_config(config_path)


def test_edge_worker_config_requires_rtsp_url(tmp_path: Path) -> None:
    payload = edge_config_payload()
    payload["cameras"][0]["rtsp_url"] = ""
    config_path = tmp_path / "ml-worker.yaml"
    config_path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    with pytest.raises(EdgeWorkerConfigError, match="rtsp_url"):
        load_edge_worker_config(config_path)


def test_edge_worker_config_normalizes_blank_resident_id(tmp_path: Path) -> None:
    payload = edge_config_payload()
    payload["cameras"][0]["resident_id"] = "  "
    config_path = tmp_path / "ml-worker.yaml"
    config_path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    config = load_edge_worker_config(config_path)

    assert config.cameras[0].resident_id is None


def test_edge_worker_config_rejects_relative_ingest_url(tmp_path: Path) -> None:
    payload = edge_config_payload()
    payload["alert_api_url"] = "/ingest/alerts"
    config_path = tmp_path / "ml-worker.yaml"
    config_path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    with pytest.raises(EdgeWorkerConfigError, match="alert_api_url"):
        load_edge_worker_config(config_path)


def test_edge_worker_config_rejects_blank_ingest_key_id(tmp_path: Path) -> None:
    payload = edge_config_payload()
    payload["cameras"][0]["ingest_key_id"] = "  "
    config_path = tmp_path / "ml-worker.yaml"
    config_path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    with pytest.raises(EdgeWorkerConfigError, match="ingest_key_id"):
        load_edge_worker_config(config_path)


def test_edge_worker_config_error_does_not_include_secret_value(tmp_path: Path) -> None:
    payload = edge_config_payload()
    payload["cameras"][0]["ingest_secret"] = "super-secret-value"
    payload["cameras"][0]["rtsp_url"] = "not-rtsp"
    config_path = tmp_path / "ml-worker.yaml"
    config_path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    with pytest.raises(EdgeWorkerConfigError) as exc_info:
        load_edge_worker_config(config_path)

    assert "super-secret-value" not in str(exc_info.value)
