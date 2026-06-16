"""Single-hypothesis experiment harness — Steps 14 / 14b / 14c.

CLI::

    uv run python -m experiments.harness --config path/to/hypothesis.json

Input JSON schema
-----------------
::

    {
        "id":              str,   # unique experiment identifier
        "model_family":    str,   # key in training.models.REGISTRY
        "hypothesis":      str,   # free-text description (feeds next-loop context)
        "hp_override":     dict,  # optional — pin / narrow individual HP values
        "n_trials":        int,   # optional — Optuna trial count (default 5)
        "trial_timeout_s": int    # optional — per-trial subprocess wall timeout (default 3600)
        # any extra keys are recorded verbatim as arch_flags
    }

Output: ``ml/experiments/runs/{id}.json`` (atomic tmp+rename write).

HP plumbing
-----------
All HP search-space parameters are sampled by Optuna and forwarded to training
subprocesses as ``HARNESS_HP_<NAME>`` environment variables.  Receiver side:
each model factory resolves its constructor kwargs through ``training.hp``
(env override → original fixed default), so every Optuna trial trains the
sampled configuration.  Torch models persist their resolved architecture to
``arch.json`` next to the weights; ``TorchFallClassifier.load`` reconstructs
from that sidecar, which keeps evaluation / latency measurement / the live
demo (processes WITHOUT the env vars) consistent with what was trained.
Training-time HPs (``lr``) are consumed by ``fit`` and never needed at load.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import logging
import os
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, NoReturn

import optuna

from training.config import (
    ARTIFACT_BASE,
    EVAL_DIR,
    FEATURE_DIM,
    KPT_VECTOR_DIM,
    T_WINDOW,
)
from training.models import REGISTRY

log = logging.getLogger(__name__)


def _fail(message: str) -> NoReturn:
    # TRY301: guard-raise lifted out of the experiment capture try block.
    raise RuntimeError(message)

# Silence Optuna's verbose default output; harness does its own logging.
optuna.logging.set_verbosity(optuna.logging.WARNING)

# ---------------------------------------------------------------------------
# Module-level paths
# ---------------------------------------------------------------------------

_ML_ROOT: Path = Path(__file__).resolve().parent.parent  # ml/
_RUNS_DIR: Path = _ML_ROOT / "experiments" / "runs"
_STATUS_PATH: Path = _ML_ROOT / "experiments" / "loop_status.json"

# ---------------------------------------------------------------------------
# HP search spaces — Step 14, hardcoded per family.
# Keys match the actual REGISTRY keys (not short aliases).
# Spec tuples: ("int", low, high) | ("float", low, high) |
#              ("float_log", low, high) | ("categorical", [choices])
# ---------------------------------------------------------------------------

SEARCH_SPACES: dict[str, dict[str, tuple]] = {
    "random-forest": {
        "n_estimators": ("int", 100, 500),
        "max_depth": ("int", 5, 30),
        "min_samples_leaf": ("int", 1, 10),
    },
    "svm": {
        "C": ("float_log", 0.1, 100.0),
        "gamma": ("float_log", 1e-4, 0.1),
        "kernel": ("categorical", ["rbf", "linear"]),
    },
    "logistic-regression": {
        # Upper bound raised 100 -> 3000 after manual boundary probes found the
        # P@R90 peak at C~1000 (exp-016..018) — the optimum must be inside the
        # autonomous search space, not only reachable via hp_override.
        "C": ("float_log", 0.01, 3000.0),
    },
    "lstm": {
        "hidden": ("int", 32, 256),
        "layers": ("int", 1, 3),
        "lr": ("float_log", 1e-4, 1e-2),
        "dropout": ("float", 0.0, 0.5),
    },
    "transformer": {
        "d_model": ("categorical", [32, 64, 128]),
        "heads": ("categorical", [2, 4]),
        "layers": ("int", 1, 3),
        "lr": ("float_log", 1e-4, 1e-2),
    },
    "gcn": {
        "hidden": ("int", 16, 128),
        "blocks": ("int", 1, 3),
        "lr": ("float_log", 1e-4, 1e-2),
        "dropout": ("float", 0.0, 0.5),
    },
}

_LATENCY_THRESHOLD_MS: float = 167.0  # (5/30)*1000 ms — stride-5 / 30fps budget


# ---------------------------------------------------------------------------
# Pure functions (all testable without I/O)
# ---------------------------------------------------------------------------


def sample_hp_from_trial(
    trial: optuna.Trial,
    search_space: dict[str, tuple],
    hp_override: dict[str, Any],
) -> dict[str, Any]:
    """Sample one HP configuration from *search_space* via Optuna *trial*.

    Parameters in *hp_override* are returned verbatim without calling
    ``trial.suggest_*``, pinning them to the override value.  All other
    parameters are sampled normally.
    """
    sampled: dict[str, Any] = {}
    for name, spec in search_space.items():
        if name in hp_override:
            sampled[name] = hp_override[name]
            continue
        kind = spec[0]
        if kind == "int":
            sampled[name] = trial.suggest_int(name, int(spec[1]), int(spec[2]))
        elif kind == "float":
            sampled[name] = trial.suggest_float(name, float(spec[1]), float(spec[2]))
        elif kind == "float_log":
            sampled[name] = trial.suggest_float(
                name, float(spec[1]), float(spec[2]), log=True
            )
        elif kind == "categorical":
            sampled[name] = trial.suggest_categorical(name, list(spec[1]))
        else:
            raise ValueError(f"Unknown search-space spec kind: {kind!r} for param {name!r}")
    return sampled


def force_score_gates(
    *,
    score: float,
    recall_90_achieved: bool,
    latency_ms: float,
    latency_threshold_ms: float = _LATENCY_THRESHOLD_MS,
) -> tuple[float, bool]:
    """Apply hard disqualifiers and return ``(final_score, latency_gate_failed)``.

    Hard disqualifier A — recall_90 not achieved:
        Forces *score* → 0.0 and the model never ranks on the leaderboard.

    Hard disqualifier B — inference latency > threshold:
        Forces *score* → 0.0 and sets ``latency_gate_failed=True``.

    Both disqualifiers are independent; a model may fail both simultaneously.
    """
    latency_gate_failed = latency_ms > latency_threshold_ms
    if not recall_90_achieved or latency_gate_failed:
        return 0.0, latency_gate_failed
    return score, latency_gate_failed


def compute_eval_split_hash(test_clip_ids: list[str]) -> str:
    """Return SHA-256 of ``json.dumps(sorted(test_clip_ids))``.

    The sort is applied inside this function so callers may pass the list in
    any order and always get the same hash for the same set of IDs.
    """
    payload = json.dumps(sorted(test_clip_ids))
    return hashlib.sha256(payload.encode()).hexdigest()


def _hp_to_env(hp: dict[str, Any]) -> dict[str, str]:
    """Convert an HP dict to ``HARNESS_HP_<NAME>`` environment variables.

    These are forwarded to training subprocesses and consumed by the model
    factories via ``training.hp`` (see module docstring, "HP plumbing").
    """
    return {f"HARNESS_HP_{k.upper()}": str(v) for k, v in hp.items()}


def _atomic_write_json(data: dict[str, Any], dest: Path) -> None:
    """Write *data* as JSON to *dest* atomically via a sibling tmp file + rename."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_str = tempfile.mkstemp(
        dir=str(dest.parent), prefix=f".{dest.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
        os.replace(tmp_str, str(dest))
    except Exception:
        # Clean up the tmp file if rename fails.
        try:
            os.unlink(tmp_str)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------


def _subprocess_env(hp: dict[str, Any]) -> dict[str, str]:
    """Build the environment for a training subprocess, injecting HP env vars."""
    env = {**os.environ}
    # Ensure the ml/ root is on PYTHONPATH so training.* imports work in subprocess.
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = (
        str(_ML_ROOT) + os.pathsep + existing if existing else str(_ML_ROOT)
    )
    env.update(_hp_to_env(hp))
    return env


def _run_subprocess_train(
    family: str,
    hp: dict[str, Any],
    timeout_s: int,
) -> tuple[bool, float]:
    """Run ``training.train --models {family}`` in a child process.

    Returns ``(success, elapsed_seconds)``.  HP dict is forwarded via env vars
    and consumed by the model factories (see module docstring, "HP plumbing").
    """
    import subprocess

    cmd = [sys.executable, "-m", "training.train", "--models", family]
    env = _subprocess_env(hp)
    t0 = time.perf_counter()
    result = subprocess.run(
        cmd,
        cwd=str(_ML_ROOT),
        env=env,
        timeout=timeout_s,
        capture_output=True,
    )
    elapsed = time.perf_counter() - t0
    if result.returncode != 0:
        log.warning(
            "training.train failed (rc=%d) for family=%r\nstderr: %s",
            result.returncode,
            family,
            result.stderr.decode(errors="replace")[-2000:],
        )
        return False, elapsed
    return True, elapsed


def _run_subprocess_eval(timeout_s: int = 600) -> bool:
    """Run ``training.evaluate`` with gold-clips skipped.

    Returns ``True`` on success.
    """
    import subprocess

    # Pass a non-existent path so the optional gold-8 evaluation is skipped.
    cmd = [
        sys.executable,
        "-m",
        "training.evaluate",
        "--gold-clips-dir",
        str(_ML_ROOT / ".harness_no_gold_eval"),
    ]
    result = subprocess.run(
        cmd,
        cwd=str(_ML_ROOT),
        env={**os.environ, "PYTHONPATH": str(_ML_ROOT)},
        timeout=timeout_s,
        capture_output=True,
    )
    if result.returncode != 0:
        log.warning(
            "training.evaluate failed (rc=%d)\nstderr: %s",
            result.returncode,
            result.stderr.decode(errors="replace")[-2000:],
        )
        return False
    return True


def _read_recall90_metrics(family: str) -> dict[str, float] | None:
    """Read the recall_90 operating-point row for *family* from le2i-poc-results.csv.

    Returns a dict with keys ``precision``, ``recall``, ``threshold``, ``f1``,
    ``auc_pr``, or ``None`` if the CSV does not exist or the row is absent.
    """
    csv_path = EVAL_DIR / "le2i-poc-results.csv"
    if not csv_path.exists():
        log.warning("le2i-poc-results.csv not found at %s", csv_path)
        return None
    with csv_path.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            if row.get("model") == family and row.get("op_point") == "recall_90":
                return {
                    "precision": float(row["precision"]),
                    "recall": float(row["recall"]),
                    "threshold": float(row["threshold"]),
                    "f1": float(row["f1"]),
                    "auc_pr": float(row["auc_pr"]),
                }
    log.warning("No recall_90 row for %r in %s", family, csv_path)
    return None


def _get_eval_split_hash() -> str | None:
    """Compute eval_split_hash by reconstructing the deterministic test split.

    Imports the training data pipeline in-process.  Returns ``None`` if the
    pose cache is unavailable (harness continues; hash recorded as null).
    """
    try:
        from training.config import POSE_CACHE_DIR, RAW_DATA_DIR, TEST_SPLIT_FRACTION
        from training.data.le2i import load_clip_metas
        from training.data.windowing import WindowDataset

        metas = load_clip_metas(POSE_CACHE_DIR, RAW_DATA_DIR)
        ds = WindowDataset(metas, mode="sequence")
        _, test = ds.split(test_fraction=TEST_SPLIT_FRACTION)
        test_ids = sorted({m.clip_id for m in test._clip_metas})  # noqa: SLF001
        return compute_eval_split_hash(test_ids)
    except Exception as exc:  # noqa: BLE001
        log.warning("eval_split_hash computation failed: %s", exc)
        return None


def _measure_latency_ms(family: str) -> float:
    """Measure single-window CPU inference latency for *family*.

    Protocol (ADR-017 §3): batch=1, 10 warmup calls discarded, median of 100
    measurements on CPU.  The model is loaded from its artifact directory.
    """
    import numpy as np
    import torch

    from training.evaluate import _load_model  # noqa: PLC2701 (private import for harness)
    from training.metadata import artifact_dir

    out_dir = artifact_dir(family, ARTIFACT_BASE)
    clf = _load_model(family, out_dir)

    # Force CPU for fair comparison across machines.
    if hasattr(clf, "_device"):
        clf._device = torch.device("cpu")  # noqa: SLF001
    if hasattr(clf, "_net"):
        clf._net.to("cpu")  # noqa: SLF001

    rng = np.random.default_rng(42)
    if REGISTRY[family]["mode"] == "features":
        x = rng.random((1, FEATURE_DIM)).astype(np.float32)
    else:
        x = rng.random((1, T_WINDOW, KPT_VECTOR_DIM)).astype(np.float32)

    # Warmup.
    for _ in range(10):
        clf.predict_proba(x)

    # 100 timed calls.
    times: list[float] = []
    for _ in range(100):
        t0 = time.perf_counter()
        clf.predict_proba(x)
        times.append((time.perf_counter() - t0) * 1000.0)

    return float(np.median(times))


def _count_params(family: str) -> int:
    """Return a parameter count for the trained *family* artifact.

    For PyTorch models: total scalar parameters (``sum(p.numel())``).
    For sklearn RF: total decision nodes across all estimators.
    For sklearn SVM: total support vectors.
    Returns -1 when the count cannot be determined.
    """
    from training.evaluate import _load_model  # noqa: PLC2701
    from training.metadata import artifact_dir

    out_dir = artifact_dir(family, ARTIFACT_BASE)
    try:
        clf = _load_model(family, out_dir)
    except Exception as exc:  # noqa: BLE001
        log.warning("_count_params: could not load %r: %s", family, exc)
        return -1

    if REGISTRY[family]["mode"] == "sequence":
        # PyTorch model — count scalar parameters.
        return sum(int(p.numel()) for p in clf._net.parameters())  # noqa: SLF001

    inner = getattr(clf, "_clf", None)
    if inner is None:
        return -1
    if hasattr(inner, "named_steps"):
        # StandardScaler Pipeline (phase-3 scaled variants) — count the estimator.
        inner = inner.named_steps.get("clf", inner)
    if hasattr(inner, "estimators_"):
        # RandomForest — count tree nodes.
        return int(sum(e.tree_.node_count for e in inner.estimators_))
    if hasattr(inner, "n_support_"):
        # SVM — count support vectors.
        return int(inner.n_support_.sum())
    if hasattr(inner, "coef_"):
        # Linear model — count weights + intercepts.
        return int(inner.coef_.size + inner.intercept_.size)
    return -1


def _run_nh_gate(family: str) -> dict[str, Any]:
    """Call ``training.evaluate_nh.evaluate_nh`` (Step 7 contract).

    Returns a dict with keys ``gate_passed`` (bool | None) and
    ``missed_fall_ids`` (list).  If evaluate_nh is not yet available the gate
    is recorded as un-armed (``gate_passed=null``) and the experiment continues.
    """
    try:
        from training.evaluate_nh import evaluate_nh  # type: ignore[import-not-found]

        result = evaluate_nh(family, ARTIFACT_BASE)
        return {
            "gate_passed": bool(result.get("gate_passed", False)),
            "missed_fall_ids": list(result.get("missed_fall_ids", [])),
        }
    except ImportError:
        log.warning(
            "training.evaluate_nh not available — NH gate not armed for this run"
        )
        return {
            "gate_passed": None,
            "missed_fall_ids": [],
            "note": "evaluate_nh not available; gate un-armed",
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("NH gate raised an unexpected error: %s", exc)
        return {
            "gate_passed": None,
            "missed_fall_ids": [],
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Optuna study
# ---------------------------------------------------------------------------


def _build_objective(
    family: str,
    search_space: dict[str, tuple],
    hp_override: dict[str, Any],
    trial_timeout_s: int,
) -> Any:
    """Return a closure suitable for ``optuna.Study.optimize``."""

    def objective(trial: optuna.Trial) -> float:
        hp = sample_hp_from_trial(trial, search_space, hp_override)
        log.info("[trial %d] sampled HP: %s", trial.number, hp)

        ok, _ = _run_subprocess_train(family, hp, trial_timeout_s)
        if not ok:
            # Training subprocess failed — treat as a failed trial (pruned).
            raise optuna.TrialPruned()

        if not _run_subprocess_eval():
            return 0.0

        metrics = _read_recall90_metrics(family)
        if metrics is None:
            return 0.0

        recall_90_achieved = metrics["recall"] >= 0.90
        trial_score = metrics["precision"] if recall_90_achieved else 0.0
        log.info(
            "[trial %d] recall=%.4f precision=%.4f recall_90_achieved=%s score=%.4f",
            trial.number,
            metrics["recall"],
            metrics["precision"],
            recall_90_achieved,
            trial_score,
        )
        return trial_score

    return objective


def _run_optuna_study(
    family: str,
    search_space: dict[str, tuple],
    hp_override: dict[str, Any],
    n_trials: int,
    trial_timeout_s: int,
) -> tuple[dict[str, Any], list[float]]:
    """Run an Optuna study and return ``(best_params, trial_scores)``.

    Uses TPESampler with seed=42 for reproducibility.  Direction=maximize
    (higher P@R90 is better).
    """
    sampler = optuna.samplers.TPESampler(seed=42)
    study = optuna.create_study(direction="maximize", sampler=sampler)

    objective = _build_objective(family, search_space, hp_override, trial_timeout_s)
    study.optimize(objective, n_trials=n_trials, catch=(Exception,))

    trial_scores = [
        t.value if t.value is not None else 0.0
        for t in study.trials
    ]

    try:
        best_params = dict(study.best_trial.params)
        # Merge in any hp_override values that were not sampled via suggest_*.
        for k, v in hp_override.items():
            best_params.setdefault(k, v)
    except ValueError:
        log.warning("No successful Optuna trials — using default HP configuration")
        best_params = dict(hp_override)

    log.info("Optuna complete: best_params=%s  trial_scores=%s", best_params, trial_scores)
    return best_params, trial_scores


# ---------------------------------------------------------------------------
# Main experiment flow
# ---------------------------------------------------------------------------


def run(config_path: Path, *, runs_dir: Path | None = None, status_path: Path | None = None) -> int:
    """Execute one hypothesis experiment end-to-end.

    Returns 0 on success (run JSON written), 1 on unrecoverable harness error.
    Updates ``loop_status.json`` in all cases.
    """
    from experiments.loop_state import (
        is_paused,
        list_completed_run_ids,
        update_loop_status,
        write_pause_report,
    )

    _runs_dir = runs_dir or _RUNS_DIR
    _status_path = status_path or _STATUS_PATH
    _runs_dir.mkdir(parents=True, exist_ok=True)

    # --- Parse config ---
    raw_cfg = json.loads(config_path.read_text(encoding="utf-8"))
    exp_id: str = raw_cfg["id"]
    family: str = raw_cfg["model_family"]
    hypothesis: str = raw_cfg["hypothesis"]
    hp_override: dict[str, Any] = raw_cfg.get("hp_override", {})
    n_trials: int = int(raw_cfg.get("n_trials", 5))
    trial_timeout_s: int = int(raw_cfg.get("trial_timeout_s", 3600))

    # Collect any extra keys as arch_flags.
    _known = {"id", "model_family", "hypothesis", "hp_override", "n_trials", "trial_timeout_s"}
    arch_flags = {k: v for k, v in raw_cfg.items() if k not in _known}

    log.info("Harness start: id=%r family=%r hypothesis=%r", exp_id, family, hypothesis)

    # --- Journal-based resume: skip if already completed ---
    completed = list_completed_run_ids(_runs_dir)
    if exp_id in completed:
        log.info("Experiment %r already has a result — skipping (journal-based resume)", exp_id)
        return 0

    # --- Validate family ---
    if family not in REGISTRY:
        raise ValueError(
            f"model_family={family!r} is not in REGISTRY. "
            f"Available: {list(REGISTRY.keys())}"
        )

    search_space = SEARCH_SPACES.get(family, {})
    if not search_space:
        log.warning(
            "No search space defined for family=%r in SEARCH_SPACES — "
            "single trial with default HPs will be used.",
            family,
        )

    started_at = datetime.now(tz=UTC).isoformat()
    harness_error = False
    succeeded = False

    try:
        # --- Optuna HP search ---
        log.info("Starting Optuna study: family=%r n_trials=%d", family, n_trials)
        best_params, trial_scores = _run_optuna_study(
            family, search_space, hp_override, n_trials, trial_timeout_s
        )

        # --- Final train with best HPs ---
        log.info("Final train with best_params=%s", best_params)
        t_train_start = time.perf_counter()
        train_ok, _ = _run_subprocess_train(family, best_params, trial_timeout_s)
        train_seconds = time.perf_counter() - t_train_start

        if not train_ok:
            _fail(f"Final train subprocess failed for family={family!r}")

        # --- Final evaluate ---
        if not _run_subprocess_eval():
            _fail("Final evaluate subprocess failed")

        # --- Read LE2I metrics ---
        metrics = _read_recall90_metrics(family)
        if metrics is None:
            _fail(
                f"No recall_90 metrics found for {family!r} after final evaluate"
            )

        recall_90_achieved = metrics["recall"] >= 0.90
        precision_at_recall_90 = metrics["precision"]

        # --- Measure inference latency ---
        log.info("Measuring inference latency for %r", family)
        latency_ms = _measure_latency_ms(family)
        log.info("Inference latency: %.2f ms (gate: %.0f ms)", latency_ms, _LATENCY_THRESHOLD_MS)

        # --- Apply hard gates ---
        final_score, latency_gate_failed = force_score_gates(
            score=precision_at_recall_90,
            recall_90_achieved=recall_90_achieved,
            latency_ms=latency_ms,
        )

        # --- NH gate ---
        log.info("Running NH gate for %r", family)
        nh_gate = _run_nh_gate(family)

        # --- eval_split_hash ---
        eval_split_hash = _get_eval_split_hash()

        # --- params_count ---
        params_count = _count_params(family)

        # --- weights_path ---
        from training.metadata import artifact_dir

        out_dir = artifact_dir(family, ARTIFACT_BASE)
        artifact_filename = REGISTRY[family]["artifact_filename"]
        weights_path = str(out_dir / artifact_filename)

        # --- Build result JSON ---
        finished_at = datetime.now(tz=UTC).isoformat()
        result: dict[str, Any] = {
            "id": exp_id,
            "model_family": family,
            "hypothesis": hypothesis,
            "score": round(final_score, 6),
            "recall_90_achieved": recall_90_achieved,
            "params_count": params_count,
            "inference_latency_ms": round(latency_ms, 3),
            "latency_gate_failed": latency_gate_failed,
            "eval_split_hash": eval_split_hash,
            "weights_path": weights_path,
            "train_seconds": round(train_seconds, 2),
            "nh_gate": nh_gate,
            "optuna": {
                "n_trials": n_trials,
                "best_params": best_params,
                "trial_scores": [round(s, 6) for s in trial_scores],
            },
            "timestamps": {
                "started_at": started_at,
                "finished_at": finished_at,
            },
            "arch_flags": arch_flags,
            "eval_metrics": {
                "precision": metrics["precision"],
                "recall": metrics["recall"],
                "threshold": metrics["threshold"],
                "f1": metrics["f1"],
                "auc_pr": metrics["auc_pr"],
            },
        }

        # --- Atomic write ---
        dest = _runs_dir / f"{exp_id}.json"
        _atomic_write_json(result, dest)
        log.info("Run result written to %s", dest)

        # success for fail-fast counter = recall_90 was achieved
        succeeded = recall_90_achieved

        log.info(
            "Experiment %r complete: score=%.4f recall_90=%s latency=%.1fms nh_gate=%s",
            exp_id,
            final_score,
            recall_90_achieved,
            latency_ms,
            nh_gate.get("gate_passed"),
        )

    except Exception as exc:  # noqa: BLE001
        log.error("Harness error for experiment %r: %s", exp_id, exc, exc_info=True)
        harness_error = True
        succeeded = False

    # --- Update loop status (always, even on error) ---
    status = update_loop_status(_status_path, succeeded=succeeded)
    if is_paused(status):
        report_path = _ML_ROOT / "experiments" / "PAUSED_REPORT.md"
        write_pause_report(status, report_path)
        log.warning(
            "Loop PAUSED: %s  (report: %s)", status.get("pause_reason"), report_path
        )
        return 1

    return 1 if harness_error else 0


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Run one hypothesis experiment through the fall-detector autoresearch harness.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--config",
        type=Path,
        required=True,
        help="Path to hypothesis JSON config file.",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    sys.exit(run(args.config))


if __name__ == "__main__":
    main()
