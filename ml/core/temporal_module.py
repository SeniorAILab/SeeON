"""Temporal fall-classifier adapter for the Streamlit demo.

Bridges every training-pipeline model family (``training.models.catalog``)
into the ModelModule protocol so live_view.py can drive them identically to
the rule-based path — no change to the frame-intake or overlay layer.

The key set, feature mode, and artifact location all derive from CATALOG:
a family whose artifact exists on disk is exposed automatically — training
finishes, the next Streamlit run lists it. No demo edits per family.

Lazy-import policy
------------------
Model classes import sklearn/torch at *their* module level. They are loaded
ONLY inside ``build_temporal_model`` (via ``catalog.load_model_class``) so
that this module and all callers that only need ``TEMPORAL_MODEL_KEYS`` /
``temporal_artifact_available`` remain importable without those heavy deps.

``normalize_person_keypoints`` is imported lazily inside ``predict`` because
its module (training.extract_poses) brings in cv2 via core.model_modules —
keeping the cv2 requirement scoped to the hot path rather than import time.
"""

from __future__ import annotations

from collections import deque
from typing import Final

import numpy as np
from numpy.typing import NDArray

from core.contract import (
    FALL_LABEL_TEXT,
    NORMAL_LABEL_TEXT,
    DetectionLabel,
    Frame,
    FrameObservation,
    ModelModule,
)
from core.tracking import GreedyIouTracker
from training import config
from training.data.features import extract_window_features
from training.metadata import artifact_dir, load_metadata
from training.models.catalog import CATALOG

# ---------------------------------------------------------------------------
# Public constants — derived from the model catalog (import-light)
# ---------------------------------------------------------------------------

# The demo exposes underscore keys (UI-friendly, e.g. ``random_forest``) while
# the training pipeline (train.py / evaluate.py / artifact_dir) saves artifacts
# under the kebab catalog key (e.g. ``random-forest``, ADR-015). The mapping is
# mechanical so every CATALOG family is exposed without a demo-side edit.
_KEY_TO_ARTIFACT: Final[dict[str, str]] = {key.replace("-", "_"): key for key in CATALOG}

TEMPORAL_MODEL_KEYS: Final[tuple[str, ...]] = tuple(_KEY_TO_ARTIFACT)

_KEY_TO_MODE: Final[dict[str, str]] = {
    demo_key: CATALOG[artifact_key].mode for demo_key, artifact_key in _KEY_TO_ARTIFACT.items()
}


# ---------------------------------------------------------------------------
# Availability probe — cheap, pathlib-only
# ---------------------------------------------------------------------------


def temporal_artifact_available(key: str) -> bool:
    """Return True iff a trained artifact for *key* is present on disk.

    Intentionally cheap: only pathlib + training.config/metadata, no torch
    import, so it is safe to call at module level during registry construction.
    """
    return (artifact_dir(_KEY_TO_ARTIFACT.get(key, key)) / "metadata.json").exists()


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def build_temporal_model(
    key: str,
    pose_module: ModelModule,
    threshold_override: float | None = None,
) -> TemporalFallClassifierModule:
    """Build a temporal demo classifier backed by real serving HTTP.

    Model artifacts still provide window/stride/threshold metadata, but the
    classifier object is `ServingFallClassifier`; it posts `[W][51]` windows to
    ml-serving instead of loading an in-process model. ``threshold_override``,
    when given, replaces the artifact's LE2I ``operating_threshold`` (demo
    threshold slider).

    Raises
    ------
    FileNotFoundError
        When the trained artifact directory / metadata.json is absent.
    ValueError
        When *key* is not in TEMPORAL_MODEL_KEYS.
    """
    # === 단계 1: 데모 키 → 아티팩트 키 매핑 후 아티팩트 디렉터리 결정 ===
    if key not in _KEY_TO_ARTIFACT:
        raise ValueError(
            f"Unknown temporal model key {key!r}; expected one of {TEMPORAL_MODEL_KEYS}"
        )
    artifact_key = _KEY_TO_ARTIFACT[key]
    adir = artifact_dir(artifact_key)
    if not (adir / "metadata.json").exists():
        raise FileNotFoundError(
            f"No trained artifact for {key!r} found at {adir}. "
            "Run `uv run --group training python -m training.train` to produce one."
        )
    # === 단계 2: metadata.json 로드 (window / stride / operating_threshold) ===
    # window/stride/threshold come from the shared artifact even in serving mode:
    # the demo and serving point at the same ml/models dir, so these match
    # serving's configured model — the demo only needs them to buffer correctly.
    meta = load_metadata(adir)

    # === 단계 3: 모델 — serving HTTP only ===
    # ADR-029 / streamlit-demo §8: the fall decision runs through the real
    # serving service. The demo emits the raw [W][51] window (mode="sequence");
    # serving owns feature extraction + the decision.
    from core.serving_client import ServingFallClassifier, serving_url_from_env

    serving_url = serving_url_from_env()
    if serving_url is None:
        raise RuntimeError(
            "FALL_SERVING_URL is required for temporal demo classification; "
            "the demo must use serving.client.ServingFallClassifier, not an in-process fallback"
        )
    model: object = ServingFallClassifier(serving_url)
    mode = "sequence"

    # === 단계 4: TemporalFallClassifierModule로 래핑 후 반환 ===
    return TemporalFallClassifierModule(
        pose_module=pose_module,
        model=model,
        mode=mode,
        window=meta.window,
        stride=meta.stride,
        operating_threshold=(
            meta.operating_threshold if threshold_override is None else threshold_override
        ),
    )


# ---------------------------------------------------------------------------
# ModelModule implementation
# ---------------------------------------------------------------------------


class TemporalFallClassifierModule:
    """ModelModule wrapping a temporal fall classifier (RF / LSTM / Transformer).

    Maintains per-track rolling ring buffers of *window* normalised float32[17, 3]
    keypoint frames.  Each person detected on screen has an independent buffer
    indexed by the track id assigned by ``GreedyIouTracker``.  Inference is
    triggered every *stride* frames for every track whose buffer is full.

    Anti-skew: live keypoints are normalised with ``normalize_person_keypoints``
    from ``training.extract_poses`` — the *same* function used by the training
    pipeline — so pixel → [0, 1] conversion and confidence-gating are identical
    between training and serving.  The 1-tuple call convention
    ``normalize_person_keypoints((keypoints[i],), ...)`` ensures person[0] of
    a 1-element tuple is exactly person i — no per-person index skew.

    Warm-up: a track's label stays NORMAL_LABEL_TEXT (confidence 0.0) until its
    first inference fires (buffer full + stride trigger).
    """

    def __init__(
        self,
        pose_module: ModelModule,
        model: object,
        mode: str,
        window: int,
        stride: int,
        operating_threshold: float,
    ) -> None:
        if stride <= 0 or window % stride != 0:
            raise ValueError(
                f"window ({window}) must be a positive multiple of stride ({stride}); "
                "otherwise the frame-counter trigger drifts out of phase with the buffer."
            )
        self._pose = pose_module
        self._model = model
        self._mode = mode  # "features" | "sequence"
        self._window = window
        self._stride = stride
        self._operating_threshold = operating_threshold
        # Per-track ring buffers: track_id → deque[float32[17, 3]], maxlen=window.
        self._buffers: dict[int, deque[NDArray[np.float32]]] = {}
        # Last inferred fall probability per track id.
        # Absent key ↔ warm-up: label is NORMAL_LABEL_TEXT, confidence 0.0.
        self._last_probs: dict[int, float] = {}
        self._tracker: GreedyIouTracker = GreedyIouTracker()
        self._frame_counter: int = 0

    def predict(self, frame: Frame) -> FrameObservation:
        """Run pose, update per-track buffers, infer when due, emit per-person labels.

        Returns an empty FrameObservation when no person is detected this frame.
        Missed (occluded) tracks still receive an all-zeros keypoint frame so
        their window stays temporally contiguous with the training convention.
        """
        # Lazy import: avoids pulling cv2 (via training.extract_poses) at module
        # import time — safe to do here because Python caches the module after
        # the first call.
        from training.extract_poses import normalize_person_keypoints

        # === 단계 1: 입력 프레임에서 YOLO 포즈 추론(pose_module) → COCO-17 키포인트 추출 ===
        pose = self._pose.predict(frame)
        frame_h, frame_w = frame.image.shape[:2]

        # === 단계 2: 그리디 IoU 트래커로 이번 프레임 박스 → 트랙 ID 매핑 ===
        track_ids = self._tracker.update(pose.boxes)
        live_ids = self._tracker.live_ids

        # === 단계 3: 검출된 각 사람에 대해 키포인트 정규화 후 해당 트랙 버퍼에 추가 ===
        # Pass a 1-tuple so normalize_person_keypoints picks person[0] of that
        # 1-tuple — same function as training pipeline, anti-skew preserved.
        active_ids: set[int] = set()
        for i, tid in enumerate(track_ids):
            active_ids.add(tid)
            if tid not in self._buffers:
                self._buffers[tid] = deque(maxlen=self._window)
            kpt: NDArray[np.float32] = normalize_person_keypoints(
                (pose.keypoints[i],), frame_w, frame_h, config.CONF_THRESHOLD
            )
            self._buffers[tid].append(kpt)

        # === 단계 4: 이번 프레임에 검출되지 않은 살아있는 트랙에 제로 프레임 추가 ===
        # Mirrors training's zero convention for missing detections so the window
        # stays temporally contiguous.
        missed_ids = live_ids - active_ids
        if missed_ids:
            zeros: NDArray[np.float32] = np.zeros(
                (config.N_KEYPOINTS, config.KPT_DIMS), dtype=np.float32
            )
            for tid in missed_ids:
                if tid not in self._buffers:
                    self._buffers[tid] = deque(maxlen=self._window)
                self._buffers[tid].append(zeros)

        # === 단계 5: 퇴출된 트랙의 버퍼 및 확률 삭제 ===
        evicted_ids = set(self._buffers.keys()) - live_ids
        for tid in evicted_ids:
            del self._buffers[tid]
            self._last_probs.pop(tid, None)

        self._frame_counter += 1

        # === 단계 6: stride 트리거 — 가득 찬 버퍼를 배치로 한 번만 추론 ===
        # Only tracks whose buffer is full (== window) participate in this batch.
        if self._frame_counter % self._stride == 0:
            due_ids = [tid for tid in self._buffers if len(self._buffers[tid]) == self._window]
            if due_ids:
                if self._mode == "features":
                    # [N, 45]
                    X: NDArray[np.float32] = np.stack(
                        [
                            extract_window_features(np.stack(list(self._buffers[tid]), axis=0))
                            for tid in due_ids
                        ],
                        axis=0,
                    )
                else:  # "sequence"
                    # [N, W, 51]
                    X = np.stack(
                        [
                            np.stack(list(self._buffers[tid]), axis=0).reshape(
                                self._window, config.KPT_VECTOR_DIM
                            )
                            for tid in due_ids
                        ],
                        axis=0,
                    )
                probs = self._model.predict_proba(X)[:, 1]  # type: ignore[union-attr]
                for j, tid in enumerate(due_ids):
                    self._last_probs[tid] = float(probs[j])

        # === 단계 7: 박스 없으면 빈 FrameObservation 반환 (버퍼는 이미 갱신됨) ===
        if not pose.boxes:
            return FrameObservation()

        # === 단계 8: 사람별 레이블 생성 → 전원 박스·키포인트와 함께 방출 ===
        labels: list[DetectionLabel] = []
        for tid in track_ids:
            prob = self._last_probs.get(tid, 0.0)
            is_fall = prob >= self._operating_threshold
            label_text = FALL_LABEL_TEXT if is_fall else NORMAL_LABEL_TEXT
            labels.append(DetectionLabel(text=label_text, confidence=prob, is_fall=is_fall))

        return FrameObservation(
            detections=(pose.boxes, tuple(labels)),
            poses=pose.keypoints,
            regions=(pose.bed_boxes, pose.bed_exit_statuses),
        )
