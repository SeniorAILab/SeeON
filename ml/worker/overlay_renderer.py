from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from contracts.frame import Frame
from contracts.observation import BoundingBox, FrameObservation
from domains.bed_exit.schema import DomainDebugSnapshot


@dataclass(frozen=True, slots=True)
class OverlayRenderer:
    draw_pose: bool = False

    def render(
        self,
        frame: Frame,
        observation: FrameObservation,
        debug_snapshots: tuple[DomainDebugSnapshot, ...] = (),
    ) -> np.ndarray:
        image = frame.image.copy()
        for box in observation.boxes:
            _draw_box(image, box, (0, 255, 0), "person")
        for box in observation.bed_boxes:
            _draw_bed(image, box, (255, 0, 0), "bed")
        for snapshot in debug_snapshots:
            if snapshot.bed_exit is None:
                continue
            bed_debug = snapshot.bed_exit.bed_region
            label = "bed_roi"
            if bed_debug is not None:
                label = f"bed_roi:{bed_debug.source}"
                if bed_debug.age_frames is not None:
                    label = f"{label} age={bed_debug.age_frames}"
            cv2.putText(image, label, (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
            for status in snapshot.bed_exit.statuses:
                color = (0, 0, 255) if status.occupancy == "exit" else (0, 255, 255)
                _draw_box(image, status.box, color, f"bed:{status.occupancy}")
        if self.draw_pose:
            for keypoints in observation.keypoints:
                for x, y, confidence in keypoints:
                    if confidence > 0:
                        cv2.circle(image, (int(x), int(y)), 2, (255, 255, 255), -1)
        return image

    def encode_jpeg(
        self,
        frame: Frame,
        observation: FrameObservation,
        debug_snapshots: tuple[DomainDebugSnapshot, ...] = (),
    ) -> bytes:
        image = self.render(frame, observation, debug_snapshots)
        ok, encoded = cv2.imencode(".jpg", image)
        if not ok:
            raise ValueError("failed to encode overlay JPEG")
        return bytes(encoded)


def _draw_box(image: np.ndarray, box: BoundingBox, color: tuple[int, int, int], label: str) -> None:
    cv2.rectangle(image, (box.x1, box.y1), (box.x2, box.y2), color, 2)
    cv2.putText(
        image,
        label,
        (box.x1, max(12, box.y1 - 4)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        color,
        1,
    )


def _draw_bed(image: np.ndarray, box: BoundingBox, color: tuple[int, int, int], label: str) -> None:
    """Draw a bed as its segmentation mask (translucent fill + outline) when the
    box carries a polygon contour; fall back to an axis-aligned box otherwise."""
    if box.polygon:
        points = np.array(box.polygon, dtype=np.int32).reshape((-1, 1, 2))
        mask = image.copy()
        cv2.fillPoly(mask, [points], color)
        cv2.addWeighted(mask, 0.3, image, 0.7, 0, image)
        cv2.polylines(image, [points], isClosed=True, color=color, thickness=2)
        cv2.putText(
            image,
            label,
            (box.x1, max(12, box.y1 - 4)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            color,
            1,
        )
        return
    _draw_box(image, box, color, label)
