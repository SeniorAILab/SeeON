from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from demo.features import FrameFeatures


@dataclass(frozen=True, slots=True)
class Classification:
    is_fall: bool
    confidence: float
    label: str  # "fall" | "no-fall"


@dataclass(frozen=True, slots=True)
class ClassifierParams:
    confidence: float = 0.05  # pose conf passthrough (used by module, kept here for UI)
    window: int = 60  # frames (reserved for temporal models)
    stride: int = 15  # frames (reserved)
    sustained_down_sec: float = 2.0
    aspect_ratio_min: float = 1.2  # wider-than-tall => lying
    vertical_center_min: float = 0.55  # in lower portion of frame => on floor


@runtime_checkable
class Classifier(Protocol):
    name: str

    def reset(self) -> None: ...

    def update(self, features: FrameFeatures, time_sec: float) -> Classification: ...


class RuleBasedClassifier:
    """Rule-based fall classifier using sustained lying-pose detection.

    A frame is "down" when the primary person is detected, their bounding box
    is wider than tall (aspect_ratio >= aspect_ratio_min), and their box center
    sits in the lower portion of the frame (vertical_center >= vertical_center_min).

    A fall is emitted once the continuous down-duration reaches sustained_down_sec.
    Confidence ramps 0→1 over the sustain window and holds at 1.0 once the fall
    fires. Any non-down frame resets the timer.
    """

    name: str = "rule_based"

    def __init__(self, params: ClassifierParams) -> None:
        self._params = params
        self._down_start: float | None = None
        self._is_fall: bool = False

    def reset(self) -> None:
        """Clear all internal state."""
        self._down_start = None
        self._is_fall = False

    def update(self, features: FrameFeatures, time_sec: float) -> Classification:
        p = self._params
        is_down = (
            features.has_person
            and features.aspect_ratio >= p.aspect_ratio_min
            and features.vertical_center >= p.vertical_center_min
        )

        if not is_down:
            self._down_start = None
            self._is_fall = False
            return Classification(is_fall=False, confidence=0.0, label="no-fall")

        if self._down_start is None:
            self._down_start = time_sec

        duration = time_sec - self._down_start
        conf = min(1.0, duration / p.sustained_down_sec)

        if duration >= p.sustained_down_sec:
            self._is_fall = True

        if self._is_fall:
            return Classification(is_fall=True, confidence=conf, label="fall")
        return Classification(is_fall=False, confidence=conf, label="no-fall")


@dataclass(frozen=True, slots=True)
class ClassifierSpec:
    key: str
    display_name: str
    available: bool
    factory: Callable[[ClassifierParams], Classifier] | None


CLASSIFIER_REGISTRY: tuple[ClassifierSpec, ...] = (
    ClassifierSpec(
        key="rule_based",
        display_name="규칙기반 (Rule-based)",
        available=True,
        factory=RuleBasedClassifier,
    ),
    ClassifierSpec(
        key="random_forest",
        display_name="Random Forest (준비중)",
        available=False,
        factory=None,
    ),
    ClassifierSpec(
        key="lstm",
        display_name="LSTM (준비중)",
        available=False,
        factory=None,
    ),
    ClassifierSpec(
        key="transformer",
        display_name="Transformer (준비중)",
        available=False,
        factory=None,
    ),
)


def available_classifier_keys() -> tuple[str, ...]:
    """Return keys for all classifiers that are currently available."""
    return tuple(spec.key for spec in CLASSIFIER_REGISTRY if spec.available)


def build_classifier(key: str, params: ClassifierParams) -> Classifier:
    """Build a Classifier by registry key.

    Raises ValueError for unknown keys or keys whose ``available`` is False
    (준비중 / not yet implemented).
    """
    for spec in CLASSIFIER_REGISTRY:
        if spec.key == key:
            if not spec.available or spec.factory is None:
                raise ValueError(
                    f"Classifier {key!r} is not available (준비중). "
                    f"Available classifiers: {available_classifier_keys()}"
                )
            return spec.factory(params)
    raise ValueError(
        f"Unknown classifier key {key!r}. Available classifiers: {available_classifier_keys()}"
    )
