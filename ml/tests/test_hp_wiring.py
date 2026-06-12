"""HARNESS_HP_* receiver-side wiring tests.

Covers the three contracts of the HP plumbing (harness.py "HP plumbing"):

1. Env consumption — each factory resolves HPs from ``HARNESS_HP_<NAME>``.
2. Default preservation — with no env vars, configurations are byte-identical
   to the pre-wiring fixed defaults (zero behavioral drift).
3. Load reconstruction — HP-varied torch architectures save ``arch.json`` and
   reload correctly in a process WITHOUT the env vars set.
"""

from __future__ import annotations

import numpy as np
import pytest
import torch

from training.config import T_WINDOW
from training.hp import active_hps, hp_float, hp_int, hp_opt_int, hp_str
from training.models.gcn import GcnFallClassifier
from training.models.logreg import LogisticRegressionFallClassifier
from training.models.lstm import LstmFallClassifier
from training.models.rf import RandomForestFallClassifier
from training.models.svm import SvmFallClassifier
from training.models.transformer import TransformerFallClassifier

_ALL_HP_NAMES = [
    "N_ESTIMATORS", "MAX_DEPTH", "MIN_SAMPLES_LEAF",
    "C", "GAMMA", "KERNEL", "SCALED",
    "HIDDEN", "LAYERS", "LR", "DROPOUT",
    "D_MODEL", "HEADS", "BLOCKS",
]


@pytest.fixture(autouse=True)
def _clean_hp_env(monkeypatch):
    """Ensure no stray HARNESS_HP_* vars leak between tests."""
    for name in _ALL_HP_NAMES:
        monkeypatch.delenv(f"HARNESS_HP_{name}", raising=False)


class TestHpGetters:
    def test_typed_getters(self, monkeypatch):
        monkeypatch.setenv("HARNESS_HP_HIDDEN", "96")
        monkeypatch.setenv("HARNESS_HP_LR", "0.0005")
        monkeypatch.setenv("HARNESS_HP_KERNEL", "linear")
        assert hp_int("hidden", 128) == 96
        assert hp_float("lr", 1e-3) == 0.0005
        assert hp_str("kernel", "rbf") == "linear"
        assert hp_opt_int("max_depth") is None
        assert active_hps() == {"hidden": "96", "lr": "0.0005", "kernel": "linear"}

    def test_defaults_when_unset(self):
        assert hp_int("hidden", 128) == 128
        assert hp_float("lr", 1e-3) == 1e-3
        assert hp_str("kernel", "rbf") == "rbf"


class TestEnvConsumption:
    def test_rf(self, monkeypatch):
        monkeypatch.setenv("HARNESS_HP_N_ESTIMATORS", "321")
        monkeypatch.setenv("HARNESS_HP_MAX_DEPTH", "7")
        monkeypatch.setenv("HARNESS_HP_MIN_SAMPLES_LEAF", "4")
        clf = RandomForestFallClassifier()._clf
        assert (clf.n_estimators, clf.max_depth, clf.min_samples_leaf) == (321, 7, 4)

    def test_svm(self, monkeypatch):
        monkeypatch.setenv("HARNESS_HP_C", "12.5")
        monkeypatch.setenv("HARNESS_HP_GAMMA", "0.01")
        monkeypatch.setenv("HARNESS_HP_KERNEL", "linear")
        clf = SvmFallClassifier()._clf
        assert (clf.C, clf.gamma, clf.kernel) == (12.5, 0.01, "linear")

    def test_lstm(self, monkeypatch):
        monkeypatch.setenv("HARNESS_HP_HIDDEN", "64")
        monkeypatch.setenv("HARNESS_HP_LAYERS", "1")
        monkeypatch.setenv("HARNESS_HP_LR", "0.005")
        clf = LstmFallClassifier()
        assert clf._net.lstm.hidden_size == 64
        assert clf._net.lstm.num_layers == 1
        assert clf._net.lstm.dropout == 0.0  # single layer → inter-layer dropout off
        assert clf._lr == 0.005

    def test_transformer(self, monkeypatch):
        monkeypatch.setenv("HARNESS_HP_D_MODEL", "64")
        monkeypatch.setenv("HARNESS_HP_HEADS", "2")
        monkeypatch.setenv("HARNESS_HP_LAYERS", "1")
        clf = TransformerFallClassifier()
        assert clf._net.proj.out_features == 64
        assert len(clf._net.encoder.layers) == 1
        assert clf._arch == {"d_model": 64, "heads": 2, "layers": 1}

    def test_gcn_blocks_env_maps_to_n_blocks(self, monkeypatch):
        monkeypatch.setenv("HARNESS_HP_HIDDEN", "32")
        monkeypatch.setenv("HARNESS_HP_BLOCKS", "3")
        monkeypatch.setenv("HARNESS_HP_DROPOUT", "0.25")
        clf = GcnFallClassifier()
        assert len(clf._net.blocks) == 3
        assert clf._net.head.in_features == 32
        assert clf._net.blocks[0].drop.p == 0.25

    def test_logreg(self, monkeypatch):
        monkeypatch.setenv("HARNESS_HP_C", "7.5")
        assert LogisticRegressionFallClassifier()._clf.C == 7.5

    def test_explicit_kwargs_beat_env(self, monkeypatch):
        monkeypatch.setenv("HARNESS_HP_HIDDEN", "64")
        clf = LstmFallClassifier(hidden=32)
        assert clf._net.lstm.hidden_size == 32


class TestDefaultPreservation:
    def test_rf_defaults(self):
        clf = RandomForestFallClassifier()._clf
        assert (clf.n_estimators, clf.max_depth, clf.min_samples_leaf) == (200, None, 1)

    def test_svm_defaults(self):
        clf = SvmFallClassifier()._clf
        assert (clf.C, clf.gamma, clf.kernel) == (1.0, "scale", "rbf")

    def test_logreg_defaults(self):
        clf = LogisticRegressionFallClassifier()._clf
        assert (clf.C, clf.class_weight, clf.max_iter) == (1.0, "balanced", 1000)

    def test_torch_defaults(self):
        lstm = LstmFallClassifier()
        assert lstm._net.lstm.hidden_size == 128
        assert lstm._net.lstm.num_layers == 2
        assert lstm._net.lstm.dropout == 0.3
        tr = TransformerFallClassifier()
        assert tr._net.proj.out_features == 256
        assert len(tr._net.encoder.layers) == 3
        gcn = GcnFallClassifier()
        assert len(gcn._net.blocks) == 2
        assert gcn._net.blocks[0].drop.p == 0.0
        for clf in (lstm, tr, gcn):
            assert clf._lr == 1e-3


class TestArchRoundTrip:
    """HP-varied torch architectures must reload WITHOUT env vars present."""

    def _roundtrip(self, clf, factory, tmp_path):
        clf.save(tmp_path)
        assert (tmp_path / "arch.json").exists()
        return factory.load(tmp_path)

    def test_lstm(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HARNESS_HP_HIDDEN", "48")
        monkeypatch.setenv("HARNESS_HP_LAYERS", "1")
        clf = LstmFallClassifier()
        monkeypatch.delenv("HARNESS_HP_HIDDEN")
        monkeypatch.delenv("HARNESS_HP_LAYERS")
        loaded = self._roundtrip(clf, LstmFallClassifier, tmp_path)
        assert loaded._net.lstm.hidden_size == 48
        assert loaded._net.lstm.num_layers == 1
        x = np.random.default_rng(0).random((2, T_WINDOW, 51)).astype(np.float32)
        proba = loaded.predict_proba(x)
        assert proba.shape == (2, 2)
        np.testing.assert_allclose(proba.sum(axis=1), 1.0, rtol=1e-5)

    def test_gcn(self, tmp_path):
        clf = GcnFallClassifier(hidden=16, n_blocks=3, dropout=0.4)
        loaded = self._roundtrip(clf, GcnFallClassifier, tmp_path)
        assert len(loaded._net.blocks) == 3
        assert loaded._net.head.in_features == 16
        # weights must be identical after the round trip
        for p0, p1 in zip(clf._net.parameters(), loaded._net.parameters()):
            assert torch.equal(p0.cpu(), p1.cpu())

    def test_scaled_variants(self, monkeypatch, tmp_path):
        from sklearn.pipeline import Pipeline

        # default off — raw estimator, byte-compatible with all prior artifacts
        assert not isinstance(LogisticRegressionFallClassifier()._clf, Pipeline)
        assert not isinstance(SvmFallClassifier()._clf, Pipeline)
        # env on — StandardScaler pipeline
        monkeypatch.setenv("HARNESS_HP_SCALED", "1")
        lr = LogisticRegressionFallClassifier(C=2.0)
        sv = SvmFallClassifier(kernel="linear")
        for clf in (lr, sv):
            assert isinstance(clf._clf, Pipeline)
            assert "scaler" in clf._clf.named_steps
        # scaled fit/save/load roundtrip
        rng = np.random.default_rng(1)
        X = (rng.random((60, 8)) * 100).astype(np.float64)  # large-scale features
        y = (X[:, 0] > 50).astype(int)
        lr.fit(X, y)
        proba = lr.predict_proba(X)
        lr.save(tmp_path)
        monkeypatch.delenv("HARNESS_HP_SCALED")
        loaded = LogisticRegressionFallClassifier.load(tmp_path)
        np.testing.assert_allclose(loaded.predict_proba(X), proba)

    def test_logreg_fit_save_load_roundtrip(self, tmp_path):
        rng = np.random.default_rng(0)
        X = rng.random((60, 8)).astype(np.float64)
        y = (X[:, 0] > 0.5).astype(int)
        clf = LogisticRegressionFallClassifier(C=5.0)
        clf.fit(X, y)
        proba = clf.predict_proba(X)
        assert proba.shape == (60, 2)
        np.testing.assert_allclose(proba.sum(axis=1), 1.0, rtol=1e-9)
        clf.save(tmp_path)
        loaded = LogisticRegressionFallClassifier.load(tmp_path)
        np.testing.assert_allclose(loaded.predict_proba(X), proba)

    def test_legacy_artifact_without_arch_json(self, tmp_path):
        clf = TransformerFallClassifier()  # default arch
        clf.save(tmp_path)
        (tmp_path / "arch.json").unlink()  # simulate pre-wiring artifact
        loaded = TransformerFallClassifier.load(tmp_path)
        assert loaded._net.proj.out_features == 256
