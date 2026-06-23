from __future__ import annotations

import json
from pathlib import Path

import pytest
from edge_worker_fixtures import edge_config_payload

from worker.edge_worker import main


def test_edge_worker_cli_check_config(tmp_path: Path) -> None:
    config_path = tmp_path / "edge-cameras.json"
    config_path.write_text(
        json.dumps(edge_config_payload(camera_count=1, include_optional_fields=False)),
        encoding="utf-8",
    )

    assert main(["--config", str(config_path), "--check-config"]) == 0


def test_edge_worker_cli_rejects_non_positive_max_frames() -> None:
    assert main(["--max-frames-per-camera", "0"]) == 2


def test_edge_worker_cli_requires_config_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EDGE_CAMERA_CONFIG", raising=False)

    assert main(["--check-config"]) == 2


def test_edge_worker_cli_rejects_unknown_arguments() -> None:
    assert main(["--unknown-option"]) == 2
