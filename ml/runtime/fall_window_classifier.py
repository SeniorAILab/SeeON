from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

import numpy as np
from numpy.typing import NDArray

from contracts.model import DEFAULT_FALL_CONFIDENCE_THRESHOLD
from contracts.observation import (
    FALL_LABEL_TEXT,
    NORMAL_LABEL_TEXT,
    DetectionLabel,
    FrameObservation,
)
from features.pose_normalization import normalize_person_keypoints
from features.window_features import extract_window_features
from perception.tracker import GreedyIouTracker


class FallModelMetadataProtocol(Protocol):
    window: int
    stride: int


@runtime_checkable
class FallModelProtocol(Protocol):
    metadata: FallModelMetadataProtocol
    operating_threshold: float

    def predict(self, features: NDArray[np.float32]) -> float: ...


@dataclass(slots=True)
class FallWindowClassifier:
    model: FallModelProtocol
    tracker: GreedyIouTracker = field(default_factory=GreedyIouTracker)
    _buffers: dict[int, deque[NDArray[np.float32]]] = field(default_factory=dict, init=False)
    _last_probabilities: dict[int, float] = field(default_factory=dict, init=False)
    _frame_counter: int = field(default=0, init=False)

    def classify(
        self,
        observation: FrameObservation,
        frame_w: int,
        frame_h: int,
    ) -> FrameObservation:
        track_ids = self.tracker.update(observation.boxes)
        live_ids = self.tracker.live_ids
        active_ids: set[int] = set()

        for index, track_id in enumerate(track_ids):
            active_ids.add(track_id)
            if index < len(observation.keypoints):
                self._buffer_for(track_id).append(
                    normalize_person_keypoints(
                        (observation.keypoints[index],),
                        frame_w,
                        frame_h,
                        DEFAULT_FALL_CONFIDENCE_THRESHOLD,
                    )
                )

        if live_ids - active_ids:
            zeros = np.zeros((17, 3), dtype=np.float32)
            for track_id in live_ids - active_ids:
                self._buffer_for(track_id).append(zeros)

        for track_id in tuple(self._buffers):
            if track_id not in live_ids:
                del self._buffers[track_id]
                self._last_probabilities.pop(track_id, None)

        self._frame_counter += 1
        if self._frame_counter % self.model.metadata.stride == 0:
            self._update_due_probabilities()

        labels = tuple(
            self._label_for_track(track_id)
            for track_id in track_ids
            if track_id in self.tracker.live_ids
        )
        return FrameObservation(
            detections=(observation.boxes, labels),
            poses=observation.poses,
            regions=observation.regions,
        )

    def _buffer_for(self, track_id: int) -> deque[NDArray[np.float32]]:
        buffer = self._buffers.get(track_id)
        if buffer is None:
            buffer = deque(maxlen=self.model.metadata.window)
            self._buffers[track_id] = buffer
        return buffer

    def _update_due_probabilities(self) -> None:
        for track_id, buffer in self._buffers.items():
            if len(buffer) < self.model.metadata.window:
                continue
            window = np.stack(tuple(buffer), axis=0)
            if getattr(self.model.metadata, "mode", "features") == "sequence":
                features = window.reshape(self.model.metadata.window, 51).astype(np.float32)
            else:
                features = np.asarray(
                    extract_window_features(window),
                    dtype=np.float32,
                )
            self._last_probabilities[track_id] = self.model.predict(features)

    def _label_for_track(self, track_id: int) -> DetectionLabel:
        probability = self._last_probabilities.get(track_id, 0.0)
        is_fall = probability >= self.model.operating_threshold
        return DetectionLabel(
            text=FALL_LABEL_TEXT if is_fall else NORMAL_LABEL_TEXT,
            confidence=probability,
            is_fall=is_fall,
        )


__all__ = ["FallModelProtocol", "FallWindowClassifier"]
