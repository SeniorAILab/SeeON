"""One-shot bed-ROI detector for the bed-exit demo (issue #100).

The bed is static, so its region is detected **once** at stream/playback start
with a COCO-detection weight (``yolo26n.pt``, class 59 = ``bed``) and the ROI is
cached by the caller. Every subsequent frame keeps the single YOLO26-pose pass
(ADR-005 §3) — this detector never runs per frame.

``BedDetector`` is intentionally stateless per call and owns no frame source:
the page reads one seed frame, calls :meth:`BedDetector.detect`, then iterates
the rest. The runner is injectable so unit tests can stub inference without a
real model (no ultralytics import on the test path).
"""

from __future__ import annotations

from pathlib import Path
from typing import Final, Protocol

from numpy.typing import NDArray

from demo.seam import BoundingBox, Frame

# bed-localization weight cache — a function axis under ml/models/ alongside
# pose/ and fall/ (docs/rules/ml-models.md; gitignored, never committed).
BED_WEIGHTS_DIR: Final = Path(__file__).resolve().parent.parent / "models" / "bed"
BED_WEIGHT_FILENAME: Final = "yolo26n.pt"


def bed_weight_path() -> Path:
    """Resolve the bed COCO-det weight under the ml/models/bed/ cache."""
    return BED_WEIGHTS_DIR / BED_WEIGHT_FILENAME


class BedRunner(Protocol):
    """Minimal inference seam: one frame in → bed boxes."""

    def detect_beds(
        self, frame: NDArray
    ) -> tuple[tuple[int, int, int, int, float], ...]: ...


class BedDetector:
    """Detect the static bed ROIs from a single seed frame.

    Returns an empty tuple when no bed is present (or the weight exposes no
    "bed" class) — the graceful "침대 없음" state, never an exception.
    """

    def __init__(self, runner: BedRunner | None = None) -> None:
        self._runner = runner if runner is not None else _default_runner()

    def detect(self, frame: Frame) -> tuple[BoundingBox, ...]:
        from demo.yolo_runtime import BED_MAX_DETECTIONS, dedupe_bed_boxes

        deduped = dedupe_bed_boxes(
            self._runner.detect_beds(frame.image),
            max_beds=BED_MAX_DETECTIONS,
        )
        return tuple(
            BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2, confidence=conf)
            for x1, y1, x2, y2, conf in deduped
        )


def _default_runner() -> BedRunner:
    """Construct the real YOLO bed runner, ensuring the weight cache dir exists.

    Imported lazily so importing this module (e.g. for the stubbed unit tests)
    does not pull in ultralytics.
    """
    from demo.yolo_runtime import YoloBedRunner

    BED_WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    return YoloBedRunner(model_path=str(bed_weight_path()))
