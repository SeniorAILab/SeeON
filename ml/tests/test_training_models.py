"""Tests for training.models — Protocol structural checks and predict_proba contracts.

Verifies that each concrete classifier:
  - satisfies the FallClassifier runtime-checkable Protocol
  - produces output shape [N, 2] from predict_proba after fit
  - produces rows that sum to 1.0 (softmax / probability simplex)

All fixtures are synthetic; no real data or weights are loaded.
Training uses tiny epoch counts where possible to keep the suite fast.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from training.config import FEATURE_DIM, KPT_VECTOR_DIM, T_WINDOW
from training.models.base import FallClassifier, TorchFallClassifier
from training.models.gcn import GcnFallClassifier
from training.models.lstm import LstmFallClassifier
from training.models.rf import RandomForestFallClassifier
from training.models.svm import SvmFallClassifier
from training.models.transformer import TransformerFallClassifier, _TransformerNet

_N = 16  # synthetic sample count — small enough for fast CPU training


# ---------------------------------------------------------------------------
# Synthetic data factories
# ---------------------------------------------------------------------------


def _seq_data(n: int = _N) -> tuple[np.ndarray, np.ndarray]:
    """Return float32[N, T, 51] input and balanced int64[N] labels."""
    rng = np.random.default_rng(42)
    X = rng.random((n, T_WINDOW, KPT_VECTOR_DIM)).astype(np.float32)
    y = np.array([i % 2 for i in range(n)], dtype=np.int64)
    return X, y


def _feat_data(n: int = _N) -> tuple[np.ndarray, np.ndarray]:
    """Return float32[N, 45] input and balanced int64[N] labels."""
    rng = np.random.default_rng(42)
    X = rng.random((n, FEATURE_DIM)).astype(np.float32)
    y = np.array([i % 2 for i in range(n)], dtype=np.int64)
    return X, y


# ---------------------------------------------------------------------------
# Helper: fast training shim for PyTorch models
# ---------------------------------------------------------------------------


def _fit_fast(clf: TorchFallClassifier, X: np.ndarray, y: np.ndarray) -> None:
    """Call fit() but cap training at 2 epochs via monkeypatching train_torch_module."""
    import training.models.base as _base

    _orig = _base.train_torch_module

    def _capped(module, X, y, *, device, **kwargs):  # type: ignore[override]
        return _orig(module, X, y, device=device, max_epochs=2, patience=99, **kwargs)

    _base.train_torch_module = _capped
    try:
        clf.fit(X, y)
    finally:
        _base.train_torch_module = _orig


# ---------------------------------------------------------------------------
# Protocol structural tests
# ---------------------------------------------------------------------------


class TestFallClassifierProtocol:
    def test_lstm_satisfies_protocol(self) -> None:
        assert isinstance(LstmFallClassifier(), FallClassifier)

    def test_transformer_satisfies_protocol(self) -> None:
        assert isinstance(TransformerFallClassifier(), FallClassifier)

    def test_rf_satisfies_protocol(self) -> None:
        assert isinstance(RandomForestFallClassifier(), FallClassifier)

    def test_svm_satisfies_protocol(self) -> None:
        assert isinstance(SvmFallClassifier(), FallClassifier)

    def test_gcn_satisfies_protocol(self) -> None:
        assert isinstance(GcnFallClassifier(), FallClassifier)


# ---------------------------------------------------------------------------
# LSTM
# ---------------------------------------------------------------------------


class TestLstmFallClassifier:
    def test_predict_proba_shape(self) -> None:
        clf = LstmFallClassifier()
        X, y = _seq_data()
        _fit_fast(clf, X, y)
        proba = clf.predict_proba(X)
        assert proba.shape == (_N, 2), f"Expected ({_N}, 2), got {proba.shape}"

    def test_predict_proba_rows_sum_to_one(self) -> None:
        clf = LstmFallClassifier()
        X, y = _seq_data()
        _fit_fast(clf, X, y)
        proba = clf.predict_proba(X)
        np.testing.assert_allclose(proba.sum(axis=1), 1.0, atol=1e-4)


# ---------------------------------------------------------------------------
# Transformer
# ---------------------------------------------------------------------------


class TestTransformerFallClassifier:
    def test_predict_proba_shape(self) -> None:
        clf = TransformerFallClassifier()
        X, y = _seq_data()
        _fit_fast(clf, X, y)
        proba = clf.predict_proba(X)
        assert proba.shape == (_N, 2), f"Expected ({_N}, 2), got {proba.shape}"

    def test_predict_proba_rows_sum_to_one(self) -> None:
        clf = TransformerFallClassifier()
        X, y = _seq_data()
        _fit_fast(clf, X, y)
        proba = clf.predict_proba(X)
        np.testing.assert_allclose(proba.sum(axis=1), 1.0, atol=1e-4)

    def test_default_d_model_divisible_by_nhead_builds_without_error(self) -> None:
        """Default _D_MODEL=256, _NHEAD=4: 256 % 4 == 0 must not raise."""
        net = _TransformerNet()  # raises AssertionError if d_model % nhead != 0
        assert net is not None


# ---------------------------------------------------------------------------
# Random Forest
# ---------------------------------------------------------------------------


class TestRandomForestFallClassifier:
    def test_predict_proba_shape(self) -> None:
        clf = RandomForestFallClassifier()
        X, y = _feat_data()
        clf.fit(X, y)
        proba = clf.predict_proba(X)
        assert proba.shape == (_N, 2), f"Expected ({_N}, 2), got {proba.shape}"

    def test_predict_proba_rows_sum_to_one(self) -> None:
        clf = RandomForestFallClassifier()
        X, y = _feat_data()
        clf.fit(X, y)
        proba = clf.predict_proba(X)
        np.testing.assert_allclose(proba.sum(axis=1), 1.0, atol=1e-4)


# ---------------------------------------------------------------------------
# SVM
# ---------------------------------------------------------------------------


class TestSvmFallClassifier:
    def test_predict_proba_shape(self) -> None:
        clf = SvmFallClassifier()
        X, y = _feat_data()
        clf.fit(X, y)
        proba = clf.predict_proba(X)
        assert proba.shape == (_N, 2), f"Expected ({_N}, 2), got {proba.shape}"

    def test_predict_proba_rows_sum_to_one(self) -> None:
        clf = SvmFallClassifier()
        X, y = _feat_data()
        clf.fit(X, y)
        proba = clf.predict_proba(X)
        np.testing.assert_allclose(proba.sum(axis=1), 1.0, atol=1e-4)

    def test_save_load_round_trip(self, tmp_path: Path) -> None:
        clf = SvmFallClassifier()
        X, y = _feat_data()
        clf.fit(X, y)
        clf.save(tmp_path)
        loaded = SvmFallClassifier.load(tmp_path)
        np.testing.assert_allclose(clf.predict_proba(X), loaded.predict_proba(X), atol=1e-5)


# ---------------------------------------------------------------------------
# GCN
# ---------------------------------------------------------------------------


class TestGcnFallClassifier:
    def test_predict_proba_shape(self) -> None:
        clf = GcnFallClassifier()
        X, y = _seq_data()
        _fit_fast(clf, X, y)
        proba = clf.predict_proba(X)
        assert proba.shape == (_N, 2), f"Expected ({_N}, 2), got {proba.shape}"

    def test_predict_proba_rows_sum_to_one(self) -> None:
        clf = GcnFallClassifier()
        X, y = _seq_data()
        _fit_fast(clf, X, y)
        proba = clf.predict_proba(X)
        np.testing.assert_allclose(proba.sum(axis=1), 1.0, atol=1e-4)

    def test_zero_arg_construction(self) -> None:
        """GcnFallClassifier() must construct without arguments (load() contract)."""
        clf = GcnFallClassifier()
        assert clf is not None

    def test_save_load_round_trip(self, tmp_path: Path) -> None:
        clf = GcnFallClassifier()
        X, y = _seq_data()
        _fit_fast(clf, X, y)
        clf.save(tmp_path)
        loaded = GcnFallClassifier.load(tmp_path)
        np.testing.assert_allclose(clf.predict_proba(X), loaded.predict_proba(X), atol=1e-5)
