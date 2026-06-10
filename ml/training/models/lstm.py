"""LSTM-based fall classifier.

Architecture: LSTM(51 → 128, 2 layers, dropout=0.3) → last hidden state →
Linear(128 → 2).  Conforms to :class:`~training.models.base.FallClassifier`.
"""

from __future__ import annotations

import torch
import torch.nn as nn

from training.config import KPT_VECTOR_DIM
from training.models.base import TorchFallClassifier

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


class LstmFallClassifier(TorchFallClassifier):
    """Fall classifier backed by a two-layer LSTM.

    Conforms to the :class:`~training.models.base.FallClassifier` Protocol;
    fit / predict_proba / save / load come from :class:`TorchFallClassifier`.
    """

    def __init__(self) -> None:
        # 파이프라인 역할: 키포인트 시퀀스 [N, T, 51] 기반 2-layer LSTM 이진 분류
        super().__init__(_LstmNet())
