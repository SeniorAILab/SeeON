from __future__ import annotations

import pytest

from runners.registry import ModelRegistry, default_registry
from runners.sklearn_fall import FallDetector
from runners.yolo_bed_seg import YoloBedSegRunner
from runners.yolo_pose import YoloPoseRunner


class FakeRunner:
    def __init__(self, *, value: int = 0) -> None:
        self.value = value


def test_model_registry_register_create_get_factory_and_tasks() -> None:
    registry = ModelRegistry()
    registry.register("fake", FakeRunner)

    assert registry.tasks() == ("fake",)
    assert registry.get_factory("fake") is FakeRunner
    runner = registry.create("fake", value=7)

    assert isinstance(runner, FakeRunner)
    assert runner.value == 7


def test_model_registry_rejects_empty_task() -> None:
    registry = ModelRegistry()

    with pytest.raises(ValueError, match="task must be non-empty"):
        registry.register("", FakeRunner)


def test_model_registry_unknown_task_raises() -> None:
    registry = ModelRegistry()

    with pytest.raises(KeyError, match="unknown model task"):
        registry.get_factory("missing")

    with pytest.raises(KeyError, match="unknown model task"):
        registry.create("missing")


def test_default_registry_has_pose_bed_fall_factories_without_loading_models() -> None:
    registry = default_registry()

    assert registry.tasks() == ("bed", "fall", "pose")
    assert registry.get_factory("pose") is YoloPoseRunner
    assert registry.get_factory("bed") is YoloBedSegRunner
    assert registry.get_factory("fall") is FallDetector
