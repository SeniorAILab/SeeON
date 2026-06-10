"""Transformer-based fall classifier.

Architecture: Linear(51 → 256) input projection + sinusoidal positional
encoding → TransformerEncoder(d=256, nhead=4, ff=256, layers=3) → mean-pool
→ Linear(256 → 2).  Conforms to :class:`~training.models.base.FallClassifier`.
"""

from __future__ import annotations

import math

import torch
import torch.nn as nn

from training.config import KPT_VECTOR_DIM
from training.models.base import TorchFallClassifier

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


class TransformerFallClassifier(TorchFallClassifier):
    """Fall classifier backed by a 3-layer Transformer encoder.

    Conforms to the :class:`~training.models.base.FallClassifier` Protocol;
    fit / predict_proba / save / load come from :class:`TorchFallClassifier`.
    """

    def __init__(self) -> None:
        # 파이프라인 역할: 키포인트 시퀀스 [N, T, 51] 기반 3-layer Transformer 인코더 이진 분류
        super().__init__(_TransformerNet())
