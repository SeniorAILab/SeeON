from __future__ import annotations

import pytest

from demo.model_modules import POSE_MODEL_SIZES, pose_weight_filename


@pytest.mark.parametrize("size", POSE_MODEL_SIZES)
def test_pose_weight_filename_maps_each_size_to_its_weight(size: str) -> None:
    assert pose_weight_filename(size) == f"yolo26{size}-pose.pt"


def test_pose_weight_filename_rejects_unknown_size() -> None:
    with pytest.raises(ValueError, match="Unknown YOLO26-pose size"):
        pose_weight_filename("xl")
