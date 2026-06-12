"""Training pipeline — Step 4 of the Le2i temporal fall-classifier PoC.

CLI::

    python -m training.train [--pose-dir P] [--annotation-dir P]
                             [--smoke-n N] [--models rf,lstm,transformer]

Trains each requested model on the Le2i clip-level train split, writes
artifacts under ``config.ARTIFACT_BASE/{model_type}/``, and persists a
``metadata.json`` that the live demo adapter reads back.

Design notes
------------
* Both ``mode="sequence"`` and ``mode="features"`` WindowDatasets are built
  from the same ``metas`` list and split with the same deterministic logic, so
  the train/test clip-id sets are identical across modes (asserted at runtime).
* Smoke mode (``--smoke-n N``) subsamples to ``ceil(N/2)`` fall + ``floor(N/2)``
  ADL clips, bypasses the fall-fraction gate, and caps PyTorch training at 2
  epochs to keep wall time under 5 minutes on CPU.
"""

from __future__ import annotations

import argparse
import logging
import math
import random
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import f1_score

from training.config import (
    ARTIFACT_BASE,
    DEFAULT_OPERATING_THRESHOLD,
    FEATURE_DIM,
    POSE_CACHE_DIR,
    RAW_DATA_DIR,
    SEED,
    STRIDE,
    T_WINDOW,
    TEST_SPLIT_FRACTION,
)
from training.data.le2i import ClipMeta, load_clip_metas
from training.data.windowing import WindowDataset
from training.metadata import ModelMetadata, artifact_dir, save_metadata
from training.models import REGISTRY

log = logging.getLogger(__name__)

_ALL_MODEL_KEYS: tuple[str, ...] = tuple(REGISTRY.keys())


# ---------------------------------------------------------------------------
# Seed / subsample helpers
# ---------------------------------------------------------------------------


def _set_all_seeds(seed: int) -> None:
    """Set Python / NumPy / PyTorch seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _subsample_metas(
    metas: list[ClipMeta],
    smoke_n: int,
    rng: np.random.Generator | None = None,
) -> list[ClipMeta]:
    """Return ``ceil(N/2)`` fall + ``floor(N/2)`` ADL clips.

    Both classes are guaranteed (at least 1 clip each) so class-weight
    computation inside the models does not crash.  If one class has fewer clips
    than the target, all available clips of that class are included.
    """
    if rng is None:
        rng = np.random.default_rng(SEED)
    falls = [m for m in metas if m.is_fall_clip]
    adls = [m for m in metas if not m.is_fall_clip]
    n_fall = min(math.ceil(smoke_n / 2), len(falls))
    n_adl = min(math.floor(smoke_n / 2), len(adls))
    # guarantee at least 1 of each class when available
    if n_fall == 0 and falls:
        n_fall = 1
    if n_adl == 0 and adls:
        n_adl = 1
    idx_fall: list[int] = (
        list(rng.choice(len(falls), size=n_fall, replace=False)) if n_fall > 0 else []
    )
    idx_adl: list[int] = (
        list(rng.choice(len(adls), size=n_adl, replace=False)) if n_adl > 0 else []
    )
    return [falls[i] for i in idx_fall] + [adls[i] for i in idx_adl]


def _window_class_counts(dataset: WindowDataset) -> tuple[int, int]:
    """Return ``(n_positive, n_negative)`` from the sample index without I/O."""
    pos = sum(1 for _, _, lbl in dataset._samples if lbl == 1)  # noqa: SLF001
    return pos, len(dataset._samples) - pos


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def run(
    pose_dir: Path = POSE_CACHE_DIR,
    annotation_dir: Path = RAW_DATA_DIR,
    smoke_n: int | None = None,
    models: Sequence[str] = _ALL_MODEL_KEYS,
) -> None:
    """Build datasets, train requested models, and persist artifacts.

    Parameters
    ----------
    pose_dir:
        Directory of ``*.npz`` pose caches (from ``training.extract_poses``).
    annotation_dir:
        Root directory for Le2i annotation ``.txt`` files.
    smoke_n:
        When set, subsample to *N* clips (``ceil(N/2)`` fall + ``floor(N/2)``
        ADL) and cap net training at 2 epochs so the run finishes quickly.
    models:
        Model keys to train — any subset of the keys in ``models.REGISTRY``.
    """
    _set_all_seeds(SEED)

    # === 단계 1: 클립 메타데이터 로드 (pose npz + annotation txt 매핑) ===
    # --- Load clip metadata ---
    metas = load_clip_metas(pose_dir, annotation_dir)
    n_fall_clips = sum(1 for m in metas if m.is_fall_clip)
    n_adl_clips = len(metas) - n_fall_clips
    print(f"[train] clips loaded: total={len(metas)} fall={n_fall_clips} adl={n_adl_clips}")

    # --- Smoke subsampling ---
    if smoke_n is not None:
        metas = _subsample_metas(metas, smoke_n)
        n_fall_clips = sum(1 for m in metas if m.is_fall_clip)
        n_adl_clips = len(metas) - n_fall_clips
        print(
            f"[train/smoke] subsampled: total={len(metas)}"
            f" fall={n_fall_clips} adl={n_adl_clips}"
        )

    # === 단계 2: 윈도우 데이터셋 구성 — sequence(LSTM/Transformer), features(RF) 두 모드 ===
    # --- Build both WindowDatasets (same metas → identical deterministic split) ---
    ds_seq = WindowDataset(metas, mode="sequence")
    ds_feat = WindowDataset(metas, mode="features")

    # === 단계 3: 클립 단위 결정적 분할 (두 모드 분할 결과 일치 보장) ===
    train_seq, test_seq = ds_seq.split(test_fraction=TEST_SPLIT_FRACTION)
    train_feat, test_feat = ds_feat.split(test_fraction=TEST_SPLIT_FRACTION)

    # Assert that both modes produce identical clip-id splits — on BOTH sides.
    # Train-side equality alone would let a refactor that changes only the
    # test-clip selection slip through unnoticed.
    train_ids_seq = {m.clip_id for m in train_seq._clip_metas}  # noqa: SLF001
    train_ids_feat = {m.clip_id for m in train_feat._clip_metas}  # noqa: SLF001
    assert train_ids_seq == train_ids_feat, (
        "Train clip-id sets differ between sequence and features modes"
        " — split is non-deterministic"
    )
    test_ids_seq = {m.clip_id for m in test_seq._clip_metas}  # noqa: SLF001
    test_ids_feat = {m.clip_id for m in test_feat._clip_metas}  # noqa: SLF001
    assert test_ids_seq == test_ids_feat, (
        "Test clip-id sets differ between sequence and features modes"
        " — split is non-deterministic"
    )

    # --- Log window-class distributions (read from sample index, no I/O) ---
    train_pos, train_neg = _window_class_counts(train_seq)
    test_pos, test_neg = _window_class_counts(test_seq)
    print(
        f"[train] train windows: total={train_pos + train_neg} pos={train_pos} neg={train_neg}"
    )
    print(
        f"[train] test  windows: total={test_pos + test_neg} pos={test_pos} neg={test_neg}"
    )

    # === 단계 4: fall-fraction 게이트 — 어노테이션 연결 실패(시임 버그) 조기 감지 ===
    # --- Fall-fraction gate (full run only) ---
    # This gate guards against the annotation-resolution seam bug (clip_id decode
    # or path layout failure), which makes EVERY clip resolve as ADL → fall
    # fraction collapses to exactly 0.000.  It is NOT a class-balance check: on
    # Le2i a fall is a brief event inside a much longer clip, so the legitimate
    # positive-window fraction is ~5-6% (433/7716).  The floor sits at 0.02 to
    # cleanly separate "real but imbalanced" from "seam bug zeroed everything".
    total_windows = train_pos + train_neg + test_pos + test_neg
    total_pos_windows = train_pos + test_pos
    fall_fraction = total_pos_windows / total_windows if total_windows > 0 else 0.0
    if total_pos_windows == 0:
        # Applies in smoke mode too: single-class data breaks predict_proba
        # ([:, 1] on an (N, 1) result) and is always a data-availability bug —
        # the smoke subsampler guarantees >=1 fall clip whenever the source has
        # any, so zero positives means the annotations never resolved.
        raise ValueError(
            f"No positive (fall) windows in training data (total={total_windows}). "
            "Check that annotation .txt files exist and annotation_dir resolves."
        )
    if smoke_n is None and fall_fraction < 0.02:
        raise ValueError(
            f"Fall-window fraction {fall_fraction:.3f} < 0.02. "
            "Check that annotation_dir resolves correctly — most clips appear as ADL."
        )

    # --- Lazy materialisation caches (avoid double to_arrays() calls) ---
    _seq_arrays: tuple[np.ndarray, np.ndarray] | None = None
    _feat_arrays: tuple[np.ndarray, np.ndarray] | None = None

    def _get_seq() -> tuple[np.ndarray, np.ndarray]:
        nonlocal _seq_arrays
        if _seq_arrays is None:
            _seq_arrays = train_seq.to_arrays()
        return _seq_arrays

    def _get_feat() -> tuple[np.ndarray, np.ndarray]:
        nonlocal _feat_arrays
        if _feat_arrays is None:
            _feat_arrays = train_feat.to_arrays()
        return _feat_arrays

    is_smoke = smoke_n is not None
    requested = [k for k in REGISTRY if k in models]

    # === 단계 5: 요청된 모델별 학습 — REGISTRY 구동 (mode=="features"=sklearn, mode=="sequence"=PyTorch) ===
    for key in requested:
        out_dir = artifact_dir(key, ARTIFACT_BASE)
        print(f"[train] training {key!r} → {out_dir}")

        entry = REGISTRY[key]
        mode = entry["mode"]
        factory = entry["factory"]

        if mode == "features":
            X_tr, y_tr = _get_feat()
            clf = factory()
            clf.fit(X_tr, y_tr)
            clf.save(out_dir)
            y_pred = (clf.predict_proba(X_tr)[:, 1] >= DEFAULT_OPERATING_THRESHOLD).astype(int)
            train_f1 = float(f1_score(y_tr, y_pred, zero_division=0))
            meta = ModelMetadata(
                model_type=key,
                framework="sklearn",
                window=T_WINDOW,
                stride=STRIDE,
                input_shape=None,
                feature_dim=FEATURE_DIM,
                seed=SEED,
                operating_threshold=DEFAULT_OPERATING_THRESHOLD,
                reacquire=f"cd ml && uv run python -m training.train --models {key}",
            )

        else:  # mode == "sequence" — applies to ALL sequence-mode REGISTRY entries (lstm, transformer, gcn, …)
            X_tr, y_tr = _get_seq()
            clf = factory()

            if is_smoke:
                # Cap net training at 2 epochs so smoke runs finish in < 5 min CPU.
                # Monkey-patch applies to every mode=="sequence" entry, not just lstm/transformer.
                import training.models.base as _base

                _orig_train = _base.train_torch_module

                def _capped(module, X, y, *, device, _train=_orig_train, **kwargs):  # type: ignore[override]
                    return _train(
                        module, X, y, device=device, max_epochs=2, patience=99, **kwargs
                    )

                _base.train_torch_module = _capped
                try:
                    clf.fit(X_tr, y_tr)
                finally:
                    _base.train_torch_module = _orig_train
            else:
                clf.fit(X_tr, y_tr)

            clf.save(out_dir)
            y_pred = (
                clf.predict_proba(X_tr)[:, 1] >= DEFAULT_OPERATING_THRESHOLD
            ).astype(int)
            train_f1 = float(f1_score(y_tr, y_pred, zero_division=0))
            meta = ModelMetadata(
                model_type=key,
                framework="pytorch",
                window=T_WINDOW,
                stride=STRIDE,
                input_shape=[T_WINDOW, 51],
                feature_dim=None,
                seed=SEED,
                operating_threshold=DEFAULT_OPERATING_THRESHOLD,
                reacquire=f"cd ml && uv run python -m training.train --models {key}",
            )

        # === 단계 6: 아티팩트 및 메타데이터 저장 ===
        save_metadata(out_dir, meta)
        print(f"[train] SAVED {key!r}: path={out_dir}  train_F1={train_f1:.4f}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Train fall classifier(s) on Le2i pose cache.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--pose-dir",
        type=Path,
        default=POSE_CACHE_DIR,
        help="Pose cache directory (*.npz files from extract_poses).",
    )
    parser.add_argument(
        "--annotation-dir",
        type=Path,
        default=RAW_DATA_DIR,
        help="Le2i annotation root directory.",
    )
    parser.add_argument(
        "--smoke-n",
        type=int,
        default=None,
        metavar="N",
        help="Smoke-test: subsample to N clips (ceil(N/2) fall + floor(N/2) ADL).",
    )
    parser.add_argument(
        "--models",
        type=str,
        default=",".join(REGISTRY.keys()),
        help="Comma-separated model keys to train.",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    run(
        pose_dir=args.pose_dir,
        annotation_dir=args.annotation_dir,
        smoke_n=args.smoke_n,
        models=args.models.split(","),
    )


if __name__ == "__main__":
    main()
