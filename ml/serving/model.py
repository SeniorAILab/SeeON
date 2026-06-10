"""Placeholder model loader for the serving lifecycle.

PoC stub: loads artifact metadata from the model directory and
returns a deterministic dummy probability. Replace `FallDetector.predict` with
real inference (e.g. YOLO11-pose keypoints -> temporal classifier) later.

Models live under a single root (ADR-015):
    ml/models/fall/<model_type>/{model.pt, metadata.json}
"""

from __future__ import annotations

import json
from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


class FallDetector:
    def __init__(self, name: str = "fall-detector", model_type: str = "random-forest") -> None:
        self.name = name
        self.model_type = model_type
        self.artifact_dir = MODELS_DIR / "fall" / model_type
        self.metadata = self._load_metadata()

    def _load_metadata(self) -> dict:
        meta_path = self.artifact_dir / "metadata.json"
        if meta_path.exists():
            return json.loads(meta_path.read_text())
        return {"name": self.name, "model_type": self.model_type, "status": "placeholder"}

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
