"""Benchmark: drive the full pipeline over a video clip as fast as possible.

Usage:
    uv run python -m demo.live_bench --json [--video PATH] [--limit N]

Output (--json): one JSON line to stdout:
    {"fps": float, "latency_ms": float, "frames": int}

All diagnostic output goes to stderr.
Pass criterion (evaluator): fps >= 10 AND latency_ms <= 500.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any


class _LimitedSource:
    """Wrap any FrameSource and stop after ``limit`` frames."""

    def __init__(self, inner: Any, limit: int) -> None:
        self._inner = inner
        self._limit = limit

    def __iter__(self):  # type: ignore[override]
        for i, frame in enumerate(self._inner):
            if i >= self._limit:
                break
            yield frame


def measure_pipeline(source: Any, model: Any) -> dict[str, float | int]:
    """Pure measurement loop: drive source through model, return metrics dict.

    Takes any FrameSource-compatible source and any ModelModule-compatible model
    so the function is testable with fakes without loading real weights.
    Returns {"fps": float, "latency_ms": float, "frames": int}.
    """
    from demo.live_view import iter_live_frames

    t_start = time.perf_counter()
    t_prev = t_start
    count = 0
    latencies: list[float] = []

    for _ in iter_live_frames(source, model):
        t_now = time.perf_counter()
        latencies.append((t_now - t_prev) * 1000)
        t_prev = t_now
        count += 1

    elapsed = time.perf_counter() - t_start
    fps = count / elapsed if elapsed > 0 else 0.0
    mean_latency = sum(latencies) / len(latencies) if latencies else 0.0
    return {"fps": round(fps, 2), "latency_ms": round(mean_latency, 2), "frames": count}


def _find_newest_clip(processed_dir: Path) -> Path | None:
    if not processed_dir.exists():
        return None
    candidates = sorted(
        (p for p in processed_dir.iterdir() if p.is_file()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def _write_synthetic_video(path: Path, n_frames: int = 60) -> Path:
    """Write a tiny synthetic video for benchmarking when no real clip is available."""
    import cv2
    import numpy as np

    fourcc = cv2.VideoWriter_fourcc(*"MJPG")
    writer = cv2.VideoWriter(str(path), fourcc, 30.0, (64, 48))
    for i in range(n_frames):
        frame = np.full((48, 64, 3), (i * 4) % 256, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return path


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Drive the full fall-detection pipeline and measure fps/latency."
    )
    parser.add_argument("--json", action="store_true", help="Output metrics as JSON to stdout")
    parser.add_argument("--video", type=str, default=None, help="Video file path to benchmark")
    parser.add_argument(
        "--limit", type=int, default=120, help="Max frames to process (default 120)"
    )
    args = parser.parse_args(argv)

    # ml/ root must be on sys.path when run as `python -m demo.live_bench` from ml/.
    # pythonpath=["."]] in pyproject.toml covers pytest; this covers __main__.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    from demo.classifiers import ClassifierParams
    from demo.demo_ui import build_model
    from worker.sources import VideoFileSource

    # Resolve video path.
    if args.video:
        video_path = Path(args.video)
        if not video_path.exists():
            print(f"ERROR: --video path does not exist: {video_path}", file=sys.stderr)
            sys.exit(1)
    else:
        data_dir = Path(__file__).resolve().parent.parent / "data" / "processed"
        video_path = _find_newest_clip(data_dir)
        if video_path is None:
            # No real clip available — generate a tiny synthetic one in a temp dir.
            import tempfile

            tmp = tempfile.mkdtemp(prefix="live_bench_")
            synthetic = Path(tmp) / "synthetic.avi"
            _write_synthetic_video(synthetic, n_frames=max(args.limit, 60))
            print(
                f"No clip found under {data_dir}; using synthetic video: {synthetic}",
                file=sys.stderr,
            )
            video_path = synthetic

    print(f"Video:  {video_path}", file=sys.stderr)
    print(f"Limit:  {args.limit} frames", file=sys.stderr)

    # Use smallest pose size to minimise weight download time on CI.
    params = ClassifierParams(confidence=0.05)
    model = build_model("n", None, params)

    source = _LimitedSource(VideoFileSource(video_path, frame_stride=1), args.limit)

    print("Running pipeline...", file=sys.stderr)
    metrics = measure_pipeline(source, model)

    print(f"Result: {metrics}", file=sys.stderr)

    if args.json:
        print(json.dumps(metrics))
    else:
        print(metrics)


if __name__ == "__main__":
    main()
