"""Sliding-window dataset over Le2i pose clips.

Converts a list of ClipMeta objects into (X, y) samples by slicing each clip
into T_WINDOW-length windows with a configurable stride.  Supports two output
modes:

* ``"sequence"`` — raw keypoints flattened to float32[T, 51] (C-order), for
  LSTM/Transformer sequence models.
* ``"features"`` — hand-crafted features float32[FEATURE_DIM] produced by
  ``training.data.features.extract_window_features``, for RF/XGBoost models.

Window labelling rule (unchanged for any dataset)
--------------------------------------------------
``y = 1`` iff ``|window_frames ∩ fall_interval| / T >= OVERLAP_THRESHOLD``.
Le2i ``fall_interval`` is ``(start, end)`` with inclusive integer frame
numbers.  The intersection is computed as a half-open range ``[start, end+1)``
to convert from the annotation's inclusive convention.  ADL clips
(``fall_interval is None``) produce ``y = 0`` for all windows.

Short-clip rule
---------------
A clip with fewer than ``T_WINDOW`` frames yields **exactly one** zero-padded
window (start = 0).  An empty clip (N=0) yields no windows.
"""

from __future__ import annotations

import logging
from typing import Literal

import numpy as np

from training.config import (
    KPT_VECTOR_DIM,
    OVERLAP_THRESHOLD,
    STRIDE,
    T_WINDOW,
    TEST_SPLIT_FRACTION,
)
from training.data.features import extract_window_features
from training.data.le2i import ClipMeta

log = logging.getLogger(__name__)

_KEYPOINTS_KEY = "keypoints"  # npz array key written by Step-1 extract_poses


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _window_starts(n_frames: int) -> list[int]:
    """Return sliding-window start indices for a clip of ``n_frames`` frames.

    * ``n_frames == 0`` → ``[]``  (no samples from empty clip)
    * ``0 < n_frames < T_WINDOW`` → ``[0]``  (one zero-padded window)
    * ``n_frames >= T_WINDOW`` → ``[0, STRIDE, …]`` while ``start + T <= n_frames``
    """
    if n_frames == 0:
        return []
    if n_frames < T_WINDOW:
        return [0]
    return list(range(0, n_frames - T_WINDOW + 1, STRIDE))


def _compute_label(start: int, fall_interval: tuple[int, int] | None) -> int:
    """Return 1 if the window overlaps the fall_interval by >= OVERLAP_THRESHOLD.

    ``fall_interval`` uses 1-based inclusive frame numbers from Le2i annotations.
    Internally converted to half-open [f_start, f_end+1) for clean arithmetic.
    Window frames are 0-based [start, start+T_WINDOW).
    """
    if fall_interval is None:
        return 0
    f_start, f_end = fall_interval
    # Convert Le2i inclusive end to half-open; window is already 0-based half-open.
    overlap = max(0, min(start + T_WINDOW, f_end + 1) - max(start, f_start))
    return 1 if overlap / T_WINDOW >= OVERLAP_THRESHOLD else 0


def _load_raw_window(meta: ClipMeta, start: int) -> np.ndarray:
    """Return float32[T_WINDOW, 17, 3] for the window beginning at ``start``.

    Zero-pads at the end if the clip has fewer than ``T_WINDOW`` frames beyond
    ``start``.  The npz file is opened and closed within this call.
    """
    with np.load(meta.npz_path, allow_pickle=False) as data:
        kpts = data[_KEYPOINTS_KEY].astype(np.float32)  # [N_frames, 17, 3]

    n_frames, n_kpt, n_dim = kpts.shape
    window = np.zeros((T_WINDOW, n_kpt, n_dim), dtype=np.float32)
    actual_end = min(start + T_WINDOW, n_frames)
    actual_len = actual_end - start
    if actual_len > 0:
        window[:actual_len] = kpts[start:actual_end]
    return window


# ---------------------------------------------------------------------------
# WindowDataset
# ---------------------------------------------------------------------------


class WindowDataset:
    """Sliding-window dataset over Le2i pose clips.

    Parameters
    ----------
    clip_metas:
        Source clips (from ``training.data.le2i.load_clip_metas``).
    mode:
        ``"sequence"`` or ``"features"`` (see module docstring).

    Usage
    -----
    Indexable for PyTorch DataLoader::

        dataset[i] -> (x: np.ndarray, y: int)

    Or materialise to numpy for sklearn::

        X, y = dataset.to_arrays()

    Split deterministically by clip::

        train_ds, test_ds = dataset.split(test_fraction=0.25)
    """

    def __init__(
        self,
        clip_metas: list[ClipMeta],
        mode: Literal["sequence", "features"],
    ) -> None:
        if mode not in ("sequence", "features"):
            raise ValueError(f"mode must be 'sequence' or 'features', got {mode!r}")

        self._clip_metas = clip_metas
        self._mode = mode

        # Build index: (clip_meta_index, start_frame, label)
        self._samples: list[tuple[int, int, int]] = []

        n_pos = 0
        n_neg = 0
        for ci, meta in enumerate(clip_metas):
            with np.load(meta.npz_path, allow_pickle=False) as data:
                n_frames = int(data[_KEYPOINTS_KEY].shape[0])

            for start in _window_starts(n_frames):
                label = _compute_label(start, meta.fall_interval)
                self._samples.append((ci, start, label))
                if label:
                    n_pos += 1
                else:
                    n_neg += 1

        print(
            f"[WindowDataset] mode={mode!r}  clips={len(clip_metas)}"
            f"  samples={len(self._samples)}  pos={n_pos}  neg={n_neg}"
        )

    # ------------------------------------------------------------------
    # Indexable API
    # ------------------------------------------------------------------

    def __len__(self) -> int:
        return len(self._samples)

    def __getitem__(self, idx: int) -> tuple[np.ndarray, int]:
        """Return ``(x, y)`` for sample ``idx``.

        x shape:
        - mode="sequence": float32[T_WINDOW, 51]
        - mode="features": float32[FEATURE_DIM]
        """
        ci, start, label = self._samples[idx]
        meta = self._clip_metas[ci]
        raw = _load_raw_window(meta, start)  # float32[T_WINDOW, 17, 3]

        if self._mode == "sequence":
            x = raw.reshape(T_WINDOW, KPT_VECTOR_DIM)  # [T, 51] C-order flatten
        else:
            x = extract_window_features(raw)  # [FEATURE_DIM]

        return x, label

    # ------------------------------------------------------------------
    # Materialise to numpy arrays
    # ------------------------------------------------------------------

    def to_arrays(self) -> tuple[np.ndarray, np.ndarray]:
        """Materialise all samples into numpy arrays.

        Returns
        -------
        X : np.ndarray
            float32[N, T_WINDOW, 51]  if mode="sequence"
            float32[N, FEATURE_DIM]   if mode="features"
        y : np.ndarray
            int64[N], values in {0, 1}.
        """
        xs = []
        ys = []
        for i in range(len(self)):
            x, y = self[i]
            xs.append(x)
            ys.append(y)
        X = np.stack(xs, axis=0)
        y_arr = np.array(ys, dtype=np.int64)
        return X, y_arr

    # ------------------------------------------------------------------
    # Deterministic clip-level split
    # ------------------------------------------------------------------

    def split(
        self,
        test_fraction: float = TEST_SPLIT_FRACTION,
    ) -> tuple[WindowDataset, WindowDataset]:
        """Partition clips deterministically into train and test datasets.

        Clips are sorted by ``clip_id`` for reproducibility.  The last
        ``round(N * test_fraction)`` clips form the test set; the remainder
        form the train set.

        Parameters
        ----------
        test_fraction:
            Fraction of clips to hold out for testing.
            Defaults to ``config.TEST_SPLIT_FRACTION`` (0.25).

        Returns
        -------
        tuple[WindowDataset, WindowDataset]
            ``(train_dataset, test_dataset)``

        Raises
        ------
        AssertionError
            If any clip_id appears in both splits (clip-level leakage guard).
        """
        sorted_metas = sorted(self._clip_metas, key=lambda m: m.clip_id)
        n_total = len(sorted_metas)
        n_test = round(n_total * test_fraction)
        n_train = n_total - n_test

        train_metas = sorted_metas[:n_train]
        test_metas = sorted_metas[n_train:]

        train_ids = {m.clip_id for m in train_metas}
        test_ids = {m.clip_id for m in test_metas}
        assert train_ids & test_ids == set(), (
            f"Clip leakage detected: {train_ids & test_ids} appear in both splits"
        )

        print(
            f"[WindowDataset.split] train_clips={len(train_metas)}  "
            f"test_clips={len(test_metas)}  test_fraction={test_fraction}"
        )
        return (
            WindowDataset(train_metas, self._mode),
            WindowDataset(test_metas, self._mode),
        )
