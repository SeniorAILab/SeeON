"""Transformer-based fall classifier.

Architecture: Linear(51 → 256) input projection + sinusoidal positional
encoding → TransformerEncoder(d=256, nhead=4, ff=256, layers=3) → mean-pool
→ Linear(256 → 2).  Conforms to :class:`~training.models.base.FallClassifier`.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from training.config import KPT_VECTOR_DIM, SEED
from training.models.base import _autodetect_device, _set_seeds, train_torch_module

_D_MODEL = 256
_NHEAD = 4
_DIM_FF = 256
_N_LAYERS = 3


class _PositionalEncoding(nn.Module):
    """Sinusoidal positional encoding (Vaswani et al., 2017)."""

    pe: torch.Tensor  # [1, max_len, d_model] — registered buffer

    def __init__(self, d_model: int, max_len: int = 512) -> None:
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        pos = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float) * (-math.log(10_000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(pos * div)
        pe[:, 1::2] = torch.cos(pos * div)
        self.register_buffer("pe", pe.unsqueeze(0))  # [1, max_len, d_model]

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.pe[:, : x.size(1)]


class _TransformerNet(nn.Module):
    """Input projection + sinusoidal PE + TransformerEncoder + mean-pool head."""

    def __init__(self) -> None:
        super().__init__()
        assert _D_MODEL % _NHEAD == 0, f"d_model={_D_MODEL} must be divisible by nhead={_NHEAD}"
        self.proj = nn.Linear(KPT_VECTOR_DIM, _D_MODEL)
        self.pos_enc = _PositionalEncoding(_D_MODEL)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=_D_MODEL,
            nhead=_NHEAD,
            dim_feedforward=_DIM_FF,
            dropout=0.1,
            batch_first=True,
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=_N_LAYERS)
        self.head = nn.Linear(_D_MODEL, 2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.proj(x)  # [N, T, 256]
        x = self.pos_enc(x)  # [N, T, 256]
        x = self.encoder(x)  # [N, T, 256]
        return self.head(x.mean(dim=1))  # mean-pool T → [N, 2]


class TransformerFallClassifier:
    """Fall classifier backed by a 3-layer Transformer encoder.

    Conforms to the :class:`~training.models.base.FallClassifier` Protocol.
    """

    def __init__(self) -> None:
        self._net = _TransformerNet()
        self._device: torch.device | None = None

    # ------------------------------------------------------------------
    # FallClassifier Protocol
    # ------------------------------------------------------------------

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train on *X* [N, T, 51] with binary labels *y* [N]."""
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
    def load(cls, directory: Path) -> TransformerFallClassifier:
        """Rebuild a classifier from a *directory* written by :meth:`save`."""
        obj = cls()
        device = _autodetect_device()
        obj._net.load_state_dict(
            torch.load(directory / "model.pt", map_location=device, weights_only=True)
        )
        obj._device = device
        return obj
