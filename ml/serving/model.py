"""Placeholder model loader for the serving lifecycle.

PoC stub: loads artifact metadata from the versioned artifact directory and
returns a deterministic dummy probability. Replace `FallDetector.predict` with
real inference (e.g. YOLO11-pose keypoints -> temporal classifier) later.

Artifacts are version-addressed (Triton-inspired):
    ml/artifacts/<model-name>/<version>/{model.pt, metadata.json}
"""

from __future__ import annotations

import json
from pathlib import Path

ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "artifacts"


class FallDetector:
    def __init__(self, name: str = "fall-detector", version: str = "0.1.0") -> None:
        self.name = name
        self.version = version
        self.artifact_dir = ARTIFACTS_DIR / name / version
        self.metadata = self._load_metadata()

    def _load_metadata(self) -> dict:
        meta_path = self.artifact_dir / "metadata.json"
        if meta_path.exists():
            return json.loads(meta_path.read_text())
        return {"name": self.name, "version": self.version, "status": "placeholder"}

    def predict(self, window: list[list[float]] | None = None) -> float:
        """Return fall probability in [0, 1].

        PoC placeholder: deterministic dummy based on window length so the
        end-to-end path (request -> inference -> response) is exercisable.
        """
        if not window:
            return 0.0
        # Dummy: longer/denser windows -> higher score, clamped to [0, 1].
        return min(1.0, round(len(window) / 100.0, 4))


_model: FallDetector | None = None


def get_model() -> FallDetector:
    global _model
    if _model is None:
        _model = FallDetector()
    return _model
