"""Lightweight ST-GCN fall classifier (scratch — no pretrained weights).

Architecture: COCO-17 spatial graph convolution + temporal convolution,
stacked in blocks, followed by global average pooling and a linear head.

Input contract (FallClassifier Protocol): ``X`` is [N, T, 51] float32.
The (N, T, 51) → (N, 3, T, 17) reshape is performed *inside* ``forward``
so the external Protocol interface is never broken.

Conforms to :class:`~training.models.base.FallClassifier` via
:class:`~training.models.base.TorchFallClassifier`.
"""

from __future__ import annotations

import torch
import torch.nn as nn

from training.hp import hp_float, hp_int
from training.models.base import TorchFallClassifier

_N_JOINTS = 17  # COCO-17 keypoints
_IN_CHANNELS = 3  # (x, y, conf) per joint per frame


# ---------------------------------------------------------------------------
# Adjacency matrix
# ---------------------------------------------------------------------------


def _coco17_adjacency() -> torch.Tensor:
    """Return a symmetric, degree-normalised COCO-17 adjacency matrix [17, 17].

    Self-loops are included.  Normalisation: D^{-1/2} A D^{-1/2}.
    """
    edges = [
        (0, 1),   # nose - left_eye
        (0, 2),   # nose - right_eye
        (1, 3),   # left_eye - left_ear
        (2, 4),   # right_eye - right_ear
        (3, 5),   # left_ear - left_shoulder
        (4, 6),   # right_ear - right_shoulder
        (5, 6),   # left_shoulder - right_shoulder
        (5, 7),   # left_shoulder - left_elbow
        (7, 9),   # left_elbow - left_wrist
        (6, 8),   # right_shoulder - right_elbow
        (8, 10),  # right_elbow - right_wrist
        (5, 11),  # left_shoulder - left_hip
        (6, 12),  # right_shoulder - right_hip
        (11, 12), # left_hip - right_hip
        (11, 13), # left_hip - left_knee
        (13, 15), # left_knee - left_ankle
        (12, 14), # right_hip - right_knee
        (14, 16), # right_knee - right_ankle
    ]
    A = torch.zeros(_N_JOINTS, _N_JOINTS)
    for i, j in edges:
        A[i, j] = 1.0
        A[j, i] = 1.0
    A.fill_diagonal_(1.0)  # self-loops
    deg = A.sum(dim=1).clamp(min=1.0).pow(-0.5)
    A = deg.unsqueeze(1) * A * deg.unsqueeze(0)
    return A


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------


class _SpatialGraphConv(nn.Module):
    """Graph convolution over the joint (vertex) dimension.

    Aggregates neighbour features using the adjacency matrix then projects
    with a 1×1 convolution.
    """

    def __init__(self, in_ch: int, out_ch: int, A: torch.Tensor) -> None:
        super().__init__()
        self.register_buffer("A", A)
        self.conv = nn.Conv2d(in_ch, out_ch, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (N, C, T, V)
        x = torch.einsum("nctv,vw->nctw", x, self.A)  # type: ignore[arg-type]
        return self.conv(x)


class _StGcnBlock(nn.Module):
    """One ST-GCN block: spatial graph conv → temporal conv → BN → ReLU
    (→ dropout) + residual.  ``dropout=0.0`` is an exact no-op, preserving the
    original block behavior."""

    def __init__(
        self, in_ch: int, out_ch: int, A: torch.Tensor, dropout: float = 0.0
    ) -> None:
        super().__init__()
        self.sgc = _SpatialGraphConv(in_ch, out_ch, A)
        # kernel_size=(9,1) with padding=(4,0) preserves the time dimension
        self.tcn = nn.Conv2d(out_ch, out_ch, kernel_size=(9, 1), padding=(4, 0))
        self.bn = nn.BatchNorm2d(out_ch)
        self.relu = nn.ReLU(inplace=True)
        self.drop = nn.Dropout(dropout)
        self.skip = (
            nn.Conv2d(in_ch, out_ch, kernel_size=1) if in_ch != out_ch else nn.Identity()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = self.skip(x)
        out = self.drop(self.relu(self.bn(self.tcn(self.sgc(x)))))
        return out + residual


# ---------------------------------------------------------------------------
# Full network
# ---------------------------------------------------------------------------


class _StGcnNet(nn.Module):
    """Lightweight ST-GCN: [N, T, 51] input → [N, 2] logits.

    The reshape from Protocol-contract format (N, T, 51) to graph format
    (N, 3, T, 17) is performed here, inside ``forward``, so callers always
    use the standard FallClassifier input shape.
    """

    def __init__(self, hidden: int = 64, n_blocks: int = 2, dropout: float = 0.0) -> None:
        super().__init__()
        A = _coco17_adjacency()
        in_channels = [_IN_CHANNELS] + [hidden] * n_blocks
        self.blocks = nn.ModuleList(
            [
                _StGcnBlock(in_channels[i], in_channels[i + 1], A, dropout=dropout)
                for i in range(n_blocks)
            ]
        )
        self.head = nn.Linear(hidden, 2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (N, T, 51) — Protocol contract input
        N, T, _ = x.shape
        # Reshape to (N, 3, T, 17) for graph-conv processing
        x = x.view(N, T, _N_JOINTS, _IN_CHANNELS).permute(0, 3, 1, 2).contiguous()
        for block in self.blocks:
            x = block(x)
        # Global average pool over time and joints → (N, hidden)
        x = x.mean(dim=(2, 3))
        return self.head(x)


# ---------------------------------------------------------------------------
# Classifier wrapper
# ---------------------------------------------------------------------------


class GcnFallClassifier(TorchFallClassifier):
    """Fall classifier backed by a lightweight ST-GCN.

    Default architecture: 2 ST-GCN blocks with hidden=64 channels, no dropout.
    HP kwargs default to ``HARNESS_HP_*`` env overrides (harness trials;
    ``HARNESS_HP_BLOCKS`` maps to ``n_blocks``), then to the original fixed
    configuration; the resolved architecture is persisted via ``arch.json`` so
    :meth:`~training.models.base.TorchFallClassifier.load` reconstructs it
    without the env.

    Conforms to the :class:`~training.models.base.FallClassifier` Protocol;
    fit / predict_proba / save / load come from :class:`TorchFallClassifier`.
    """

    def __init__(
        self,
        hidden: int | None = None,
        n_blocks: int | None = None,
        dropout: float | None = None,
        lr: float | None = None,
    ) -> None:
        hidden = hp_int("hidden", 64) if hidden is None else int(hidden)
        n_blocks = hp_int("blocks", 2) if n_blocks is None else int(n_blocks)
        dropout = hp_float("dropout", 0.0) if dropout is None else float(dropout)
        lr = hp_float("lr", 1e-3) if lr is None else float(lr)
        # 파이프라인 역할: 키포인트 시퀀스 [N, T, 51] 기반 경량 ST-GCN 이진 분류
        super().__init__(
            _StGcnNet(hidden=hidden, n_blocks=n_blocks, dropout=dropout),
            arch={"hidden": hidden, "n_blocks": n_blocks, "dropout": dropout},
            lr=lr,
        )
