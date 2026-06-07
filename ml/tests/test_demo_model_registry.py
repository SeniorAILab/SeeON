from __future__ import annotations

import pytest

from demo.model_registry import (
    UnknownModelError,
    available_model_specs,
    available_pretrained_specs,
    select_demo_model,
)


def test_selects_named_demo_model_with_threshold() -> None:
    specs = available_model_specs()

    selected = select_demo_model("demo-fall-pose", threshold=0.72)
    prediction = selected.predict_frame(
        frame_index=5,
        time_sec=2.5,
        frame_shape=(100, 200, 3),
    )

    assert "demo-fall-pose" in {spec.model_id for spec in specs}
    assert selected.model_id == "demo-fall-pose"
    assert selected.threshold == 0.72
    assert prediction.model_id == selected.model_id
    assert 0.0 <= prediction.fall_score <= 1.0
    assert len(prediction.pose.keypoints) >= 5


def test_rejects_unknown_model_with_clear_error() -> None:
    with pytest.raises(UnknownModelError, match="unknown-model"):
        select_demo_model("unknown-model", threshold=0.7)


def test_exposes_pretrained_candidates_with_weight_urls() -> None:
    specs = available_pretrained_specs()

    assert {spec.model_id for spec in specs} == {
        "melihuzunoglu-human-fall-detection",
        "tomotsugu-human-fall-detection",
        "syed-yolo-fall-detection",
    }
    assert all(spec.weight_url and spec.artifact_subdir for spec in specs)
    assert all(spec.fall_labels for spec in specs)
