"""Le2i Fall Detection Dataset — clip metadata loader.

Dataset: Charfi et al., 2013, Universite de Bourgogne / Le2i lab.
RGB .avi clips, single person per video.  Labels come from per-video annotation
.txt files that record the fall frame interval directly (no activity-class
scheme, no timestamp conversion needed).

Annotation format assumption (documented)
-----------------------------------------
Each annotation file is a plain-text file with at least two lines::

    <start_frame>
    <end_frame>

``start_frame == 0`` (or the pair ``(0, 0)``) indicates an ADL (non-fall)
clip; ``parse_fall_interval`` returns ``None`` for those.  Frame numbers are
1-based integers as published in the Le2i dataset release.

NPZ schema assumption (produced by Step-1 extract_poses)
---------------------------------------------------------
Each npz is expected to carry::

    keypoints  : float32[N_frames, 17, 3]  — (x, y, conf) per COCO keypoint
    clip_id    : 0-d str array
    scenario   : 0-d str array
    fps        : 0-d float array (fallback: config.LE2I_FPS)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from training.config import LE2I_FPS

log = logging.getLogger(__name__)


def _npz_scalar_to_str(value: np.ndarray) -> str:
    """Decode an npz 0-d scalar to a Python ``str``.

    ``extract_poses`` stores ``clip_id``/``scenario`` as ``np.bytes_`` (dtype
    ``|S``).  Calling ``str()`` on that 0-d array yields the numpy *repr*
    (``"np.bytes_(b'clip01')"``) rather than the value, which silently breaks
    annotation-file lookup.  Round-trip through ``.item()`` and decode bytes.
    """
    item = value.item() if hasattr(value, "item") else value
    if isinstance(item, bytes):
        return item.decode("utf-8")
    return str(item)


@dataclass(frozen=True, slots=True)
class ClipMeta:
    """Immutable metadata for one Le2i video clip.

    Parameters
    ----------
    clip_id:
        Unique identifier — the npz stem (e.g. ``Coffee_room_fall01``).
    scenario:
        Le2i scenario name (e.g. ``"Coffee_room"``).
    fall_interval:
        ``(start_frame, end_frame)`` inclusive frame numbers of the fall event,
        or ``None`` for ADL clips.  Frames are 1-based as in Le2i annotations.
        Windowing code treats this as a half-open ``[start, end+1)`` range when
        computing overlap fractions.
    fps:
        Clip frame-rate read from the npz (or ``config.LE2I_FPS`` as fallback).
    npz_path:
        Absolute path to the cached pose npz file.
    """

    clip_id: str
    scenario: str
    fall_interval: tuple[int, int] | None
    fps: float
    npz_path: Path

    @property
    def is_fall_clip(self) -> bool:
        """True iff this clip contains a fall event (fall_interval is not None)."""
        return self.fall_interval is not None


# ---------------------------------------------------------------------------
# Annotation parser
# ---------------------------------------------------------------------------


def parse_fall_interval(annotation_path: Path) -> tuple[int, int] | None:
    """Parse a Le2i annotation .txt and return the fall frame interval.

    Le2i annotation format (two-line plain text)::

        <start_frame>   # line 1: fall onset frame (1-based; 0 => ADL)
        <end_frame>     # line 2: fall end frame   (1-based; inclusive)

    Returns
    -------
    tuple[int, int] | None
        ``(start_frame, end_frame)`` when ``start_frame > 0``, else ``None``
        (ADL clip or ``(0, 0)`` pair).

    Raises
    ------
    ValueError
        If the file exists but contains fewer than two parseable integer lines.
    """
    lines = [ln.strip() for ln in annotation_path.read_text().splitlines() if ln.strip()]
    if len(lines) < 2:
        raise ValueError(
            f"Annotation {annotation_path} has fewer than 2 non-empty lines; "
            f"expected <start_frame>\\n<end_frame>."
        )
    start = int(lines[0])
    end = int(lines[1])
    if start == 0:
        return None  # ADL clip: start==0 signals no fall event
    return (start, end)


# ---------------------------------------------------------------------------
# Public loader
# ---------------------------------------------------------------------------


def load_clip_metas(
    pose_cache_dir: Path,
    annotation_dir: Path | None = None,
) -> list[ClipMeta]:
    """Enumerate pose npz files and return a sorted list of ClipMeta objects.

    Files are sorted alphabetically by filename for deterministic ordering,
    which is required for reproducible train/test splits.

    Parameters
    ----------
    pose_cache_dir:
        Directory containing ``*.npz`` pose cache files produced by Step 1.
    annotation_dir:
        Directory containing per-clip annotation ``.txt`` files.  Expected
        file name: ``{clip_id}.txt`` (same stem as the npz).
        If ``None`` or the matching ``.txt`` is absent, ``fall_interval`` is
        set to ``None`` (clip treated as ADL) and a warning is logged.

    Returns
    -------
    list[ClipMeta]
        One entry per npz file, ordered by filename.
    """
    npz_files = sorted(pose_cache_dir.glob("*.npz"))
    if not npz_files:
        log.warning("No .npz files found in %s", pose_cache_dir)
        return []

    metas: list[ClipMeta] = []
    for npz_path in npz_files:
        clip_id = npz_path.stem

        try:
            data = np.load(npz_path, allow_pickle=False)
        except Exception as exc:  # noqa: BLE001 — catch-all to skip corrupt files
            log.warning("Skipping %s — failed to load: %s", npz_path, exc)
            continue

        # Read metadata scalars written by Step-1 extract_poses.
        try:
            stored_clip_id = _npz_scalar_to_str(data["clip_id"])
            scenario = _npz_scalar_to_str(data["scenario"])
        except KeyError:
            # Fallback: derive from filename if Step-1 did not embed the fields.
            log.debug("npz %s missing clip_id/scenario keys — using filename.", npz_path.name)
            stored_clip_id = clip_id
            # Attempt to infer scenario from the npz name prefix matching LE2I_SCENARIOS.
            from training.config import LE2I_SCENARIOS  # local import avoids circular refs

            scenario = next(
                (s for s in LE2I_SCENARIOS if clip_id.startswith(s)),
                "unknown",
            )

        try:
            fps = float(data["fps"])
        except KeyError:
            fps = LE2I_FPS  # documented fallback
            log.debug("npz %s missing fps — using LE2I_FPS=%.1f", npz_path.name, fps)

        # Parse fall interval from annotation file.
        # Attempt two path forms in priority order:
        #   (1) annotation_dir/{clip_id}.txt   — flat / legacy layout
        #   (2) annotation_dir/{scenario}/Annotation_files/{stem}.txt — real Le2i layout
        fall_interval: tuple[int, int] | None = None
        if annotation_dir is not None:
            _stem = stored_clip_id.split("/")[-1]
            ann_path_flat = annotation_dir / f"{stored_clip_id}.txt"
            ann_path_nested = annotation_dir / scenario / "Annotation_files" / f"{_stem}.txt"
            if ann_path_flat.exists():
                resolved_ann_path: Path | None = ann_path_flat
            elif ann_path_nested.exists():
                resolved_ann_path = ann_path_nested
            else:
                resolved_ann_path = None

            if resolved_ann_path is not None:
                try:
                    fall_interval = parse_fall_interval(resolved_ann_path)
                except (ValueError, IndexError) as exc:
                    log.warning(
                        "Could not parse annotation %s: %s — treating as ADL.",
                        resolved_ann_path,
                        exc,
                    )
            else:
                log.warning(
                    "No annotation file for clip %s (tried flat=%s, nested=%s) — treating as ADL.",
                    stored_clip_id,
                    ann_path_flat,
                    ann_path_nested,
                )
        else:
            log.debug("No annotation_dir provided for %s — treating as ADL.", stored_clip_id)

        metas.append(
            ClipMeta(
                clip_id=stored_clip_id,
                scenario=scenario,
                fall_interval=fall_interval,
                fps=fps,
                npz_path=npz_path,
            )
        )

    n_fall = sum(1 for m in metas if m.is_fall_clip)
    log.info(
        "Loaded %d clip metas (%d fall, %d ADL) from %s",
        len(metas),
        n_fall,
        len(metas) - n_fall,
        pose_cache_dir,
    )
    return metas
