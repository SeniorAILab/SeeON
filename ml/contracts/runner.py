from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from typing import Protocol, TypeAlias

import numpy as np
from numpy.typing import NDArray

from contracts.observation import DetectionResult

Image: TypeAlias = NDArray[np.uint8]
PoseOutput: TypeAlias = Sequence[Sequence[float]]
BoxOutput: TypeAlias = Sequence[Sequence[float]]
BedBoxOutput: TypeAlias = Sequence[float]
RunnerOutput: TypeAlias = DetectionResult | tuple[PoseOutput, BoxOutput] | Iterable[BedBoxOutput]


class PredictFullRunnerProtocol(Protocol):
    def predict_full(self, image: Image) -> RunnerOutput: ...


class DetectBedsRunnerProtocol(Protocol):
    def detect_beds(self, image: Image) -> RunnerOutput: ...


class PredictRunnerProtocol(Protocol):
    def predict(self, image: Image) -> RunnerOutput: ...


class RunRunnerProtocol(Protocol):
    def run(self, image: Image) -> RunnerOutput: ...


RunnerProtocol: TypeAlias = (
    PredictFullRunnerProtocol
    | DetectBedsRunnerProtocol
    | PredictRunnerProtocol
    | RunRunnerProtocol
    | Callable[[Image], RunnerOutput]
)


__all__ = [
    "BedBoxOutput",
    "BoxOutput",
    "Image",
    "PoseOutput",
    "RunnerOutput",
    "RunnerProtocol",
]
