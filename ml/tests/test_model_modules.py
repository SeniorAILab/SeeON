from __future__ import annotations

import pytest

from core.model_modules import (
    POSE_MODEL_SIZE_LABELS,
    POSE_MODEL_SIZES,
    WEIGHTS_DIR,
    pose_weight_filename,
    pose_weight_path,
)


@pytest.mark.parametrize("size", POSE_MODEL_SIZES)
def test_pose_weight_filename_maps_each_size_to_its_weight(size: str) -> None:
    assert pose_weight_filename(size) == f"yolo26{size}-pose.pt"


def test_pose_weight_filename_rejects_unknown_size() -> None:
    with pytest.raises(ValueError, match="Unknown YOLO26-pose size"):
        pose_weight_filename("xl")


@pytest.mark.parametrize("size", POSE_MODEL_SIZES)
def test_pose_weight_path_resolves_into_the_weights_cache(size: str) -> None:
    path = pose_weight_path(size)
    assert path.is_absolute()
    assert path.parent == WEIGHTS_DIR
    assert path.name == pose_weight_filename(size)


def test_weights_dir_is_ml_models_pose_not_project_root() -> None:
    # The pose cache must sit at ml/models/pose/ (ADR-015), never ml/weights/ or the ml/ root.
    assert WEIGHTS_DIR.name == "pose"
    assert WEIGHTS_DIR.parent.name == "models"
    assert WEIGHTS_DIR.parent.parent.name == "ml"


def test_pose_model_size_labels_covers_every_size_key() -> None:
    # Guard against a label entry being omitted when a new size is added.
    assert set(POSE_MODEL_SIZES) == set(POSE_MODEL_SIZE_LABELS.keys())
