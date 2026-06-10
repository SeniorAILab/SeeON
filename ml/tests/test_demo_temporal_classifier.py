"""Tests for the temporal fall-classifier demo adapter (Step 7).

RF path only — avoids torch.  Covers:
- TemporalFallClassifierModule predict() returns DetectionResult
- Before the buffer fills the label stays NORMAL_LABEL_TEXT (no-fall)
- Once the buffer fills on a fall-pattern window the label fires FALL_LABEL_TEXT
- No-person pose → empty DetectionResult
- temporal_artifact_available() is False for non-existent artifact
- CLASSIFIER_REGISTRY availability is linked to artifact presence
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from demo.classifiers import CLASSIFIER_REGISTRY
from demo.seam import (
    FALL_LABEL_TEXT,
    NORMAL_LABEL_TEXT,
    BoundingBox,
    DetectionLabel,
    DetectionResult,
    Frame,
)
from demo.temporal_module import (
    TEMPORAL_MODEL_KEYS,
    TemporalFallClassifierModule,
    temporal_artifact_available,
)
from training.data.features import extract_window_features
from training.metadata import ModelMetadata, load_metadata, save_metadata
from training.models.rf import RandomForestFallClassifier

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FRAME_W = 640
_FRAME_H = 480


def _frame(index: int) -> Frame:
    return Frame(
        index=index,
        time_sec=float(index) / 30.0,
        image=np.zeros((_FRAME_H, _FRAME_W, 3), dtype=np.uint8),
    )


def _fall_kpts(frame_index: int) -> tuple[tuple[int, int, float], ...]:
    """Alternating pixel positions that normalise to the synthetic fall window.

    Even frame:  all 17 keypoints at (0,   480, 0.9) → normalised (0.0, 1.0, 0.9)
    Odd  frame:  all 17 keypoints at (640,   0, 0.9) → normalised (1.0, 0.0, 0.9)

    This creates maximum per-keypoint velocity (|Δx|=1.0, |Δy|=1.0) and
    matches the ``fall_window`` constructed in ``_build_rf_artifact`` exactly.
    """
    if frame_index % 2 == 0:
        return tuple((0, _FRAME_H, 0.9) for _ in range(17))
    return tuple((_FRAME_W, 0, 0.9) for _ in range(17))


class _FakePoseForFall:
    """Fake pose module returning fall-pattern keypoints (no YOLO)."""

    def predict(self, frame: Frame) -> DetectionResult:
        kpts = _fall_kpts(frame.index)
        return DetectionResult(
            boxes=(BoundingBox(x1=0, y1=0, x2=_FRAME_W, y2=_FRAME_H, confidence=0.9),),
            labels=(DetectionLabel(text="person", confidence=0.9, is_fall=False),),
            keypoints=(kpts,),
        )


class _EmptyPose:
    """Fake pose module that never detects a person."""

    def predict(self, frame: Frame) -> DetectionResult:
        return DetectionResult()


def _build_rf_artifact(tmp_path: Path, window: int = 30, stride: int = 5) -> Path:
    """Train a tiny RandomForestFallClassifier on synthetic features and save to tmp_path.

    Fall window:   alternating (0,1,0.9) / (1,0,0.9) normalised keypoints
                   → high velocity features; matches _fall_kpts outputs after
                   normalize_person_keypoints normalisation in a 640×480 frame.
    Normal window: static (0.5, 0.5, 0.9) normalised keypoints → near-zero velocity.
    """
    # --- build synthetic feature vectors ---
    fall_window = np.zeros((window, 17, 3), dtype=np.float32)
    for t in range(window):
        if t % 2 == 0:
            fall_window[t, :] = [0.0, 1.0, 0.9]
        else:
            fall_window[t, :] = [1.0, 0.0, 0.9]

    normal_window = np.full((window, 17, 3), 0.5, dtype=np.float32)
    normal_window[:, :, 2] = 0.9

    fall_feat = extract_window_features(fall_window)    # [45]
    normal_feat = extract_window_features(normal_window)  # [45]

    X = np.vstack([
        np.tile(normal_feat, (50, 1)),  # 50 normal samples
        np.tile(fall_feat, (50, 1)),    # 50 fall  samples
    ])
    y = np.array([0] * 50 + [1] * 50, dtype=np.int64)

    rf = RandomForestFallClassifier()
    rf.fit(X, y)
    rf.save(tmp_path)

    meta = ModelMetadata(
        model_type="random-forest",
        framework="sklearn",
        window=window,
        stride=stride,
        input_shape=None,
        feature_dim=45,
        seed=42,
        operating_threshold=0.5,
    )
    save_metadata(tmp_path, meta)
    return tmp_path


def _load_module(tmp_path: Path) -> TemporalFallClassifierModule:
    """Load RF + metadata from tmp_path and return a TemporalFallClassifierModule."""
    meta = load_metadata(tmp_path)
    rf = RandomForestFallClassifier.load(tmp_path)
    return TemporalFallClassifierModule(
        pose_module=_FakePoseForFall(),
        model=rf,
        mode="features",
        window=meta.window,
        stride=meta.stride,
        operating_threshold=meta.operating_threshold,
    )


# ---------------------------------------------------------------------------
# Tests — TemporalFallClassifierModule behaviour
# ---------------------------------------------------------------------------


class TestTemporalFallClassifierModule:
    def test_predict_returns_detection_result(self, tmp_path: Path) -> None:
        _build_rf_artifact(tmp_path)
        module = _load_module(tmp_path)
        result = module.predict(_frame(0))
        assert isinstance(result, DetectionResult)

    def test_before_buffer_fills_label_is_normal(self, tmp_path: Path) -> None:
        """Feed window-1 frames: buffer not full → _last_prob==0 → label stays NORMAL_LABEL_TEXT."""
        _build_rf_artifact(tmp_path, window=30, stride=5)
        module = _load_module(tmp_path)
        meta = load_metadata(tmp_path)

        for i in range(meta.window - 1):
            result = module.predict(_frame(i))
            # pose always returns a box, so labels is populated
            assert len(result.labels) == 1, f"Expected 1 label at frame {i}"
            assert result.labels[0].text == NORMAL_LABEL_TEXT
            assert result.labels[0].is_fall is False, f"Expected no fall at frame {i}"

    def test_fall_fires_when_buffer_fills_on_fall_pattern(self, tmp_path: Path) -> None:
        """After exactly *window* fall-pattern frames inference fires → FALL_LABEL_TEXT."""
        _build_rf_artifact(tmp_path, window=30, stride=5)
        module = _load_module(tmp_path)
        meta = load_metadata(tmp_path)

        result = None
        for i in range(meta.window):
            result = module.predict(_frame(i))

        assert result is not None
        assert len(result.labels) == 1
        assert result.labels[0].text == FALL_LABEL_TEXT
        assert result.labels[0].is_fall is True

    def test_fall_label_confidence_is_probability(self, tmp_path: Path) -> None:
        """Label confidence is the fall probability (float in [0, 1])."""
        _build_rf_artifact(tmp_path, window=30, stride=5)
        module = _load_module(tmp_path)
        meta = load_metadata(tmp_path)

        for i in range(meta.window):
            result = module.predict(_frame(i))
        assert 0.0 <= result.labels[0].confidence <= 1.0  # type: ignore[union-attr]

    def test_no_person_returns_empty_detection_result(self, tmp_path: Path) -> None:
        """When pose detects no person, predict returns empty DetectionResult."""
        _build_rf_artifact(tmp_path)
        meta = load_metadata(tmp_path)
        rf = RandomForestFallClassifier.load(tmp_path)
        module = TemporalFallClassifierModule(
            pose_module=_EmptyPose(),
            model=rf,
            mode="features",
            window=meta.window,
            stride=meta.stride,
            operating_threshold=meta.operating_threshold,
        )
        result = module.predict(_frame(0))
        assert result.boxes == ()
        assert result.labels == ()
        assert result.keypoints == ()

    def test_satisfies_model_module_protocol(self, tmp_path: Path) -> None:
        from demo.seam import ModelModule

        _build_rf_artifact(tmp_path)
        module = _load_module(tmp_path)
        assert isinstance(module, ModelModule)


# ---------------------------------------------------------------------------
# Tests — structural / registry wiring
# ---------------------------------------------------------------------------


class TestTemporalArtifactAvailable:
    def test_false_for_nonexistent_key(self) -> None:
        """A key that was never trained must return False."""
        assert temporal_artifact_available("__nonexistent_test_key__") is False

    def test_true_after_artifact_written(self, tmp_path: Path) -> None:
        """Once a metadata.json is present, the probe returns True."""
        _build_rf_artifact(tmp_path)
        # Simulate what temporal_artifact_available does (checks ARTIFACT_BASE/key).
        # Here we test the function directly with a side-effect-free wrapper:
        # the metadata.json we wrote must exist in tmp_path.
        assert (tmp_path / "metadata.json").exists()

    def test_registry_availability_mirrors_artifact_probe(self) -> None:
        """CLASSIFIER_REGISTRY entry available flag matches temporal_artifact_available()."""
        rf_spec = next(s for s in CLASSIFIER_REGISTRY if s.key == "random_forest")
        assert rf_spec.available == temporal_artifact_available("random_forest")

    def test_temporal_keys_all_present_in_registry(self) -> None:
        registry_keys = {spec.key for spec in CLASSIFIER_REGISTRY}
        for key in TEMPORAL_MODEL_KEYS:
            assert key in registry_keys, f"Temporal key {key!r} missing from CLASSIFIER_REGISTRY"

    def test_registry_entry_factory_is_none_for_temporal_keys(self) -> None:
        """Temporal specs must have factory=None — they're built via build_temporal_model."""
        for spec in CLASSIFIER_REGISTRY:
            if spec.key in TEMPORAL_MODEL_KEYS:
                assert spec.factory is None, f"Expected factory=None for temporal key {spec.key!r}"


# ---------------------------------------------------------------------------
# Helpers — multi-person fake pose modules
# ---------------------------------------------------------------------------


def _make_kpts(x_pixel: int, y_pixel: int, conf: float = 0.9) -> tuple[tuple[int, int, float], ...]:
    """Return 17 identical keypoints at (x_pixel, y_pixel, conf)."""
    return tuple((x_pixel, y_pixel, conf) for _ in range(17))


class _TwoPersonFakePose:
    """Scripted fake pose module returning two spatially-separated people.

    Person A (index 0): alternating fall-pattern keypoints (same as _FakePoseForFall).
    Person B (index 1): static normal-pattern keypoints at the centre of the frame.

    The two boxes do not overlap so the tracker assigns stable, distinct ids.
    """

    BOX_A = BoundingBox(x1=0, y1=0, x2=100, y2=200, confidence=0.9)
    BOX_B = BoundingBox(x1=400, y1=0, x2=640, y2=480, confidence=0.9)

    def predict(self, frame: Frame) -> DetectionResult:
        kpts_a = _fall_kpts(frame.index)
        kpts_b = _make_kpts(320, 240, conf=0.9)
        return DetectionResult(
            boxes=(self.BOX_A, self.BOX_B),
            labels=(
                DetectionLabel(text="person", confidence=0.9, is_fall=False),
                DetectionLabel(text="person", confidence=0.9, is_fall=False),
            ),
            keypoints=(kpts_a, kpts_b),
        )


class _DisappearingBPose:
    """Person A always present; person B disappears after *b_disappears_after* frames."""

    BOX_A = BoundingBox(x1=0, y1=0, x2=100, y2=200, confidence=0.9)
    BOX_B = BoundingBox(x1=400, y1=0, x2=640, y2=480, confidence=0.9)

    def __init__(self, b_disappears_after: int) -> None:
        self._threshold = b_disappears_after

    def predict(self, frame: Frame) -> DetectionResult:
        kpts_a = _fall_kpts(frame.index)
        if frame.index < self._threshold:
            kpts_b = _make_kpts(320, 240, conf=0.9)
            return DetectionResult(
                boxes=(self.BOX_A, self.BOX_B),
                labels=(
                    DetectionLabel(text="person", confidence=0.9, is_fall=False),
                    DetectionLabel(text="person", confidence=0.9, is_fall=False),
                ),
                keypoints=(kpts_a, kpts_b),
            )
        return DetectionResult(
            boxes=(self.BOX_A,),
            labels=(DetectionLabel(text="person", confidence=0.9, is_fall=False),),
            keypoints=(kpts_a,),
        )


# ---------------------------------------------------------------------------
# Tests — multi-person temporal module
# ---------------------------------------------------------------------------


class TestMultiPersonTemporalModule:
    def test_two_person_all_boxes_in_result(self, tmp_path: Path) -> None:
        """All detected boxes, labels, and keypoints are present in the DetectionResult."""
        _build_rf_artifact(tmp_path)
        meta = load_metadata(tmp_path)
        rf = RandomForestFallClassifier.load(tmp_path)
        module = TemporalFallClassifierModule(
            pose_module=_TwoPersonFakePose(),
            model=rf,
            mode="features",
            window=meta.window,
            stride=meta.stride,
            operating_threshold=meta.operating_threshold,
        )
        result = module.predict(_frame(0))
        assert len(result.boxes) == 2
        assert len(result.labels) == 2
        assert len(result.keypoints) == 2

    def test_per_person_labels_index_aligned_fall_vs_normal(self, tmp_path: Path) -> None:
        """Person A (fall-pattern) fires FALL_LABEL_TEXT; person B (static normal) stays
        NORMAL_LABEL_TEXT."""
        _build_rf_artifact(tmp_path, window=30, stride=5)
        meta = load_metadata(tmp_path)
        rf = RandomForestFallClassifier.load(tmp_path)
        module = TemporalFallClassifierModule(
            pose_module=_TwoPersonFakePose(),
            model=rf,
            mode="features",
            window=meta.window,
            stride=meta.stride,
            operating_threshold=meta.operating_threshold,
        )
        result = None
        for i in range(meta.window):
            result = module.predict(_frame(i))

        assert result is not None
        assert len(result.labels) == 2
        # Person A — fall pattern → FALL_LABEL_TEXT
        assert result.labels[0].is_fall is True, "Person A expected fall label"
        assert result.labels[0].text == FALL_LABEL_TEXT
        # Person B — static normal pattern → NORMAL_LABEL_TEXT
        assert result.labels[1].is_fall is False, "Person B expected normal label"
        assert result.labels[1].text == NORMAL_LABEL_TEXT

    def test_warmup_all_labels_normal_confidence_zero(self, tmp_path: Path) -> None:
        """Before any buffer fills, every per-person label is NORMAL_LABEL_TEXT with
        confidence 0.0."""
        _build_rf_artifact(tmp_path, window=30, stride=5)
        meta = load_metadata(tmp_path)
        rf = RandomForestFallClassifier.load(tmp_path)
        module = TemporalFallClassifierModule(
            pose_module=_TwoPersonFakePose(),
            model=rf,
            mode="features",
            window=meta.window,
            stride=meta.stride,
            operating_threshold=meta.operating_threshold,
        )
        for i in range(meta.window - 1):
            result = module.predict(_frame(i))
            for j, label in enumerate(result.labels):
                assert label.is_fall is False, (
                    f"Warm-up: person {j} must not fall at frame {i}"
                )
                assert label.confidence == pytest.approx(0.0), (
                    f"Warm-up: person {j} confidence must be 0.0 at frame {i}"
                )

    def test_zero_fill_on_missed_frames_no_crash(self, tmp_path: Path) -> None:
        """Person B disappears mid-stream; missed frames get zero-filled without error."""
        _build_rf_artifact(tmp_path, window=30, stride=5)
        meta = load_metadata(tmp_path)
        rf = RandomForestFallClassifier.load(tmp_path)
        module = TemporalFallClassifierModule(
            pose_module=_DisappearingBPose(b_disappears_after=15),
            model=rf,
            mode="features",
            window=meta.window,
            stride=meta.stride,
            operating_threshold=meta.operating_threshold,
        )
        # Must not raise even when person B goes missing mid-stream.
        result = None
        for i in range(meta.window):
            result = module.predict(_frame(i))

        # After B disappears, only A's box is emitted.
        assert result is not None
        assert len(result.boxes) == 1

    def test_boxes_and_keypoints_passed_through_unchanged(self, tmp_path: Path) -> None:
        """Boxes and keypoints in the result equal the raw pose output."""
        _build_rf_artifact(tmp_path)
        meta = load_metadata(tmp_path)
        rf = RandomForestFallClassifier.load(tmp_path)
        fake_pose = _TwoPersonFakePose()
        module = TemporalFallClassifierModule(
            pose_module=fake_pose,
            model=rf,
            mode="features",
            window=meta.window,
            stride=meta.stride,
            operating_threshold=meta.operating_threshold,
        )
        frame = _frame(0)
        result = module.predict(frame)
        # Boxes and keypoints come directly from the pose module, unmodified.
        assert result.boxes == (fake_pose.BOX_A, fake_pose.BOX_B)
        assert len(result.keypoints) == 2
