from __future__ import annotations

from demo.model_registry import available_pretrained_specs


def test_exposes_pretrained_candidates_with_weight_urls() -> None:
    specs = available_pretrained_specs()

    assert {spec.model_id for spec in specs} == {
        "melihuzunoglu-human-fall-detection",
        "tomotsugu-human-fall-detection",
        "syed-yolo-fall-detection",
    }
    assert all(spec.weight_url and spec.artifact_subdir for spec in specs)
    assert all(spec.fall_labels for spec in specs)
