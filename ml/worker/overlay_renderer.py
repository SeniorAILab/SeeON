from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from contracts.frame import Frame
from contracts.observation import FrameObservation
from worker.domains.bed_exit.schema import DomainDebugSnapshot
from worker.perception.overlay_renderer import (
    Color,
    draw_box,
    draw_label,
    draw_pose,
    draw_region,
)

PERSON_COLOR: Color = (0, 255, 0)
BED_COLOR: Color = (255, 0, 0)
BED_ROI_TEXT_COLOR: Color = (255, 255, 0)
BED_EXIT_STATUS_COLOR: Color = (0, 0, 255)
BED_PRESENT_STATUS_COLOR: Color = (0, 255, 255)
POSE_DOT_COLOR: Color = (255, 255, 255)


@dataclass(frozen=True, slots=True)
class OverlayRenderer:
    """Worker dev-MJPEG overlay.

    Composes the shared ``perception.overlay_renderer`` drawing primitives with
    bed-exit-specific debug annotations, then encodes JPEG for transport. It is a
    pure function of (frame, observation, debug snapshots) and never mutates the
    bed-exit detector.
    """

    show_pose: bool = False

    def render(
        self,
        frame: Frame,
        observation: FrameObservation,
        debug_snapshots: tuple[DomainDebugSnapshot, ...] = (),
    ) -> np.ndarray:
        image = frame.image.copy()
        for box in observation.boxes:
            draw_box(image, box, PERSON_COLOR)
            draw_label(image, "person", box.x1, max(12, box.y1 - 4), PERSON_COLOR)
        for box in observation.bed_boxes:
            draw_region(image, box, BED_COLOR, fill=True)
            draw_label(image, "bed", box.x1, max(12, box.y1 - 4), BED_COLOR)
        for snapshot in debug_snapshots:
            _draw_bed_exit_debug(image, snapshot)
        if self.show_pose:
            for keypoints in observation.keypoints:
                draw_pose(
                    image,
                    keypoints,
                    color=POSE_DOT_COLOR,
                    dot_radius=2,
                    skeleton=False,
                )
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


def _draw_bed_exit_debug(image: np.ndarray, snapshot: DomainDebugSnapshot) -> None:
    if snapshot.bed_exit is None:
        return
    bed_debug = snapshot.bed_exit.bed_region
    label = "bed_roi"
    if bed_debug is not None:
        label = f"bed_roi:{bed_debug.source}"
        if bed_debug.age_frames is not None:
            label = f"{label} age={bed_debug.age_frames}"
    draw_label(image, label, 8, 18, BED_ROI_TEXT_COLOR, scale=0.5)
    for status in snapshot.bed_exit.statuses:
        color = BED_EXIT_STATUS_COLOR if status.occupancy == "exit" else BED_PRESENT_STATUS_COLOR
        draw_box(image, status.box, color)
        draw_label(
            image,
            f"bed:{status.occupancy}",
            status.box.x1,
            max(12, status.box.y1 - 4),
            color,
        )
