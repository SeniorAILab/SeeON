from __future__ import annotations

import json
from pathlib import Path

import pytest

from demo.model_registry import select_demo_model
from demo.pretrained import (
    NonPretrainedModelError,
    artifact_exists,
    materialize_pretrained_artifact,
)


def test_materializes_pretrained_artifact_with_metadata(tmp_path: Path) -> None:
    spec = select_demo_model("tomotsugu-human-fall-detection").spec

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


def test_rejects_demo_models_without_pretrained_artifacts(tmp_path: Path) -> None:
    spec = select_demo_model("demo-fall-pose").spec

    with pytest.raises(NonPretrainedModelError, match="demo-fall-pose"):
        materialize_pretrained_artifact(spec=spec, artifacts_root=tmp_path)
