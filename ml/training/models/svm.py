"""SVM-based fall classifier.

Wraps ``sklearn.svm.SVC`` with ``probability=True`` (Platt scaling), balanced
class weights, and a fixed random state.  Input ``X`` is a 2-D feature matrix
[N, D]; ``predict_proba`` delegates to sklearn and returns [N, 2].

Conforms to :class:`~training.models.base.FallClassifier`.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from sklearn.svm import SVC

from training.config import SEED


class SvmFallClassifier:
    """Fall classifier backed by a Support Vector Machine (RBF kernel).

    Uses Platt calibration (``probability=True``) to produce well-calibrated
    probability estimates.  Conforms to the
    :class:`~training.models.base.FallClassifier` Protocol.
    """

    def __init__(self) -> None:
        self._clf = SVC(
            C=1.0,
            kernel="rbf",
            probability=True,
            class_weight="balanced",
            random_state=SEED,
        )

    # ------------------------------------------------------------------
    # FallClassifier Protocol
    # ------------------------------------------------------------------

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train on feature matrix *X* [N, D] with binary labels *y* [N]."""
        # 파이프라인 역할: 윈도우 핸드크래프트 특징(FEATURE_DIM) 기반 SVM-RBF 이진 분류
        self._clf.fit(X, y)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return class probabilities [N, 2] for feature matrix *X* [N, D]."""
        return self._clf.predict_proba(X)

    def save(self, directory: Path) -> None:
        """Serialise the fitted SVM to ``model.pkl`` in *directory* via joblib."""
        directory.mkdir(parents=True, exist_ok=True)
        joblib.dump(self._clf, directory / "model.pkl")

    @classmethod
    def load(cls, directory: Path) -> SvmFallClassifier:
        """Deserialise from ``model.pkl`` in *directory* written by :meth:`save`."""
        obj = cls()
        obj._clf = joblib.load(directory / "model.pkl")
        return obj
