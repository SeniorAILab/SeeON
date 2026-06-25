from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from runtime.edge_worker_config import EdgeWorkerConfigError, load_edge_worker_config


def _valid_yaml(path: Path) -> Path:
    artifact_dir = path.parent / "models" / "fall" / "lstm"
    _write_placeholder_artifact(artifact_dir)
    payload = {
        "version": 1,
        "ingest": {
            "alert_api_url": "http://backend.local/ingest/alerts",
            "heartbeat_api_url": "http://backend.local/ingest/heartbeat",
        },
        "runtime": {
            "max_failures": 30,
            "open_timeout_ms": 5000,
            "read_timeout_ms": 5000,
        },
        "models": {
            "fall": {
                "type": "lstm",
                "framework": "pytorch",
                "mode": "sequence",
                "artifact_dir": str(artifact_dir),
                "weights": "model.pt",
                "architecture": "arch.json",
                "metadata": "metadata.yaml",
                "window": 3,
                "stride": 1,
                "input_shape": [3, 51],
                "operating_threshold": 0.5,
            }
        },
        "domains": {"enabled": ["fall"]},
        "cameras": [
            {
                "camera_id": "camera-1",
                "facility_id": "facility-1",
                "resident_id": "resident-1",
                "rtsp_url": "rtsp://camera-1.local/trackID=2",
                "ingest_key_id": "key-1",
                "ingest_secret": "secret-1",
                "heartbeat_interval_sec": 30,
                "frame_stride": 1,
                "label": "Room 1",
            }
        ],
    }
    path.write_text(yaml.safe_dump(payload), encoding="utf-8")
    return path


def _write_placeholder_artifact(path: Path) -> None:
    path.mkdir(parents=True)
    (path / "model.pt").write_bytes(b"placeholder")
    (path / "arch.json").write_text('{"hidden":4,"layers":1,"dropout":0.0}', encoding="utf-8")
    (path / "metadata.yaml").write_text("type: lstm\n", encoding="utf-8")


def test_ml_worker_yaml_config_loads_nested_contract(tmp_path: Path) -> None:
    config = load_edge_worker_config(_valid_yaml(tmp_path / "ml-worker.yaml"))

    assert config.version == 1
    assert config.alert_api_url == "http://backend.local/ingest/alerts"
    assert config.heartbeat_api_url == "http://backend.local/ingest/heartbeat"
    assert config.runtime.max_failures == 30
    assert config.models.fall.type == "lstm"
    assert config.models.fall.input_shape == (3, 51)
    assert config.enabled_domains == ("fall",)
    assert len(config.cameras) == 1


def test_ml_worker_rejects_json_config(tmp_path: Path) -> None:
    path = tmp_path / "edge-cameras.json"
    path.write_text('{"cameras":[]}', encoding="utf-8")

    with pytest.raises(EdgeWorkerConfigError, match="YAML"):
        load_edge_worker_config(path)


def test_ml_worker_rejects_malformed_yaml(tmp_path: Path) -> None:
    path = tmp_path / "ml-worker.yaml"
    path.write_text("cameras: [", encoding="utf-8")

    with pytest.raises(EdgeWorkerConfigError, match="not valid YAML"):
        load_edge_worker_config(path)


def test_ml_worker_yaml_rejects_unknown_domain(tmp_path: Path) -> None:
    path = _valid_yaml(tmp_path / "ml-worker.yaml")
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    payload["domains"]["enabled"] = ["fall", "unknown"]
    path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    with pytest.raises(EdgeWorkerConfigError, match="domains.enabled"):
        load_edge_worker_config(path)


def test_ml_worker_yaml_rejects_non_lstm_fall_model(tmp_path: Path) -> None:
    path = _valid_yaml(tmp_path / "ml-worker.yaml")
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    payload["models"]["fall"]["type"] = "random-forest"
    path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    with pytest.raises(EdgeWorkerConfigError, match="models.fall.type"):
        load_edge_worker_config(path)
