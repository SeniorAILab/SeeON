"""Logistic-regression fall classifier.

A-axis hypothesis family (autoresearch loop, wave 4): linear-kernel SVM's
dominance on the 144-dim handcrafted features (P@R90 0.43 vs ≤0.19 for rbf)
suggests near-linear separability — if so, a plain calibrated linear model
should match it with a fraction of the fit/inference cost and an
interpretable per-feature weight vector.

Wraps ``sklearn.linear_model.LogisticRegression`` with balanced class weights
and a fixed random state.  Input ``X`` is a 2-D feature matrix [N, D];
``predict_proba`` is natively probabilistic (no Platt scaling needed).

Conforms to :class:`~training.models.base.FallClassifier`.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

from training.config import SEED
from training.hp import hp_float


class LogisticRegressionFallClassifier:
    """Fall classifier backed by L2 logistic regression.

    HP kwargs default to ``HARNESS_HP_*`` env overrides (harness trials),
    then to the fixed configuration.  Conforms to the
    :class:`~training.models.base.FallClassifier` Protocol.
    """

    def __init__(self, C: float | None = None) -> None:
        self._clf = LogisticRegression(
            C=hp_float("C", 1.0) if C is None else float(C),
            class_weight="balanced",
            random_state=SEED,
            max_iter=1000,
        )

    # ------------------------------------------------------------------
    # FallClassifier Protocol
    # ------------------------------------------------------------------

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train on feature matrix *X* [N, D] with binary labels *y* [N]."""
        # 파이프라인 역할: 윈도우 핸드크래프트 특징(FEATURE_DIM) 기반 로지스틱 회귀 이진 분류
        self._clf.fit(X, y)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return class probabilities [N, 2] for feature matrix *X* [N, D]."""
        return self._clf.predict_proba(X)

    def save(self, directory: Path) -> None:
        """Serialise the fitted model to ``model.pkl`` in *directory* via joblib."""
        directory.mkdir(parents=True, exist_ok=True)
        joblib.dump(self._clf, directory / "model.pkl")

    @classmethod
    def load(cls, directory: Path) -> LogisticRegressionFallClassifier:
        """Deserialise from ``model.pkl`` in *directory* written by :meth:`save`."""
        obj = cls()
        obj._clf = joblib.load(directory / "model.pkl")
        return obj
