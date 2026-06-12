"""Per-model decision-threshold defaults for the demo threshold slider.

Resolution order (``default_threshold``):

1. ``NH_RECOMMENDED_THRESHOLDS`` — operating points measured on the 19
   human-confirmed nursing-home falls + 9,158 no-fall windows
   (``ml/experiments/analysis/phase3-step2-nh-threshold-policy.md``, v2).
   These live here, committed, because ``metadata.json`` is overwritten on
   every retrain and only ever carries the LE2I-calibrated threshold.
2. The artifact's own ``metadata.json`` ``operating_threshold`` (LE2I op).

Keys are demo keys (underscore form). Families absent from the NH table
(svm: capability-capped on NH; lstm: retired) intentionally fall through
to their LE2I threshold.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from training.metadata import artifact_dir, load_metadata
from demo.temporal_module import _KEY_TO_ARTIFACT

NH_RECOMMENDED_THRESHOLDS: Final[dict[str, float]] = {
    "gcn": 0.30,  # 18/19 catches @ 10.5% FP — recall-first frontier
    "random_forest": 0.20,  # 15/19 @ 6.4% FP — balanced point
    "logistic_regression": 0.10,  # 17/19 @ 9.7% FP
    "transformer": 0.133,  # 18/19 @ 16.4% FP (its LE2I op, NH-validated)
}


@dataclass(frozen=True, slots=True)
class OperatingPreset:
    """A named (model, threshold) operating point — one click sets both."""

    label: str
    key: str  # demo classifier key
    threshold: float
    description: str


# The gate-2 frontier candidates (phase3-step2 v2) as one-click presets, so an
# operator can A/B the actual adoption decision without dialing model+slider.
GATE2_PRESETS: Final[tuple[OperatingPreset, ...]] = (
    OperatingPreset(
        label="GCN @ 0.30",
        key="gcn",
        threshold=0.30,
        description="재현율 우선 — 낙상 18/19 포착, 오경보 10.5% (gate-2 후보 A)",
    ),
    OperatingPreset(
        label="RF @ 0.20",
        key="random_forest",
        threshold=0.20,
        description="균형형 — 낙상 15/19 포착, 오경보 6.4% (gate-2 후보 B)",
    ),
)


def default_threshold(key: str) -> float | None:
    """Return the slider default for a temporal model key, or None if unknown.

    NH-measured operating point when available, else the artifact's LE2I
    ``operating_threshold``; None when the artifact (metadata.json) is absent.
    """
    if key in NH_RECOMMENDED_THRESHOLDS:
        return NH_RECOMMENDED_THRESHOLDS[key]
    artifact_key = _KEY_TO_ARTIFACT.get(key)
    if artifact_key is None:
        return None
    adir = artifact_dir(artifact_key)
    if not (adir / "metadata.json").exists():
        return None
    return float(load_metadata(adir).operating_threshold)
