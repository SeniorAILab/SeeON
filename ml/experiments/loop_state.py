"""Loop observability and fail-fast state management — Step 14c.

Responsibilities:
- Persist ``ml/experiments/loop_status.json`` after every experiment so a human
  can check progress mid-run without querying the live process.
- Enforce the consecutive-failure fail-fast rule: 3 consecutive recall_90 failures
  OR harness errors → write PAUSED state + report, exit nonzero.
- Enforce the disk-free guard: ``disk_free_gb < 10`` → PAUSED.
- Provide ``list_completed_run_ids`` for journal-based resume (no duplicate
  hypotheses across harness re-starts).

Failure semantics for the counter
-----------------------------------
``succeeded=True``  — experiment completed and ``recall_90_achieved=True``
                     (latency/NH gate results do NOT count as failures here;
                     those are legitimate evaluation outcomes, not search-space
                     breakage).
``succeeded=False`` — recall_90 not achieved OR harness exception; counter++.
Counter resets to 0 on any ``succeeded=True`` call.
"""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any

_CONSECUTIVE_FAILURE_LIMIT: int = 3
_DISK_FREE_THRESHOLD_GB: float = 10.0


# ---------------------------------------------------------------------------
# Disk helper
# ---------------------------------------------------------------------------


def _disk_free_gb(path: Path = Path(".")) -> float:
    """Return free disk space in GiB for the filesystem containing *path*."""
    return shutil.disk_usage(path).free / (1024**3)


# ---------------------------------------------------------------------------
# Status load / save
# ---------------------------------------------------------------------------


def load_loop_status(status_path: Path) -> dict[str, Any]:
    """Load existing loop_status.json or return a fresh default dict."""
    if status_path.exists():
        return json.loads(status_path.read_text(encoding="utf-8"))
    return {
        "state": "running",
        "experiments_completed": 0,
        "total_successes": 0,
        "success_rate": 0.0,
        "elapsed_h": 0.0,
        "disk_free_gb": _disk_free_gb(),
        "consecutive_failures": 0,
        "started_at": None,
        "pause_reason": None,
    }


def _check_fail_fast_reason(status: dict[str, Any]) -> str | None:
    """Return a human-readable pause reason, or ``None`` if the loop should continue."""
    consecutive = status.get("consecutive_failures", 0)
    if consecutive >= _CONSECUTIVE_FAILURE_LIMIT:
        return (
            f"consecutive_failures={consecutive} >= {_CONSECUTIVE_FAILURE_LIMIT}"
            " (recall_90 not achievable or harness errors)"
        )
    disk_gb = status.get("disk_free_gb", float("inf"))
    if disk_gb < _DISK_FREE_THRESHOLD_GB:
        return f"disk_free_gb={disk_gb:.2f} < {_DISK_FREE_THRESHOLD_GB}"
    return None


def update_loop_status(
    status_path: Path,
    *,
    succeeded: bool,
) -> dict[str, Any]:
    """Record one experiment result into ``loop_status.json`` and return updated status.

    Parameters
    ----------
    status_path:
        Path to ``loop_status.json`` (created if absent on first call).
    succeeded:
        ``True`` if ``recall_90_achieved=True`` for this experiment (regardless
        of latency/NH gate outcomes).  ``False`` if recall_90 was not achieved
        or any harness exception occurred.

    Returns
    -------
    dict
        The updated status dict (same object written to disk).
    """
    status = load_loop_status(status_path)

    # Anchor the loop clock on the first experiment.
    now = time.time()
    if status.get("started_at") is None:
        status["started_at"] = now

    # Update counters.
    status["experiments_completed"] = status.get("experiments_completed", 0) + 1
    if succeeded:
        status["total_successes"] = status.get("total_successes", 0) + 1
        status["consecutive_failures"] = 0
    else:
        status["consecutive_failures"] = status.get("consecutive_failures", 0) + 1

    # Derived fields.
    n = status["experiments_completed"]
    s = status.get("total_successes", 0)
    status["success_rate"] = round(s / n, 4) if n > 0 else 0.0
    status["elapsed_h"] = round((now - status["started_at"]) / 3600, 4)
    status["disk_free_gb"] = round(_disk_free_gb(), 2)

    # Fail-fast check.
    reason = _check_fail_fast_reason(status)
    if reason:
        status["state"] = "paused"
        status["pause_reason"] = reason
    else:
        status["state"] = "running"
        status["pause_reason"] = None

    status_path.write_text(json.dumps(status, indent=2), encoding="utf-8")
    return status


# ---------------------------------------------------------------------------
# Helpers used by the harness
# ---------------------------------------------------------------------------


def is_paused(status: dict[str, Any]) -> bool:
    """Return ``True`` when the loop is in PAUSED state."""
    return status.get("state") == "paused"


def write_pause_report(status: dict[str, Any], report_path: Path) -> None:
    """Write a Markdown status report to *report_path* when the loop pauses."""
    reason = status.get("pause_reason", "unknown")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        "# Autoresearch Loop — PAUSED\n\n"
        f"**Reason:** {reason}\n\n"
        "## Snapshot\n\n"
        f"```json\n{json.dumps(status, indent=2)}\n```\n",
        encoding="utf-8",
    )


def list_completed_run_ids(runs_dir: Path) -> set[str]:
    """Return the set of experiment IDs that already have a ``runs/{id}.json``.

    Used by the harness for journal-based resume: an ID found here is skipped
    without re-running (no duplicate hypotheses).
    """
    if not runs_dir.exists():
        return set()
    return {p.stem for p in runs_dir.glob("*.json")}
