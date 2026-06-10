"""LSTM-based fall classifier.

Architecture: LSTM(51 → 128, 2 layers, dropout=0.3) → last hidden state →
Linear(128 → 2).  Conforms to :class:`~training.models.base.FallClassifier`.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from training.config import KPT_VECTOR_DIM, SEED
from training.models.base import _autodetect_device, _set_seeds, train_torch_module

_HIDDEN = 128
_LAYERS = 2


class _LstmNet(nn.Module):
    """Two-layer LSTM with a linear classifier head."""

    def __init__(self) -> None:
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=KPT_VECTOR_DIM,
            hidden_size=_HIDDEN,
            num_layers=_LAYERS,
            batch_first=True,
            dropout=0.3,
        )
        self.fc = nn.Linear(_HIDDEN, 2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        _, (h_n, _) = self.lstm(x)  # h_n: [num_layers, N, hidden]
        return self.fc(h_n[-1])  # last layer's final hidden state → [N, 2]


class LstmFallClassifier:
    """Fall classifier backed by a two-layer LSTM.

    Conforms to the :class:`~training.models.base.FallClassifier` Protocol.
    """

    def __init__(self) -> None:
        self._net = _LstmNet()
        self._device: torch.device | None = None

    # ------------------------------------------------------------------
    # FallClassifier Protocol
    # ------------------------------------------------------------------

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train on *X* [N, T, 51] with binary labels *y* [N]."""
        # 파이프라인 역할: 키포인트 시퀀스 [N, T, 51] 기반 2-layer LSTM 이진 분류
        _set_seeds(SEED)
        self._device = _autodetect_device()
        train_torch_module(self._net, X, y, device=self._device)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return softmax probabilities [N, 2] for *X* [N, T, 51]."""
        device = self._device or _autodetect_device()
        self._net.to(device)
        self._net.eval()
        with torch.no_grad():
            logits = self._net(torch.from_numpy(X).to(device))
        return torch.softmax(logits, dim=-1).cpu().numpy()

    def save(self, directory: Path) -> None:
        """Write ``model.pt`` (state dict) into *directory*."""
        directory.mkdir(parents=True, exist_ok=True)
        torch.save(self._net.state_dict(), directory / "model.pt")

    @classmethod
    def load(cls, directory: Path) -> LstmFallClassifier:
        """Rebuild a classifier from a *directory* written by :meth:`save`."""
        obj = cls()
        device = _autodetect_device()
        obj._net.load_state_dict(
            torch.load(directory / "model.pt", map_location=device, weights_only=True)
        )
        obj._device = device
        return obj
