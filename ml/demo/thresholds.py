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

from typing import Final

from demo.temporal_module import _KEY_TO_ARTIFACT
from training.metadata import artifact_dir, load_metadata

NH_RECOMMENDED_THRESHOLDS: Final[dict[str, float]] = {
    "gcn": 0.30,  # 18/19 catches @ 10.5% FP — recall-first frontier
    "random_forest": 0.20,  # 15/19 @ 6.4% FP — balanced point
    "logistic_regression": 0.10,  # 17/19 @ 9.7% FP
    "transformer": 0.133,  # 18/19 @ 16.4% FP (its LE2I op, NH-validated)
}


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
