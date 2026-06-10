"""Shared Protocol and training-loop helper for fall-classifier models.

All concrete classifiers (LSTM, Transformer, RF) conform to ``FallClassifier``
structurally — no inheritance needed.  The PyTorch helpers live here so both
net-based classifiers can share a single, DRY training loop.
"""

from __future__ import annotations

import random
from pathlib import Path
from typing import Protocol, runtime_checkable

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from training.config import SEED


@runtime_checkable
class FallClassifier(Protocol):
    """Common interface for all fall-classifier models.

    PyTorch implementations' ``fit`` is a full training-loop wrapper: it builds a
    ``TensorDataset`` / ``DataLoader``, runs an epoch loop with Adam and
    class-weighted ``CrossEntropyLoss``, and applies early stopping on training loss.
    It is **not** a one-shot sklearn-style ``fit`` call.
    """

    def fit(self, X: np.ndarray, y: np.ndarray) -> None: ...

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return [N, 2] probability matrix; each row sums to 1."""
        ...

    def save(self, directory: Path) -> None: ...

    @classmethod
    def load(cls, directory: Path) -> FallClassifier: ...


# ---------------------------------------------------------------------------
# Shared helpers — used by the PyTorch classifiers only.
# ---------------------------------------------------------------------------


def _autodetect_device() -> torch.device:
    """Return CUDA > MPS > CPU, whichever is available first."""
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _set_seeds(seed: int = SEED) -> None:
    """Set Python / NumPy / PyTorch seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def train_torch_module(
    module: nn.Module,
    X: np.ndarray,
    y: np.ndarray,
    *,
    device: torch.device,
    batch_size: int = 64,
    lr: float = 1e-3,
    max_epochs: int = 50,
    patience: int = 5,
) -> None:
    """Train *module* in-place with Adam + class-weighted CrossEntropyLoss.

    Stops early when the per-epoch training loss fails to improve by more than
    ``1e-6`` for *patience* consecutive epochs.  No validation split is used;
    the full ``(X, y)`` set is the training set.

    Args:
        module: PyTorch model (moved to *device*; mutated in-place).
        X: Float32 input array — [N, T, 51] for nets, [N, D] for others.
        y: Integer label array [N] with values in {0, 1}.
        device: Computation device.
        batch_size: DataLoader batch size (default 64).
        lr: Adam learning rate (default 1e-3).
        max_epochs: Hard upper bound on training epochs (default 50).
        patience: Early-stopping patience on training loss (default 5).
    """
    module.to(device)
    module.train()

    # === 단계 1: 클래스 가중치 계산 (소수 클래스 과소평가 방지) ===
    counts = np.bincount(y.astype(np.int64), minlength=2)
    class_weights = torch.tensor(
        len(y) / (2.0 * counts.clip(min=1)), dtype=torch.float32, device=device
    )

    # === 단계 2: 텐서 변환 및 DataLoader 구성 ===
    X_t = torch.from_numpy(X).to(device)
    y_t = torch.from_numpy(y.astype(np.int64)).to(device)
    loader = DataLoader(TensorDataset(X_t, y_t), batch_size=batch_size, shuffle=True)

    optimizer = torch.optim.Adam(module.parameters(), lr=lr)
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    best_loss = float("inf")
    no_improve = 0

    # === 단계 3: 에폭 루프 — 순전파 → CrossEntropy 손실 → 역전파 → Adam 옵티마이저 ===
    for _ in range(max_epochs):
        total, n = 0.0, 0
        for xb, yb in loader:
            optimizer.zero_grad()
            loss = criterion(module(xb), yb)
            loss.backward()
            optimizer.step()
            total += loss.item() * len(xb)
            n += len(xb)
        epoch_loss = total / n

        # === 단계 4: 학습 손실 기준 조기 종료 (patience 에폭 연속 개선 없으면 중단) ===
        if epoch_loss < best_loss - 1e-6:
            best_loss = epoch_loss
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= patience:
                break
