"""Propose NH gold fall windows on PROCESSED videos and render review strips.

Re-detection pipeline (processed clips are canonical — the raw-based pass is
discarded):

1. Extract per-track poses for every processed clip via
   ``evaluate_nh._extract_track_poses`` (npz cache keyed by processed stem).
2. Heuristic fall-candidate search per track: sustained hip-centre descent
   (normalised y rising) ending in a low resting posture.  The top-scoring
   event per video becomes the proposal; runner-up events are kept in the
   JSON for reviewer awareness.
3. Render review strips per video into ``ml/data/eval/gold-review/{stem}/``:
   ``start-f{N}-strip.jpg``, ``end-f{N}-strip.jpg`` (5 tiles around the
   boundary) and ``overview-strip.jpg`` (12 tiles spanning the clip, for
   no-fall verification).
4. Write ``ml/data/eval/gold-review/candidates.json`` summarising every clip.

The proposals are NOT labels — a reviewer (agent + human) inspects the strips
and writes the gold CSV separately.

CLI::

    python -m training.propose_nh_gold [--limit N] [--stems S1 S2 ...]
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from training.config import DATA_ROOT
from training.data.nursing_home import NH_POSES_DIR, NH_PROCESSED_DIR

log = logging.getLogger(__name__)

GOLD_REVIEW_DIR: Path = DATA_ROOT / "eval" / "gold-review"

_SMOOTH_WIN = 5
_MIN_EVENT_RISE = 0.08  # min normalised hip-y rise to call something an event
_REST_VELOCITY = 0.002  # |dy/dt| below this counts as "at rest"
_REST_FRAMES = 4  # consecutive rest frames that close an event
_STRIP_TILE_H = 320
_STRIP_STEPS = (-8, -4, 0, 4, 8)  # tile offsets around a boundary frame
_OVERVIEW_TILES = 24
_OVERVIEW_COLS = 4


# ---------------------------------------------------------------------------
# Heuristic event detection (pure numpy — unit-testable)
# ---------------------------------------------------------------------------


def _hip_y_series(poses: NDArray[np.float32]) -> NDArray[np.float32]:
    """Normalised hip-centre y per frame; NaN where the track has no detection.

    Falls back to the torso quad (shoulders 5,6 + hips 11,12) when the hip
    keypoints failed the confidence gate.
    """
    hips = poses[:, (11, 12), :]
    torso = poses[:, (5, 6, 11, 12), :]
    out = np.full(poses.shape[0], np.nan, dtype=np.float32)
    for t in range(poses.shape[0]):
        pts = hips[t][hips[t, :, 2] > 0]
        if pts.shape[0] == 0:
            pts = torso[t][torso[t, :, 2] > 0]
        if pts.shape[0] > 0:
            out[t] = float(pts[:, 1].mean())
    return out


def _smooth_nan(series: NDArray[np.float32], win: int = _SMOOTH_WIN) -> NDArray[np.float32]:
    """Moving average that ignores NaN gaps (short occlusions)."""
    n = series.shape[0]
    out = np.full(n, np.nan, dtype=np.float32)
    half = win // 2
    for t in range(n):
        seg = series[max(0, t - half) : t + half + 1]
        vals = seg[~np.isnan(seg)]
        if vals.shape[0] > 0:
            out[t] = float(vals.mean())
    return out


def detect_descent_events(poses: NDArray[np.float32]) -> list[dict]:
    """Find sustained hip-descent events in one track's dense pose array.

    Returns a list of ``{start, end, rise, final_y}`` dicts sorted by ``rise``
    (descending).  ``start`` is the onset of downward motion, ``end`` the first
    frame at rest after the descent — both 0-based processed-frame indices.
    """
    return _detect_on_series(_hip_y_series(poses))


def _dedupe_events(events: list[dict]) -> list[dict]:
    """Keep the highest-rise event of every overlapping interval cluster."""
    events = sorted(events, key=lambda e: e["rise"], reverse=True)
    kept: list[dict] = []
    for ev in events:
        if all(ev["end"] < k["start"] or ev["start"] > k["end"] for k in kept):
            kept.append(ev)
    return kept


def _detect_slow_events(
    series: NDArray[np.float32], windows: tuple[int, ...] = (30, 90, 240)
) -> list[dict]:
    """Window-rise scan for SLOW descents (e.g. walker users folding over
    several seconds) whose per-frame velocity never exceeds the rest band.

    For each window size, frames maximising ``y[t+W] - y[t]`` above the rise
    threshold become events; boundaries are refined to the last near-minimum
    and first near-maximum frame inside the window.
    """
    y = _smooth_nan(series, 9)
    n = y.shape[0]
    events: list[dict] = []
    for win in windows:
        if n <= win:
            continue
        rise = np.full(n, np.nan, dtype=np.float32)
        rise[: n - win] = y[win:] - y[: n - win]
        order = np.argsort(-np.nan_to_num(rise, nan=-9.0))
        used = np.zeros(n, dtype=bool)
        for t in order[:50]:
            r = float(rise[t]) if not np.isnan(rise[t]) else -9.0
            if r < _MIN_EVENT_RISE:
                break
            if used[max(0, t - win) : t + win].any():
                continue
            used[t : t + win + 1] = True
            seg = y[t : t + win + 1]
            valid = ~np.isnan(seg)
            if not valid.any():
                continue
            smin, smax = float(np.nanmin(seg)), float(np.nanmax(seg))
            lo = smin + 0.15 * (smax - smin)
            hi = smax - 0.15 * (smax - smin)
            idxs = np.arange(t, t + seg.shape[0])
            below = idxs[valid & (seg <= lo)]
            above = idxs[valid & (seg >= hi)]
            if below.shape[0] == 0 or above.shape[0] == 0:
                continue
            start = int(below[below < above[0]][-1]) if (below < above[0]).any() else int(below[0])
            end = int(above[above > start][0]) if (above > start).any() else int(above[-1])
            if end - start < 3:
                continue
            events.append(
                {
                    "start": start,
                    "end": end,
                    "rise": round(r, 4),
                    "final_y": round(float(y[min(end, n - 1)]), 4),
                }
            )
    return events


def _detect_on_series(series: NDArray[np.float32]) -> list[dict]:
    """Descent-event search on a raw (unsmoothed) normalised-y series."""
    y = _smooth_nan(series)
    n = y.shape[0]
    vel = np.full(n, np.nan, dtype=np.float32)
    vel[1:] = y[1:] - y[:-1]

    events: list[dict] = []
    t = 1
    while t < n:
        if np.isnan(vel[t]) or vel[t] <= 0:
            t += 1
            continue
        # Downward motion started — extend while net motion keeps descending,
        # tolerating brief pauses/occlusions, until rest is sustained.
        start = t
        rest_run = 0
        peak_end = t
        while t < n and rest_run < _REST_FRAMES:
            if np.isnan(vel[t]):
                rest_run += 1
            elif abs(float(vel[t])) <= _REST_VELOCITY:
                rest_run += 1
            else:
                rest_run = 0
                if float(vel[t]) > 0:
                    peak_end = t
            t += 1
        end = min(peak_end + _REST_FRAMES, n - 1)
        y_start = y[max(start - 1, 0)]
        y_end = y[min(end, n - 1)]
        if not (np.isnan(y_start) or np.isnan(y_end)):
            rise = float(y_end - y_start)
            if rise >= _MIN_EVENT_RISE:
                events.append(
                    {
                        "start": int(max(start - 1, 0)),
                        "end": int(end),
                        "rise": round(rise, 4),
                        "final_y": round(float(y_end), 4),
                    }
                )
    events.sort(key=lambda e: e["rise"], reverse=True)
    return events


# ---------------------------------------------------------------------------
# Strip rendering
# ---------------------------------------------------------------------------


def _grab_frames(video_path: Path, indices: list[int]) -> dict[int, NDArray[np.uint8]]:
    """Decode the requested frame indices (sequential single pass)."""
    wanted = sorted(set(i for i in indices if i >= 0))
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    got: dict[int, NDArray[np.uint8]] = {}
    idx = 0
    while wanted and idx <= wanted[-1]:
        ret, frame = cap.read()
        if not ret:
            break
        if idx in wanted:
            got[idx] = frame
        idx += 1
    cap.release()
    return got


def _tile(frame: NDArray[np.uint8], label: str) -> NDArray[np.uint8]:
    h, w = frame.shape[:2]
    scale = _STRIP_TILE_H / h
    tile = cv2.resize(frame, (int(w * scale), _STRIP_TILE_H))
    cv2.rectangle(tile, (0, 0), (130, 28), (0, 0, 0), -1)
    cv2.putText(tile, label, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    return tile


def render_strip(
    video_path: Path, out_path: Path, frame_indices: list[int], cols: int | None = None
) -> None:
    """Lay the labelled frames out as one jpg — a row, or a grid of *cols*."""
    frames = _grab_frames(video_path, frame_indices)
    tiles = [_tile(frames[i], f"f{i}") for i in frame_indices if i in frames]
    if not tiles:
        log.warning("No frames decodable for %s — strip skipped", out_path.name)
        return
    if cols is None or len(tiles) <= cols:
        strip = cv2.hconcat(tiles)
    else:
        blank = np.zeros_like(tiles[0])
        rows = []
        for r in range(0, len(tiles), cols):
            row = tiles[r : r + cols]
            row.extend([blank] * (cols - len(row)))
            rows.append(cv2.hconcat(row))
        strip = cv2.vconcat(rows)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), strip, [cv2.IMWRITE_JPEG_QUALITY, 85])


# ---------------------------------------------------------------------------
# Per-video proposal
# ---------------------------------------------------------------------------


def propose_for_video(video_path: Path, poses_dir: Path, runner: object) -> dict:
    """Extract poses (cached), detect events, render strips for one clip."""
    from training.evaluate_nh import _extract_track_poses

    stem = video_path.stem
    npz_paths = sorted(poses_dir.glob(f"{stem}__track*.npz"))
    if not npz_paths:
        npz_paths = _extract_track_poses(video_path, poses_dir, stem, runner)

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    all_events: list[dict] = []
    per_track_y: list[NDArray[np.float32]] = []
    for npz_path in npz_paths:
        poses = np.load(npz_path)["poses"]
        per_track_y.append(_hip_y_series(poses))
        for ev in detect_descent_events(poses):
            ev["track"] = npz_path.stem.rsplit("__", 1)[-1]
            all_events.append(ev)

    # Greedy-IoU tracks fragment heavily on CCTV footage, splitting one fall
    # across several short tracks. The per-frame "lowest person" aggregate
    # (max hip-y over all detected persons) is fragmentation-proof.
    if per_track_y:
        min_len = min(s.shape[0] for s in per_track_y)
        stacked = np.stack([s[:min_len] for s in per_track_y], axis=0)
        with np.errstate(all="ignore"):
            aggregate = np.nanmax(stacked, axis=0).astype(np.float32)
        for ev in _detect_on_series(aggregate):
            ev["track"] = "aggregate"
            all_events.append(ev)
        for ev in _detect_slow_events(aggregate):
            ev["track"] = "aggregate-slow"
            all_events.append(ev)

    all_events = _dedupe_events(all_events)
    top = all_events[0] if all_events else None

    review_dir = GOLD_REVIEW_DIR / stem
    if top is not None:
        start, end = top["start"], top["end"]
        render_strip(
            video_path,
            review_dir / f"start-f{start}-strip.jpg",
            [start + d for d in _STRIP_STEPS],
        )
        render_strip(
            video_path,
            review_dir / f"end-f{end}-strip.jpg",
            [end + d for d in _STRIP_STEPS],
        )
    overview_idx = sorted(
        set(int(i) for i in np.linspace(0, max(n_frames - 1, 0), _OVERVIEW_TILES))
    )
    render_strip(
        video_path,
        review_dir / "overview-strip.jpg",
        overview_idx,
        cols=_OVERVIEW_COLS,
    )

    return {
        "stem": stem,
        "fps": round(float(fps), 2),
        "n_frames": n_frames,
        "n_tracks": len(npz_paths),
        "top_event": top,
        "events_top5": all_events[:5],
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--stems", nargs="*", default=None)
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from core.model_modules import pose_weight_path
    from core.yolo_runtime import YoloPoseRunner

    videos = sorted(NH_PROCESSED_DIR.glob("*.mp4")) + sorted(NH_PROCESSED_DIR.glob("*.avi"))
    if args.stems:
        videos = [v for v in videos if v.stem in set(args.stems)]
    if args.limit:
        videos = videos[: args.limit]
    log.info("Proposing on %d processed videos", len(videos))

    NH_POSES_DIR.mkdir(parents=True, exist_ok=True)
    runner = YoloPoseRunner(model_path=str(pose_weight_path("n")))

    results: list[dict] = []
    for video_path in videos:
        log.info("=== %s", video_path.name)
        results.append(propose_for_video(video_path, NH_POSES_DIR, runner))

    GOLD_REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    out_json = GOLD_REVIEW_DIR / "candidates.json"
    out_json.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    n_with_event = sum(1 for r in results if r["top_event"] is not None)
    log.info(
        "Done: %d/%d videos with a candidate event — %s",
        n_with_event,
        len(results),
        out_json,
    )


if __name__ == "__main__":
    main()
