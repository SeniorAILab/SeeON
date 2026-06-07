from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TypedDict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from demo.model_registry import ModelSpec
except ModuleNotFoundError:
    from model_registry import ModelSpec


ARTIFACTS_ROOT: Final = Path(__file__).resolve().parents[1] / "artifacts" / "pretrained"


class ArtifactMetadata(TypedDict):
    model_id: str
    display_name: str
    source_url: str
    weight_url: str
    weight_path: str
    fall_labels: list[str]
    license_note: str


@dataclass(frozen=True, slots=True)
class PretrainedArtifact:
    model_id: str
    artifact_dir: Path
    weight_path: Path
    metadata_path: Path


class NonPretrainedModelError(Exception):
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        super().__init__(str(self))

    def __str__(self) -> str:
        return f"Model has no pretrained artifact definition: {self.model_id}"


class ArtifactDownloadError(Exception):
    def __init__(self, model_id: str, url: str) -> None:
        self.model_id = model_id
        self.url = url
        super().__init__(str(self))

    def __str__(self) -> str:
        return f"Could not download pretrained artifact for {self.model_id}: {self.url}"


ArtifactFetcher = Callable[[str], bytes]


def artifact_exists(spec: ModelSpec, artifacts_root: Path = ARTIFACTS_ROOT) -> bool:
    artifact = artifact_for_spec(spec=spec, artifacts_root=artifacts_root)
    return artifact.weight_path.exists() and artifact.metadata_path.exists()


def artifact_for_spec(
    spec: ModelSpec,
    artifacts_root: Path = ARTIFACTS_ROOT,
) -> PretrainedArtifact:
    if spec.weight_url is None or spec.artifact_subdir is None:
        raise NonPretrainedModelError(model_id=spec.model_id)
    artifact_dir = artifacts_root / spec.artifact_subdir
    return PretrainedArtifact(
        model_id=spec.model_id,
        artifact_dir=artifact_dir,
        weight_path=artifact_dir / "best.pt",
        metadata_path=artifact_dir / "metadata.json",
    )


def materialize_pretrained_artifact(
    spec: ModelSpec,
    artifacts_root: Path = ARTIFACTS_ROOT,
    fetcher: ArtifactFetcher | None = None,
) -> PretrainedArtifact:
    if spec.weight_url is None:
        raise NonPretrainedModelError(model_id=spec.model_id)
    artifact = artifact_for_spec(spec=spec, artifacts_root=artifacts_root)
    artifact.artifact_dir.mkdir(parents=True, exist_ok=True)
    if not artifact.weight_path.exists():
        fetch = fetcher or _fetch_url
        try:
            artifact.weight_path.write_bytes(fetch(spec.weight_url))
        except (HTTPError, URLError) as error:
            raise ArtifactDownloadError(model_id=spec.model_id, url=spec.weight_url) from error
    metadata = _metadata_for_spec(spec=spec, artifact=artifact)
    artifact.metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return artifact


def _fetch_url(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "eldercare-fall-ai-evaluator/0.1"})
    with urlopen(request, timeout=120) as response:
        return response.read()


def _metadata_for_spec(spec: ModelSpec, artifact: PretrainedArtifact) -> ArtifactMetadata:
    if spec.weight_url is None:
        raise NonPretrainedModelError(model_id=spec.model_id)
    return {
        "model_id": spec.model_id,
        "display_name": spec.display_name,
        "source_url": spec.source_url,
        "weight_url": spec.weight_url,
        "weight_path": str(artifact.weight_path),
        "fall_labels": list(spec.fall_labels),
        "license_note": "Review upstream model license before product use.",
    }
