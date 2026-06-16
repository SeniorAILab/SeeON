"""Random-Forest fall classifier.

Wraps ``sklearn.ensemble.RandomForestClassifier`` with balanced class weights
and a fixed random state.  Input ``X`` is a 2-D feature matrix [N, D];
``predict_proba`` delegates to sklearn and returns [N, 2].

Conforms to :class:`~training.models.base.FallClassifier`.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier

from training.config import SEED
from training.hp import hp_int, hp_opt_int


class RandomForestFallClassifier:
    """Fall classifier backed by a Random Forest.

    HP kwargs default to ``HARNESS_HP_*`` env overrides (harness trials),
    then to the original fixed configuration.  Conforms to the
    :class:`~training.models.base.FallClassifier` Protocol.
    """

    def __init__(
        self,
        n_estimators: int | None = None,
        max_depth: int | None = None,
        min_samples_leaf: int | None = None,
    ) -> None:
        self._clf = RandomForestClassifier(
            n_estimators=hp_int("n_estimators", 200) if n_estimators is None else int(n_estimators),
            max_depth=hp_opt_int("max_depth") if max_depth is None else int(max_depth),
            min_samples_leaf=(
                hp_int("min_samples_leaf", 1)
                if min_samples_leaf is None
                else int(min_samples_leaf)
            ),
            class_weight="balanced",
            random_state=SEED,
            n_jobs=-1,
        )

    # ------------------------------------------------------------------
    # FallClassifier Protocol
    # ------------------------------------------------------------------

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train on feature matrix *X* [N, D] with binary labels *y* [N]."""
        # 파이프라인 역할: 윈도우 핸드크래프트 특징(FEATURE_DIM) 기반 RandomForest 이진 분류
        self._clf.fit(X, y)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return class probabilities [N, 2] for feature matrix *X* [N, D]."""
        return self._clf.predict_proba(X)

    def save(self, directory: Path) -> None:
        """Serialise the fitted forest to ``model.pkl`` in *directory* via joblib."""
        directory.mkdir(parents=True, exist_ok=True)
        joblib.dump(self._clf, directory / "model.pkl")

    @classmethod
    def load(cls, directory: Path) -> RandomForestFallClassifier:
        """Deserialise from ``model.pkl`` in *directory* written by :meth:`save`."""
        obj = cls()
        obj._clf = joblib.load(directory / "model.pkl")
        return obj
