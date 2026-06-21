"""Boot-time reacquisition of fall-classifier weights for cloud deploys.

Streamlit Community Cloud builds straight from the GitHub repo, which carries
no model weights (``ml/models/`` is gitignored; deny-assets blocks committing
them). When ``models/fall/`` is absent, restore it from the public HF model
repo that mirrors the ADR-015 custody layout (weights + metadata.json — no
footage). Pose weights need no custody here: ``demo/model_modules.py`` already
lets ultralytics auto-download into ``ml/models/pose/``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Final

FALL_MODELS_REPO: Final = "Berom0227/eldercare-fall-models"
FALL_MODELS_DIR: Final = Path(__file__).resolve().parent.parent / "models" / "fall"


def ensure_fall_models(target_dir: Path = FALL_MODELS_DIR) -> None:
    """Download fall weights when missing; no-op (and fully offline) when present."""
    if any(target_dir.glob("*/metadata.json")):
        return
    try:
        # Lazy import: local operator runs with weights in place never need the hub.
        from huggingface_hub import snapshot_download
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Fall model artifacts are missing under ml/models/fall/ and huggingface_hub is "
            "unavailable to fetch them; the demo classifies fall ONLY via served temporal "
            "models and has no in-process fallback. Install the 'demo' dependency group "
            "or place artifacts under ml/models/fall/."
        ) from exc

    snapshot_download(repo_id=FALL_MODELS_REPO, local_dir=target_dir)
