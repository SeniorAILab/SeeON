from __future__ import annotations

import ast
from pathlib import Path

import numpy as np

from core.seam import BoundingBox, DetectionLabel, DetectionResult
from demo.yolo_overlay import render_yolo_overlay

# ---------------------------------------------------------------------------
# Pose skeleton rendering
# ---------------------------------------------------------------------------


def test_draws_lower_body_pose_segments_when_keypoints_are_visible() -> None:
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    pose = _empty_pose()
    pose[11] = (32, 44, 0.95)
    pose[13] = (32, 62, 0.95)
    pose[15] = (32, 80, 0.95)

    result = DetectionResult(keypoints=(tuple(pose),))
    overlay = render_yolo_overlay(frame=frame, result=result)

    assert np.count_nonzero(overlay[62:80, 32]) > 0


def test_draws_each_detected_person_pose() -> None:
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    first_pose = _empty_pose()
    first_pose[5] = (20, 20, 0.95)
    first_pose[7] = (20, 38, 0.95)
    second_pose = _empty_pose()
    second_pose[6] = (96, 20, 0.95)
    second_pose[8] = (96, 38, 0.95)

    result = DetectionResult(keypoints=(tuple(first_pose), tuple(second_pose)))
    overlay = render_yolo_overlay(frame=frame, result=result)

    assert np.count_nonzero(overlay[20:38, 20]) > 0
    assert np.count_nonzero(overlay[20:38, 96]) > 0


def test_draws_low_confidence_pose_segments_for_low_resolution_fall_frames() -> None:
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    pose = _empty_pose()
    pose[11] = (32, 44, 0.22)
    pose[13] = (32, 62, 0.22)

    result = DetectionResult(keypoints=(tuple(pose),))
    overlay = render_yolo_overlay(frame=frame, result=result)

    assert np.count_nonzero(overlay[44:62, 32]) > 0


# ---------------------------------------------------------------------------
# Bounding-box rendering
# ---------------------------------------------------------------------------


def test_draws_detection_boxes_from_result() -> None:
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    result = _result_with_box(label="standing", is_fall=False)

    overlay = render_yolo_overlay(frame=frame, result=result)

    # The box border must paint pixels along its top edge (y == y1, x in [x1, x2]).
    assert np.count_nonzero(overlay[12, 12:64]) > 0
    assert not np.array_equal(overlay, frame)


def test_fall_box_uses_distinct_color_from_normal_box() -> None:
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    fall = render_yolo_overlay(frame=frame, result=_result_with_box(label="fall", is_fall=True))
    normal = render_yolo_overlay(
        frame=frame, result=_result_with_box(label="standing", is_fall=False)
    )

    assert not np.array_equal(fall[12, 12:64], normal[12, 12:64])


# ---------------------------------------------------------------------------
# Live-path seam assertion
# ---------------------------------------------------------------------------


def test_live_path_is_wired_through_the_seam() -> None:
    """app.py routes playback through the live viewer, which drives the model seam.

    The real-time live-inference rework (ADR-010) replaced the pre-rendered
    player with ``live_view.iter_live_frames``: app.py imports ``live_view`` and
    composes the model via ``demo_ui.build_model`` (which imports the pose
    model-module), while ``live_view`` imports the seam types + overlay.
    Asserting the chain keeps the per-frame inference seam live.
    """
    demo_dir = Path(__file__).parent.parent / "demo"
    app_modules = _imported_modules(demo_dir / "app.py")
    demo_ui_modules = _imported_modules(demo_dir / "demo_ui.py")
    live_view_modules = _imported_modules(demo_dir / "live_view.py")

    assert any("live_view" in m for m in app_modules), (
        "app.py must import live_view to route playback through the live seam"
    )
    assert any("demo_ui" in m for m in app_modules), (
        "app.py must compose the live model via demo_ui.build_model"
    )
    assert any("model_modules" in m for m in demo_ui_modules), (
        "demo_ui.py must import the pose model-module to compose the live model"
    )
    assert any("seam" in m for m in live_view_modules), (
        "live_view.py must import seam types (Frame/FrameSource/ModelModule)"
    )


def _imported_modules(source_path: Path) -> set[str]:
    tree = ast.parse(source_path.read_text())
    return {
        node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module
    }


def test_show_boxes_and_show_pose_toggle_independently() -> None:
    """Each of the four (show_boxes, show_pose) combinations renders distinctly."""
    frame = np.zeros((96, 128, 3), dtype=np.uint8)
    pose = _empty_pose()
    pose[5] = (20, 20, 0.95)
    pose[7] = (20, 38, 0.95)
    result = DetectionResult(
        boxes=(BoundingBox(x1=12, y1=12, x2=64, y2=64, confidence=0.9),),
        labels=(DetectionLabel(text="person", confidence=0.9, is_fall=False),),
        keypoints=(tuple(pose),),
    )

    both_off = render_yolo_overlay(frame=frame, result=result, show_boxes=False, show_pose=False)
    boxes_only = render_yolo_overlay(frame=frame, result=result, show_boxes=True, show_pose=False)
    pose_only = render_yolo_overlay(frame=frame, result=result, show_boxes=False, show_pose=True)
    both_on = render_yolo_overlay(frame=frame, result=result, show_boxes=True, show_pose=True)

    # Both off → untouched copy of the input frame.
    assert np.array_equal(both_off, frame)
    # The box top edge paints only when show_boxes is on.
    assert np.count_nonzero(boxes_only[12, 12:64]) > 0
    assert np.count_nonzero(pose_only[12, 12:64]) == 0
    # The pose segment paints only when show_pose is on.
    assert np.count_nonzero(pose_only[20:38, 20]) > 0
    assert np.count_nonzero(boxes_only[20:38, 20]) == 0
    # Both on differs from either single overlay.
    assert not np.array_equal(both_on, boxes_only)
    assert not np.array_equal(both_on, pose_only)


def test_render_yolo_overlay_accepts_detection_result() -> None:
    """render_yolo_overlay signature must accept DetectionResult (seam type)."""
    import inspect

    from demo.yolo_overlay import render_yolo_overlay as fn

    sig = inspect.signature(fn)
    assert "result" in sig.parameters, (
        "render_yolo_overlay must have a 'result: DetectionResult' parameter"
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _result_with_box(label: str, is_fall: bool) -> DetectionResult:
    return DetectionResult(
        boxes=(BoundingBox(x1=12, y1=12, x2=64, y2=64, confidence=0.9),),
        labels=(DetectionLabel(text=label, confidence=0.9, is_fall=is_fall),),
    )


def _empty_pose() -> list[tuple[int, int, float]]:
    return [(0, 0, 0.0)] * 17
