from __future__ import annotations

from core.contract import BoundingBox, DetectionResult
from core.features import FrameFeatures, extract_frame_features


def _box(x1: int, y1: int, x2: int, y2: int) -> BoundingBox:
    return BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=0.9)


def _kpts_17(
    shoulder_y: int = 100,
    hip_y: int = 200,
    conf: float = 0.9,
) -> tuple[tuple[int, int, float], ...]:
    """Build a 17-keypoint tuple with only shoulders (5,6) and hips (11,12) set."""
    kpts: list[tuple[int, int, float]] = [(0, 0, 0.0)] * 17
    kpts[5] = (50, shoulder_y, conf)
    kpts[6] = (60, shoulder_y, conf)
    kpts[11] = (50, hip_y, conf)
    kpts[12] = (60, hip_y, conf)
    return tuple(kpts)


class TestExtractFrameFeatures:
    def test_empty_result_returns_no_person(self) -> None:
        result = extract_frame_features(DetectionResult(), 480, 640)
        assert result == FrameFeatures(
            has_person=False,
            aspect_ratio=0.0,
            vertical_center=0.0,
            box_height_ratio=0.0,
            torso_vertical=0.0,
        )

    def test_lying_box_wide_aspect_and_low_vertical_center(self) -> None:
        # w=100, h=40 → aspect=2.5 > 1;  center_y=400 in 480 → vc=0.833 > 0.55
        b = _box(100, 380, 200, 420)
        result = extract_frame_features(DetectionResult(boxes=(b,)), 480, 640)
        assert result.has_person is True
        assert result.aspect_ratio > 1.0
        assert result.vertical_center > 0.55

    def test_standing_box_tall_aspect_and_mid_vertical_center(self) -> None:
        # w=40, h=160 → aspect=0.25 < 1;  center_y=200 in 480 → vc=0.417
        b = _box(100, 120, 140, 280)
        result = extract_frame_features(DetectionResult(boxes=(b,)), 480, 640)
        assert result.has_person is True
        assert result.aspect_ratio < 1.0
        assert result.vertical_center < 0.55

    def test_largest_area_box_chosen_as_primary(self) -> None:
        small = _box(0, 0, 10, 10)  # area 100
        large = _box(50, 50, 200, 200)  # area 22 500
        result = extract_frame_features(DetectionResult(boxes=(small, large)), 480, 640)
        expected_ar = (200 - 50) / (200 - 50)  # 1.0
        assert abs(result.aspect_ratio - expected_ar) < 1e-6

    def test_box_height_ratio_normalised_by_frame_height(self) -> None:
        b = _box(0, 0, 100, 96)  # h=96
        result = extract_frame_features(DetectionResult(boxes=(b,)), 480, 640)
        assert abs(result.box_height_ratio - 96 / 480) < 1e-6

    def test_torso_vertical_computed_from_high_conf_keypoints(self) -> None:
        b = _box(0, 0, 200, 300)
        kpts = _kpts_17(shoulder_y=80, hip_y=200, conf=0.9)
        result = extract_frame_features(DetectionResult(boxes=(b,), keypoints=(kpts,)), 480, 640)
        expected = abs(80 - 200) / 480
        assert abs(result.torso_vertical - expected) < 1e-6

    def test_low_conf_keypoints_ignored_gives_zero_torso(self) -> None:
        b = _box(0, 0, 200, 300)
        # shoulders at conf=0.1 (below threshold); hips high conf but no shoulders → insufficient
        kpts = _kpts_17(shoulder_y=80, hip_y=200, conf=0.1)
        result = extract_frame_features(DetectionResult(boxes=(b,), keypoints=(kpts,)), 480, 640)
        assert result.torso_vertical == 0.0
        assert result.has_person is True

    def test_missing_keypoints_entry_gives_zero_torso(self) -> None:
        b = _box(0, 0, 200, 300)
        # keypoints tuple is empty — no entry for index 0
        result = extract_frame_features(DetectionResult(boxes=(b,), keypoints=()), 480, 640)
        assert result.torso_vertical == 0.0
        assert result.has_person is True

    def test_degenerate_frame_height_zero_returns_no_person(self) -> None:
        b = _box(0, 0, 100, 200)
        result = extract_frame_features(DetectionResult(boxes=(b,)), 0, 640)
        assert result.has_person is False

    def test_keypoints_aligned_with_largest_box_index(self) -> None:
        # Two boxes: index 0 is small, index 1 is large (primary).
        # keypoints[1] has recognisable shoulder/hip values.
        small = _box(0, 0, 10, 10)
        large = _box(0, 100, 200, 300)
        kpts_small = _kpts_17(shoulder_y=5, hip_y=8, conf=0.9)
        kpts_large = _kpts_17(shoulder_y=120, hip_y=260, conf=0.9)
        result = extract_frame_features(
            DetectionResult(boxes=(small, large), keypoints=(kpts_small, kpts_large)),
            480,
            640,
        )
        expected = abs(120 - 260) / 480
        assert abs(result.torso_vertical - expected) < 1e-6
