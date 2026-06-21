"""Task-to-runner registry for model execution.

ADR-057 keeps model swaps constrained to the runner implementation, model
artifact, and config wiring; callers select a task and receive the configured
runner without importing lower-level serving modules directly.
"""

from __future__ import annotations

from collections.abc import Callable

from runners.sklearn_fall import FallDetector
from runners.yolo_bed_seg import YoloBedSegRunner
from runners.yolo_pose import YoloPoseRunner

RunnerFactory = Callable[..., object]


class ModelRegistry:
    """Small registry mapping model task names to runner factories."""

    def __init__(self) -> None:
        self._factories: dict[str, RunnerFactory] = {}

    def register(self, task: str, factory: RunnerFactory) -> None:
        if not task:
            raise ValueError("task must be non-empty")
        self._factories[task] = factory

    def create(self, task: str, **kwargs: object) -> object:
        return self.get_factory(task)(**kwargs)

    def get_factory(self, task: str) -> RunnerFactory:
        try:
            return self._factories[task]
        except KeyError as exc:
            raise KeyError(f"unknown model task {task!r}") from exc

    def tasks(self) -> tuple[str, ...]:
        return tuple(sorted(self._factories))


def default_registry() -> ModelRegistry:
    registry = ModelRegistry()
    registry.register("pose", YoloPoseRunner)
    registry.register("bed", YoloBedSegRunner)
    registry.register("fall", FallDetector)
    return registry


DEFAULT_REGISTRY = default_registry()
