"""Shared Protocol and training-loop helper for fall-classifier models.

All concrete classifiers (LSTM, Transformer, RF) conform to ``FallClassifier``
structurally — no inheritance needed.  The PyTorch helpers live here so both
net-based classifiers can share a single, DRY training loop.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Protocol, Self, runtime_checkable

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


_ARCH_FILENAME = "arch.json"


class TorchFallClassifier:
    """Shared FallClassifier implementation for torch-net-backed models.

    Subclasses construct their architecture and hand the ``nn.Module`` up;
    fit / predict_proba / save / load are identical across nets.  Subclass
    ``__init__`` must be callable with no arguments (default architecture)
    AND with the keys of *arch* as kwargs: :meth:`save` persists *arch* to
    ``arch.json`` and :meth:`load` rebuilds via ``cls(**arch)`` so that
    HP-varied architectures reload correctly in processes where the
    ``HARNESS_HP_*`` env vars are absent (evaluate / latency measurement /
    live demo).

    *lr* is consumed by :meth:`fit` (training-time HP, not part of arch).
    """

    def __init__(
        self,
        net: nn.Module,
        arch: dict[str, object] | None = None,
        lr: float = 1e-3,
    ) -> None:
        self._net = net
        self._arch: dict[str, object] = dict(arch or {})
        self._lr = float(lr)
        self._device: torch.device | None = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train on *X* [N, T, 51] with binary labels *y* [N]."""
        _set_seeds(SEED)
        self._device = _autodetect_device()
        train_torch_module(self._net, X, y, device=self._device, lr=self._lr)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return softmax probabilities [N, 2] for *X* [N, T, 51]."""
        device = self._device or _autodetect_device()
        self._net.to(device)
        self._net.eval()
        with torch.no_grad():
            logits = self._net(torch.from_numpy(X).to(device))
        return torch.softmax(logits, dim=-1).cpu().numpy()

    def save(self, directory: Path) -> None:
        """Write ``model.pt`` (state dict) + ``arch.json`` into *directory*."""
        directory.mkdir(parents=True, exist_ok=True)
        torch.save(self._net.state_dict(), directory / "model.pt")
        if self._arch:
            (directory / _ARCH_FILENAME).write_text(
                json.dumps(self._arch, indent=2), encoding="utf-8"
            )

    @classmethod
    def load(cls, directory: Path) -> Self:
        """Rebuild a classifier from a *directory* written by :meth:`save`.

        When ``arch.json`` is present the net is reconstructed with the saved
        constructor kwargs; older artifacts without the sidecar fall back to
        the default architecture (``cls()``), preserving backward compat.
        """
        arch_path = directory / _ARCH_FILENAME
        if arch_path.exists():
            obj = cls(**json.loads(arch_path.read_text(encoding="utf-8")))
        else:
            obj = cls()
        device = _autodetect_device()
        obj._net.load_state_dict(
            torch.load(directory / "model.pt", map_location=device, weights_only=True)
        )
        obj._device = device
        return obj


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
