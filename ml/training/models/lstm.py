"""LSTM-based fall classifier.

Architecture: LSTM(51 → 128, 2 layers, dropout=0.3) → last hidden state →
Linear(128 → 2).  Conforms to :class:`~training.models.base.FallClassifier`.
"""

from __future__ import annotations

import torch
import torch.nn as nn

from training.config import KPT_VECTOR_DIM
from training.hp import hp_float, hp_int
from training.models.base import TorchFallClassifier

_HIDDEN = 128
_LAYERS = 2
_DROPOUT = 0.3
_LR = 1e-3


class _LstmNet(nn.Module):
    """Stacked LSTM with a linear classifier head."""

    def __init__(
        self, hidden: int = _HIDDEN, layers: int = _LAYERS, dropout: float = _DROPOUT
    ) -> None:
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=KPT_VECTOR_DIM,
            hidden_size=hidden,
            num_layers=layers,
            batch_first=True,
            # nn.LSTM applies dropout between layers only — meaningless (and
            # warned about) for a single layer.
            dropout=dropout if layers > 1 else 0.0,
        )
        self.fc = nn.Linear(hidden, 2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        _, (h_n, _) = self.lstm(x)  # h_n: [num_layers, N, hidden]
        return self.fc(h_n[-1])  # last layer's final hidden state → [N, 2]


class LstmFallClassifier(TorchFallClassifier):
    """Fall classifier backed by a stacked LSTM (default: 2 layers, hidden=128).

    HP kwargs default to ``HARNESS_HP_*`` env overrides (harness trials), then
    to the original fixed configuration; the resolved architecture is persisted
    via ``arch.json`` so :meth:`~TorchFallClassifier.load` reconstructs it
    without the env.  Conforms to the
    :class:`~training.models.base.FallClassifier` Protocol; fit / predict_proba
    / save / load come from :class:`TorchFallClassifier`.
    """

    def __init__(
        self,
        hidden: int | None = None,
        layers: int | None = None,
        dropout: float | None = None,
        lr: float | None = None,
    ) -> None:
        hidden = hp_int("hidden", _HIDDEN) if hidden is None else int(hidden)
        layers = hp_int("layers", _LAYERS) if layers is None else int(layers)
        dropout = hp_float("dropout", _DROPOUT) if dropout is None else float(dropout)
        lr = hp_float("lr", _LR) if lr is None else float(lr)
        # 파이프라인 역할: 키포인트 시퀀스 [N, T, 51] 기반 stacked LSTM 이진 분류
        super().__init__(
            _LstmNet(hidden=hidden, layers=layers, dropout=dropout),
            arch={"hidden": hidden, "layers": layers, "dropout": dropout},
            lr=lr,
        )
