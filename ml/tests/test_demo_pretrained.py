from __future__ import annotations

import json
from pathlib import Path

from demo.model_registry import available_pretrained_specs
from demo.pretrained import (
    artifact_exists,
    materialize_pretrained_artifact,
)


def test_materializes_pretrained_artifact_with_metadata(tmp_path: Path) -> None:
    spec = next(
        s for s in available_pretrained_specs() if s.model_id == "tomotsugu-human-fall-detection"
    )

    artifact = materialize_pretrained_artifact(
        spec=spec,
        artifacts_root=tmp_path / "pretrained",
        fetcher=lambda _url: b"pretend-pt-bytes",
    )
    metadata = json.loads(artifact.metadata_path.read_text(encoding="utf-8"))

    assert artifact.weight_path.name == "best.pt"
    assert artifact.weight_path.read_bytes() == b"pretend-pt-bytes"
    assert metadata["model_id"] == "tomotsugu-human-fall-detection"
    assert metadata["weight_url"] == spec.weight_url
    assert "fall" in metadata["fall_labels"]
    assert artifact_exists(spec=spec, artifacts_root=tmp_path / "pretrained")
