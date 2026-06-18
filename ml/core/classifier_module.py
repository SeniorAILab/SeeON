from __future__ import annotations

from core.classifiers import Classifier
from core.contract import (
    FALL_LABEL_TEXT,
    NORMAL_LABEL_TEXT,
    DetectionLabel,
    DetectionResult,
    Frame,
    ModelModule,
)
from core.features import extract_frame_features


class FallClassifierModule:
    """ModelModule composing a pose module and a fall classifier.

    Delegates pose inference to ``pose_module``, extracts per-frame features,
    and runs ``classifier.update`` to produce fall-annotated labels. The primary
    (largest-area) person's label reflects the classifier output; all other
    detected persons keep ``text="person", is_fall=False``. Keypoints and boxes
    from the pose result are preserved unchanged.

    Satisfies the ``ModelModule`` protocol — no ultralytics import at top level.
    """

    def __init__(self, pose_module: ModelModule, classifier: Classifier) -> None:
        self._pose_module = pose_module
        self._classifier = classifier

    def predict(self, frame: Frame) -> DetectionResult:
        pose_result = self._pose_module.predict(frame)

        if not pose_result.boxes:
            return pose_result

        features = extract_frame_features(
            pose_result, frame.image.shape[0], frame.image.shape[1]
        )
        classification = self._classifier.update(features, frame.time_sec)

        # Index of the largest-area box (primary person)
        primary_idx = max(
            range(len(pose_result.boxes)),
            key=lambda i: (
                (pose_result.boxes[i].x2 - pose_result.boxes[i].x1)
                * (pose_result.boxes[i].y2 - pose_result.boxes[i].y1)
            ),
        )

        labels = tuple(
            DetectionLabel(
                text=FALL_LABEL_TEXT if classification.is_fall else NORMAL_LABEL_TEXT,
                confidence=classification.confidence,
                is_fall=classification.is_fall,
            )
            if i == primary_idx
            else DetectionLabel(text="person", confidence=0.0, is_fall=False)
            for i in range(len(pose_result.boxes))
        )

        return DetectionResult(
            boxes=pose_result.boxes,
            labels=labels,
            keypoints=pose_result.keypoints,
        )
