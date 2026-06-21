from __future__ import annotations

from demo.classifiers import CLASSIFIER_REGISTRY, ClassifierParams, available_classifier_keys
from demo.temporal_module import TEMPORAL_MODEL_KEYS


class TestRegistry:
    def test_registry_contains_only_temporal_specs(self) -> None:
        keys = tuple(spec.key for spec in CLASSIFIER_REGISTRY)

        assert keys == TEMPORAL_MODEL_KEYS
        assert "rule_based" not in keys
        assert all(spec.factory is None for spec in CLASSIFIER_REGISTRY)

    def test_available_keys_contract(self) -> None:
        keys = available_classifier_keys()

        assert set(keys) <= set(TEMPORAL_MODEL_KEYS)
        assert all(
            spec.available == (spec.key in keys) for spec in CLASSIFIER_REGISTRY
        )

    def test_classifier_params_serving_passthrough_fields_only(self) -> None:
        params = ClassifierParams()

        assert params.confidence == 0.05
        assert params.window == 60
        assert params.stride == 15
        assert not hasattr(params, "sustained_down_sec")
        assert not hasattr(params, "aspect_ratio_min")
        assert not hasattr(params, "vertical_center_min")
