from __future__ import annotations

import importlib
import json
from pathlib import Path

from edge_worker_fixtures import edge_config_payload


def test_worker_entrypoint_check_config_uses_worker_package(tmp_path: Path) -> None:
    config_path = tmp_path / "edge-cameras.json"
    payload = edge_config_payload(
        camera_count=1,
        include_optional_fields=False,
        resident_ids=False,
    )
    config_path.write_text(json.dumps(payload), encoding="utf-8")

    module = importlib.import_module("worker.edge_worker")

    assert module.main(["--config", str(config_path), "--check-config"]) == 0
