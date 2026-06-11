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
from training.hp import hp_float, hp_int
from training.models.base import TorchFallClassifier

_D_MODEL = 256
_NHEAD = 4
_N_LAYERS = 3
_LR = 1e-3


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
    """Input projection + sinusoidal PE + TransformerEncoder + mean-pool head.

    ``dim_feedforward`` follows ``d_model`` (the original fixed config used
    256/256), keeping the FF width proportional when HP search varies d_model.
    """

    def __init__(
        self, d_model: int = _D_MODEL, nhead: int = _NHEAD, n_layers: int = _N_LAYERS
    ) -> None:
        super().__init__()
        assert d_model % nhead == 0, f"d_model={d_model} must be divisible by nhead={nhead}"
        self.proj = nn.Linear(KPT_VECTOR_DIM, d_model)
        self.pos_enc = _PositionalEncoding(d_model)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model,
            dropout=0.1,
            batch_first=True,
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)
        self.head = nn.Linear(d_model, 2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.proj(x)  # [N, T, 256]
        x = self.pos_enc(x)  # [N, T, 256]
        x = self.encoder(x)  # [N, T, 256]
        return self.head(x.mean(dim=1))  # mean-pool T → [N, 2]


class TransformerFallClassifier(TorchFallClassifier):
    """Fall classifier backed by a Transformer encoder (default: 3 layers, d=256).

    HP kwargs default to ``HARNESS_HP_*`` env overrides (harness trials), then
    to the original fixed configuration; the resolved architecture is persisted
    via ``arch.json`` so :meth:`~TorchFallClassifier.load` reconstructs it
    without the env.  Conforms to the
    :class:`~training.models.base.FallClassifier` Protocol; fit / predict_proba
    / save / load come from :class:`TorchFallClassifier`.
    """

    def __init__(
        self,
        d_model: int | None = None,
        heads: int | None = None,
        layers: int | None = None,
        lr: float | None = None,
    ) -> None:
        d_model = hp_int("d_model", _D_MODEL) if d_model is None else int(d_model)
        heads = hp_int("heads", _NHEAD) if heads is None else int(heads)
        layers = hp_int("layers", _N_LAYERS) if layers is None else int(layers)
        lr = hp_float("lr", _LR) if lr is None else float(lr)
        # 파이프라인 역할: 키포인트 시퀀스 [N, T, 51] 기반 Transformer 인코더 이진 분류
        super().__init__(
            _TransformerNet(d_model=d_model, nhead=heads, n_layers=layers),
            arch={"d_model": d_model, "heads": heads, "layers": layers},
            lr=lr,
        )
