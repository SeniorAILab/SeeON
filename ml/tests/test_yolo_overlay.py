from __future__ import annotations

import numpy as np

from demo.realtime import FallStatus
from demo.yolo_overlay import render_yolo_overlay
from demo.yolo_runtime import DetectionBox, YoloFrameAnalysis


def test_draws_lower_body_pose_segments_when_keypoints_are_visible() -> None:
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    pose = _empty_pose()
    pose[11] = (32, 44, 0.95)
    pose[13] = (32, 62, 0.95)
    pose[15] = (32, 80, 0.95)

    overlay = render_yolo_overlay(frame=frame, analyses=(), poses=(tuple(pose),))

    assert np.count_nonzero(overlay[62:80, 32]) > 0


def test_draws_each_detected_person_pose() -> None:
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    first_pose = _empty_pose()
    first_pose[5] = (20, 20, 0.95)
    first_pose[7] = (20, 38, 0.95)
    second_pose = _empty_pose()
    second_pose[6] = (96, 20, 0.95)
    second_pose[8] = (96, 38, 0.95)

    overlay = render_yolo_overlay(
        frame=frame,
        analyses=(),
        poses=(tuple(first_pose), tuple(second_pose)),
    )

    assert np.count_nonzero(overlay[20:38, 20]) > 0
    assert np.count_nonzero(overlay[20:38, 96]) > 0


def test_draws_low_confidence_pose_segments_for_low_resolution_fall_frames() -> None:
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    pose = _empty_pose()
    pose[11] = (32, 44, 0.22)
    pose[13] = (32, 62, 0.22)

    overlay = render_yolo_overlay(frame=frame, analyses=(), poses=(tuple(pose),))

    assert np.count_nonzero(overlay[44:62, 32]) > 0


def test_does_not_draw_detection_boxes_when_pose_is_missing() -> None:
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    analysis = YoloFrameAnalysis(
        model_id="model-a",
        frame_index=0,
        time_sec=0.0,
        detections=(
            DetectionBox(
                model_id="model-a",
                label="person",
                confidence=0.9,
                x1=12,
                y1=12,
                x2=64,
                y2=64,
                is_fall=False,
            ),
        ),
        status=FallStatus.WATCHING,
        peak_confidence=0.0,
        fall_label=None,
    )

    overlay = render_yolo_overlay(frame=frame, analyses=(analysis,), poses=())

    assert np.array_equal(overlay, frame)


def _empty_pose() -> list[tuple[int, int, float]]:
    return [(0, 0, 0.0)] * 17
