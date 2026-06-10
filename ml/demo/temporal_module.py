"""Temporal fall-classifier adapter for the Streamlit demo.

Bridges the training-pipeline models (RF / LSTM / Transformer) into the
ModelModule protocol so live_view.py can drive them identically to the
rule-based path — no change to the frame-intake or overlay layer.

Lazy-import policy
------------------
Model classes (RandomForestFallClassifier, LstmFallClassifier,
TransformerFallClassifier) import sklearn/torch at *their* module level.
They are imported ONLY inside ``build_temporal_model`` so that this module
and all callers that only need ``TEMPORAL_MODEL_KEYS`` /
``temporal_artifact_available`` remain importable without those heavy deps.

``normalize_person_keypoints`` is imported lazily inside ``predict`` because
its module (training.extract_poses) brings in cv2 via demo.model_modules —
keeping the cv2 requirement scoped to the hot path rather than import time.
"""

from __future__ import annotations

from collections import deque
from typing import Final

import numpy as np
from numpy.typing import NDArray

from demo.seam import DetectionLabel, DetectionResult, Frame, ModelModule
from training import config
from training.data.features import extract_window_features
from training.metadata import artifact_dir, load_metadata

# ---------------------------------------------------------------------------
# Public constants
# ---------------------------------------------------------------------------

TEMPORAL_MODEL_KEYS: Final[tuple[str, ...]] = ("random_forest", "lstm", "transformer")

_KEY_TO_MODE: Final[dict[str, str]] = {
    "random_forest": "features",
    "lstm": "sequence",
    "transformer": "sequence",
}

# The demo exposes the public key ``random_forest`` for UI clarity, but the
# training pipeline (train.py / evaluate.py / artifact_dir) saves the Random
# Forest artifact under the short key ``rf``.  Resolve the demo key to the
# on-disk artifact key here so availability probes and the factory both find it.
_KEY_TO_ARTIFACT: Final[dict[str, str]] = {
    "random_forest": "rf",
    "lstm": "lstm",
    "transformer": "transformer",
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


def build_temporal_model(key: str, pose_module: ModelModule) -> TemporalFallClassifierModule:
    """Load a trained temporal model and wrap it in a TemporalFallClassifierModule.

    Model classes are imported lazily here so that importing this module at the
    top of app.py / classifiers.py does not pull in torch or sklearn.

    Raises
    ------
    FileNotFoundError
        When the trained artifact directory / metadata.json is absent.
    ValueError
        When *key* is not in TEMPORAL_MODEL_KEYS.
    """
    # === 단계 1: 데모 키 → 아티팩트 키 매핑 후 아티팩트 디렉터리 결정 ===
    adir = artifact_dir(_KEY_TO_ARTIFACT.get(key, key))
    if not (adir / "metadata.json").exists():
        raise FileNotFoundError(
            f"No trained artifact for {key!r} found at {adir}. "
            "Run `uv run --group training python -m training.train` to produce one."
        )
    # === 단계 2: metadata.json 로드 (window / stride / operating_threshold) ===
    meta = load_metadata(adir)

    # === 단계 3: 모델 클래스 지연 임포트 & 저장된 가중치 로드 ===
    # Lazy import — avoids torch/sklearn at module level.
    if key == "random_forest":
        from training.models.rf import RandomForestFallClassifier

        model = RandomForestFallClassifier.load(adir)
    elif key == "lstm":
        from training.models.lstm import LstmFallClassifier

        model = LstmFallClassifier.load(adir)
    elif key == "transformer":
        from training.models.transformer import TransformerFallClassifier

        model = TransformerFallClassifier.load(adir)
    else:
        raise ValueError(
            f"Unknown temporal model key {key!r}; expected one of {TEMPORAL_MODEL_KEYS}"
        )

    # === 단계 4: TemporalFallClassifierModule로 래핑 후 반환 ===
    return TemporalFallClassifierModule(
        pose_module=pose_module,
        model=model,
        mode=_KEY_TO_MODE[key],
        window=meta.window,
        stride=meta.stride,
        operating_threshold=meta.operating_threshold,
    )


# ---------------------------------------------------------------------------
# ModelModule implementation
# ---------------------------------------------------------------------------


class TemporalFallClassifierModule:
    """ModelModule wrapping a temporal fall classifier (RF / LSTM / Transformer).

    Maintains a rolling ring buffer of *window* normalised float32[17, 3]
    keypoint frames.  Inference is triggered every *stride* frames once the
    buffer is full.  The overlay label is "낙상" on a fall, "정상" otherwise.

    Anti-skew: live keypoints are normalised with ``normalize_person_keypoints``
    from ``training.extract_poses`` — the *same* function used by the training
    pipeline — so pixel → [0, 1] conversion and confidence-gating are identical
    between training and serving.
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
        # Ring buffer of float32[17, 3] frames; maxlen enforces the window size.
        self._buf: deque[NDArray[np.float32]] = deque(maxlen=window)
        self._frame_counter: int = 0
        self._last_prob: float = 0.0  # held between inference calls

    def predict(self, frame: Frame) -> DetectionResult:
        """Run pose, buffer normalised keypoints, infer when due, emit label.

        Returns an empty DetectionResult when no person is detected (the buffer
        still receives zeros from the normalisation helper so the window stays
        temporally consistent).
        """
        # Lazy import: avoids pulling cv2 (via training.extract_poses) at module
        # import time — safe to do here because Python caches the module after
        # the first call.
        from training.extract_poses import normalize_person_keypoints

        # === 단계 1: 입력 프레임에서 YOLO 포즈 추론(pose_module) → COCO-17 키포인트 추출 ===
        pose = self._pose.predict(frame)
        frame_h, frame_w = frame.image.shape[:2]

        # === 단계 2: 학습과 동일한 normalize_person_keypoints로 정규화 (train↔serve 스큐 방지) ===
        # CRITICAL anti-skew: same normalisation as the training pipeline.
        # normalize_person_keypoints picks person[0] from pose.keypoints (the
        # same PoseDetections tuple that YoloPoseRunner.predict_full returns),
        # divides x/y by frame_w/frame_h, and zeros out keypoints below
        # CONF_THRESHOLD — exactly as extract_poses._extract_clip does in batch.
        kpt: NDArray[np.float32] = normalize_person_keypoints(
            pose.keypoints, frame_w, frame_h, config.CONF_THRESHOLD
        )
        # === 단계 3: 정규화된 프레임을 링버퍼(maxlen=window)에 누적 ===
        self._buf.append(kpt)
        self._frame_counter += 1

        # === 단계 4: stride 프레임마다 & 버퍼가 가득 찼을 때만 추론 트리거 ===
        # Trigger inference once buffer is full and the stride counter fires.
        if len(self._buf) == self._window and self._frame_counter % self._stride == 0:
            win: NDArray[np.float32] = np.stack(list(self._buf), axis=0)  # [W, 17, 3]
            # === 단계 5: 모드별 윈도우 구성 (features=특징벡터 / sequence=키포인트 시퀀스) ===
            if self._mode == "features":
                X = extract_window_features(win)[np.newaxis, :]  # [1, 45]
            else:  # "sequence"
                X = win.reshape(1, self._window, 51)  # [1, W, 17*3]
            # === 단계 6: model.predict_proba로 낙상 확률 계산 ===
            self._last_prob = float(self._model.predict_proba(X)[0, 1])  # type: ignore[union-attr]

        # === 단계 7: operating_threshold와 비교 → 낙상이면 "낙상" 빨간 박스, 아니면 "정상" ===
        prob = self._last_prob
        is_fall = prob >= self._operating_threshold
        label_text = "낙상" if is_fall else "정상"

        if not pose.boxes:
            # No person detected — return nothing to paint; buffer already updated.
            return DetectionResult()

        out_box = pose.boxes[0]
        out_kpts = (pose.keypoints[0],) if pose.keypoints else ()
        return DetectionResult(
            boxes=(out_box,),
            labels=(DetectionLabel(text=label_text, confidence=prob, is_fall=is_fall),),
            keypoints=out_kpts,
        )
