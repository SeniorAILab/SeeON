"""Nursing-Home (NH) evaluation dataset — clip metadata and gold-label CSV parser.

Gold-label CSV schema (``ml/data/eval/nursing-home-gold.csv``)::

    video            : str   — video stem (== fall_id; one fall per clip)
    fall_start_frame : int   — 0-based inclusive frame index of fall onset
    fall_end_frame   : int   — 0-based inclusive frame index of fall end
    fps              : float — clip frame rate
    status           : str   — "proposed" | "confirmed"
    notes            : str   — optional free text (may be absent from CSV)

Frame indices are 0-based inclusive to match OpenCV's ``CAP_PROP_POS_FRAMES``
counter.

Label-consistency validation is applied to every row (plan Step 8, ADR-014
fail-fast policy).  Raises ``ValueError`` on invalid data; no silent skips.

Only ``status=confirmed`` rows count for gate evaluation; ``status=proposed``
rows are returned separately so the labelling agent can review them.

``fall_id`` is the ``video`` field value (stem) — one fall per clip assumption
(plan Step 7 / Step 13b).
"""

from __future__ import annotations

import csv
import logging
from dataclasses import dataclass
from pathlib import Path

from training.config import DATA_ROOT

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default paths (anchored at ml/)
# ---------------------------------------------------------------------------

NH_PROCESSED_DIR: Path = DATA_ROOT / "nursing-home" / "processed"
NH_POSES_DIR: Path = DATA_ROOT / "nursing-home" / "poses"
NH_GOLD_CSV: Path = DATA_ROOT / "eval" / "nursing-home-gold.csv"

_MIN_FALL_FRAMES: int = 5  # minimum inclusive fall duration in frames


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class NHGoldRow:
    """One validated row from ``nursing-home-gold.csv``.

    Parameters
    ----------
    fall_id:
        Video stem (``video`` column value).  Used as the fall identifier
        in ``evaluate_nh`` and ``nh_reference_mask.json`` (plan Step 7/13b).
    fall_start_frame:
        0-based inclusive frame index of fall onset.
    fall_end_frame:
        0-based inclusive frame index of fall end.
    fps:
        Clip frame rate.
    status:
        ``"confirmed"`` (counts for gate evaluation) or ``"proposed"`` (pending
        human review).
    notes:
        Optional free-text annotation note.
    """

    fall_id: str
    fall_start_frame: int
    fall_end_frame: int
    fps: float
    status: str
    notes: str


# ---------------------------------------------------------------------------
# Label-consistency validation
# ---------------------------------------------------------------------------


def _validate_row(row: NHGoldRow, video_length: int | None = None) -> None:
    """Raise ``ValueError`` on any label-consistency violation (plan Step 8).

    Checks applied
    --------------
    * ``fall_start_frame < fall_end_frame``
    * ``fall_end_frame - fall_start_frame + 1 >= _MIN_FALL_FRAMES``
    * ``fall_end_frame < video_length`` when *video_length* is supplied

    Parameters
    ----------
    row:
        The row to validate.
    video_length:
        Total frame count of the corresponding video clip.  When supplied,
        ``fall_end_frame`` must be strictly less than this value.

    Raises
    ------
    ValueError
        On any violated constraint.
    """
    if row.fall_start_frame >= row.fall_end_frame:
        raise ValueError(
            f"[{row.fall_id}] fall_start_frame ({row.fall_start_frame}) must be "
            f"strictly less than fall_end_frame ({row.fall_end_frame})."
        )
    duration = row.fall_end_frame - row.fall_start_frame + 1
    if duration < _MIN_FALL_FRAMES:
        raise ValueError(
            f"[{row.fall_id}] fall duration {duration} frames is below the minimum "
            f"{_MIN_FALL_FRAMES} frames "
            f"(start={row.fall_start_frame}, end={row.fall_end_frame})."
        )
    if video_length is not None and row.fall_end_frame >= video_length:
        raise ValueError(
            f"[{row.fall_id}] fall_end_frame ({row.fall_end_frame}) must be less "
            f"than video_length ({video_length})."
        )


# ---------------------------------------------------------------------------
# CSV parser  (follows le2i.parse_fall_interval style)
# ---------------------------------------------------------------------------


def parse_gold_csv(
    csv_path: Path,
    video_lengths: dict[str, int] | None = None,
) -> tuple[list[NHGoldRow], list[NHGoldRow]]:
    """Parse ``nursing-home-gold.csv`` and return ``(confirmed, proposed)`` rows.

    Follows the annotation-parsing style of
    :func:`training.data.le2i.parse_fall_interval`: fail-fast (``ValueError``)
    on malformed or inconsistent data; no silent skips (ADR-014).

    Parameters
    ----------
    csv_path:
        Path to the gold-label CSV file.
    video_lengths:
        Optional ``{fall_id: n_frames}`` mapping for video-length validation.
        When supplied, any row with ``fall_end_frame >= n_frames`` is rejected.

    Returns
    -------
    tuple[list[NHGoldRow], list[NHGoldRow]]
        ``(confirmed_rows, proposed_rows)``.  Gate evaluation uses only
        ``confirmed_rows``; ``proposed_rows`` are returned for labelling review.

    Raises
    ------
    FileNotFoundError
        When *csv_path* does not exist.
    ValueError
        On any malformed field or label-consistency violation.
    """
    if not csv_path.exists():
        raise FileNotFoundError(f"NH gold CSV not found: {csv_path}")

    confirmed: list[NHGoldRow] = []
    proposed: list[NHGoldRow] = []

    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for lineno, raw in enumerate(reader, start=2):  # line 1 = header
            fall_id = raw.get("video", "").strip()
            if not fall_id:
                raise ValueError(f"Line {lineno}: empty or missing 'video' field.")

            try:
                fall_start = int(raw["fall_start_frame"])
                fall_end = int(raw["fall_end_frame"])
                fps_val = float(raw["fps"])
            except (KeyError, ValueError) as exc:
                raise ValueError(
                    f"Line {lineno} [{fall_id}]: cannot parse numeric fields — {exc}"
                ) from exc

            status = raw.get("status", "").strip().lower()
            if status not in ("confirmed", "proposed"):
                raise ValueError(
                    f"Line {lineno} [{fall_id}]: 'status' must be 'confirmed' or "
                    f"'proposed', got {status!r}."
                )

            notes = raw.get("notes", "").strip()

            row = NHGoldRow(
                fall_id=fall_id,
                fall_start_frame=fall_start,
                fall_end_frame=fall_end,
                fps=fps_val,
                status=status,
                notes=notes,
            )
            vlen = (video_lengths or {}).get(fall_id)
            _validate_row(row, video_length=vlen)

            if status == "confirmed":
                confirmed.append(row)
            else:
                proposed.append(row)

    log.info(
        "Parsed %s: %d confirmed, %d proposed rows",
        csv_path.name,
        len(confirmed),
        len(proposed),
    )
    return confirmed, proposed


# ---------------------------------------------------------------------------
# Video enumerator
# ---------------------------------------------------------------------------


def enumerate_processed_videos(
    processed_dir: Path = NH_PROCESSED_DIR,
) -> list[Path]:
    """Return sorted list of ``.mp4`` / ``.avi`` paths in *processed_dir*.

    Parameters
    ----------
    processed_dir:
        NH processed video directory (``ml/data/nursing-home/processed/``).

    Returns
    -------
    list[Path]
        Sorted video paths found; empty list (with a warning) when the directory
        is absent or contains no matching files.
    """
    if not processed_dir.exists():
        log.warning("NH processed directory not found: %s", processed_dir)
        return []

    videos = sorted(list(processed_dir.glob("*.mp4")) + list(processed_dir.glob("*.avi")))
    if not videos:
        log.warning("No .mp4/.avi files found in %s", processed_dir)
    return videos
