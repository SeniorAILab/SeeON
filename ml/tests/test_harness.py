"""Unit tests for experiments.harness and experiments.loop_state — pure logic only.

No subprocesses, no real model artifacts, no disk reads outside of tmp dirs.

Run with::

    uv run pytest tests/test_harness.py -q
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import optuna
import pytest

from experiments.harness import (
    SEARCH_SPACES,
    _atomic_write_json,
    _hp_to_env,
    compute_eval_split_hash,
    force_score_gates,
    sample_hp_from_trial,
)
from experiments.loop_state import (
    _check_fail_fast_reason,
    _CONSECUTIVE_FAILURE_LIMIT,
    _DISK_FREE_THRESHOLD_GB,
    is_paused,
    list_completed_run_ids,
    load_loop_status,
    update_loop_status,
    write_pause_report,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_trial(study: optuna.Study | None = None) -> optuna.Trial:
    """Return a fresh unfrozen Optuna trial suitable for suggest_* calls."""
    s = study or optuna.create_study(direction="maximize")
    return s.ask()


# ---------------------------------------------------------------------------
# force_score_gates
# ---------------------------------------------------------------------------


class TestForceScoreGates:
    def test_all_pass_returns_original_score(self) -> None:
        score, lat_fail = force_score_gates(
            score=0.75, recall_90_achieved=True, latency_ms=100.0
        )
        assert score == pytest.approx(0.75)
        assert lat_fail is False

    def test_recall_not_achieved_forces_zero(self) -> None:
        score, lat_fail = force_score_gates(
            score=0.9, recall_90_achieved=False, latency_ms=50.0
        )
        assert score == 0.0
        assert lat_fail is False  # latency gate did NOT fail

    def test_latency_over_threshold_forces_zero(self) -> None:
        score, lat_fail = force_score_gates(
            score=0.8, recall_90_achieved=True, latency_ms=200.0
        )
        assert score == 0.0
        assert lat_fail is True

    def test_both_gates_fail_forces_zero_and_lat_failed_true(self) -> None:
        score, lat_fail = force_score_gates(
            score=0.8, recall_90_achieved=False, latency_ms=999.0
        )
        assert score == 0.0
        assert lat_fail is True

    def test_exactly_at_threshold_passes(self) -> None:
        # latency == threshold should pass (strict >)
        score, lat_fail = force_score_gates(
            score=0.6, recall_90_achieved=True, latency_ms=167.0
        )
        assert score == pytest.approx(0.6)
        assert lat_fail is False

    def test_custom_threshold(self) -> None:
        score, lat_fail = force_score_gates(
            score=0.5,
            recall_90_achieved=True,
            latency_ms=50.0,
            latency_threshold_ms=40.0,
        )
        assert score == 0.0
        assert lat_fail is True

    def test_zero_input_score_stays_zero(self) -> None:
        score, lat_fail = force_score_gates(
            score=0.0, recall_90_achieved=True, latency_ms=10.0
        )
        assert score == 0.0
        assert lat_fail is False


# ---------------------------------------------------------------------------
# compute_eval_split_hash
# ---------------------------------------------------------------------------


class TestComputeEvalSplitHash:
    def test_deterministic_same_list(self) -> None:
        ids = ["clip_a", "clip_b", "clip_c"]
        assert compute_eval_split_hash(ids) == compute_eval_split_hash(ids)

    def test_order_invariant(self) -> None:
        ids1 = ["clip_a", "clip_b", "clip_c"]
        ids2 = ["clip_c", "clip_a", "clip_b"]
        assert compute_eval_split_hash(ids1) == compute_eval_split_hash(ids2)

    def test_different_content_gives_different_hash(self) -> None:
        assert compute_eval_split_hash(["a", "b"]) != compute_eval_split_hash(["a", "c"])

    def test_empty_list_stable(self) -> None:
        h = compute_eval_split_hash([])
        expected = hashlib.sha256(json.dumps([]).encode()).hexdigest()
        assert h == expected

    def test_returns_64_hex_chars(self) -> None:
        h = compute_eval_split_hash(["x"])
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_known_value(self) -> None:
        # Pin the hash for ["clip_a"] so future refactors can't silently change it.
        expected = hashlib.sha256(json.dumps(["clip_a"]).encode()).hexdigest()
        assert compute_eval_split_hash(["clip_a"]) == expected


# ---------------------------------------------------------------------------
# sample_hp_from_trial
# ---------------------------------------------------------------------------


class TestSampleHpFromTrial:
    def test_hp_override_not_sampled(self) -> None:
        """Values in hp_override are returned as-is; trial.suggest_* not called."""
        trial = _make_trial()
        space = {"n_estimators": ("int", 100, 500), "max_depth": ("int", 5, 30)}
        hp = sample_hp_from_trial(trial, space, hp_override={"n_estimators": 42})
        assert hp["n_estimators"] == 42
        # max_depth was sampled (should be in [5, 30])
        assert 5 <= hp["max_depth"] <= 30

    def test_int_sampling(self) -> None:
        trial = _make_trial()
        hp = sample_hp_from_trial(trial, {"k": ("int", 1, 10)}, {})
        assert isinstance(hp["k"], int)
        assert 1 <= hp["k"] <= 10

    def test_float_sampling(self) -> None:
        trial = _make_trial()
        hp = sample_hp_from_trial(trial, {"dropout": ("float", 0.0, 0.5)}, {})
        assert isinstance(hp["dropout"], float)
        assert 0.0 <= hp["dropout"] <= 0.5

    def test_float_log_sampling(self) -> None:
        trial = _make_trial()
        hp = sample_hp_from_trial(trial, {"lr": ("float_log", 1e-4, 1e-2)}, {})
        assert isinstance(hp["lr"], float)
        assert 1e-4 <= hp["lr"] <= 1e-2

    def test_categorical_sampling(self) -> None:
        trial = _make_trial()
        choices = ["rbf", "linear"]
        hp = sample_hp_from_trial(trial, {"kernel": ("categorical", choices)}, {})
        assert hp["kernel"] in choices

    def test_unknown_spec_kind_raises(self) -> None:
        trial = _make_trial()
        with pytest.raises(ValueError, match="Unknown search-space spec kind"):
            sample_hp_from_trial(trial, {"x": ("unknown_kind", 1, 2)}, {})

    def test_empty_space_empty_result(self) -> None:
        trial = _make_trial()
        hp = sample_hp_from_trial(trial, {}, {})
        assert hp == {}

    def test_all_overridden_no_suggest_calls(self) -> None:
        """When all HPs are overridden, the trial's suggest_* are never called."""
        trial = MagicMock(spec=optuna.Trial)
        space = {"a": ("int", 1, 5), "b": ("float", 0.0, 1.0)}
        hp = sample_hp_from_trial(trial, space, hp_override={"a": 3, "b": 0.5})
        trial.suggest_int.assert_not_called()
        trial.suggest_float.assert_not_called()
        trial.suggest_categorical.assert_not_called()
        assert hp == {"a": 3, "b": 0.5}


# ---------------------------------------------------------------------------
# _hp_to_env
# ---------------------------------------------------------------------------


class TestHpToEnv:
    def test_keys_uppercased_with_prefix(self) -> None:
        env = _hp_to_env({"n_estimators": 100, "lr": 0.001})
        assert "HARNESS_HP_N_ESTIMATORS" in env
        assert "HARNESS_HP_LR" in env

    def test_values_are_strings(self) -> None:
        env = _hp_to_env({"hidden": 64, "dropout": 0.3, "kernel": "rbf"})
        for v in env.values():
            assert isinstance(v, str)

    def test_empty_dict_produces_empty_env(self) -> None:
        assert _hp_to_env({}) == {}

    def test_float_value_stringified(self) -> None:
        env = _hp_to_env({"lr": 1e-4})
        assert env["HARNESS_HP_LR"] == "0.0001"


# ---------------------------------------------------------------------------
# _atomic_write_json
# ---------------------------------------------------------------------------


class TestAtomicWriteJson:
    def test_creates_file_with_correct_content(self, tmp_path: Path) -> None:
        dest = tmp_path / "result.json"
        data = {"id": "exp-001", "score": 0.82, "nested": {"a": 1}}
        _atomic_write_json(data, dest)
        assert dest.exists()
        loaded = json.loads(dest.read_text())
        assert loaded == data

    def test_creates_parent_directories(self, tmp_path: Path) -> None:
        dest = tmp_path / "deep" / "nested" / "result.json"
        _atomic_write_json({"x": 1}, dest)
        assert dest.exists()

    def test_overwrites_existing_file(self, tmp_path: Path) -> None:
        dest = tmp_path / "result.json"
        _atomic_write_json({"v": 1}, dest)
        _atomic_write_json({"v": 2}, dest)
        assert json.loads(dest.read_text())["v"] == 2

    def test_no_tmp_files_left_behind(self, tmp_path: Path) -> None:
        dest = tmp_path / "result.json"
        _atomic_write_json({"x": 99}, dest)
        leftover = [f for f in tmp_path.iterdir() if f.suffix == ".tmp"]
        assert leftover == []


# ---------------------------------------------------------------------------
# list_completed_run_ids (loop_state)
# ---------------------------------------------------------------------------


class TestListCompletedRunIds:
    def test_empty_directory_returns_empty_set(self, tmp_path: Path) -> None:
        runs = tmp_path / "runs"
        runs.mkdir()
        assert list_completed_run_ids(runs) == set()

    def test_nonexistent_directory_returns_empty_set(self, tmp_path: Path) -> None:
        assert list_completed_run_ids(tmp_path / "no_such_dir") == set()

    def test_returns_stems_of_json_files(self, tmp_path: Path) -> None:
        runs = tmp_path / "runs"
        runs.mkdir()
        (runs / "exp-001.json").write_text("{}")
        (runs / "exp-002.json").write_text("{}")
        assert list_completed_run_ids(runs) == {"exp-001", "exp-002"}

    def test_ignores_non_json_files(self, tmp_path: Path) -> None:
        runs = tmp_path / "runs"
        runs.mkdir()
        (runs / "exp-001.json").write_text("{}")
        (runs / ".gitkeep").write_text("")
        (runs / "notes.md").write_text("# notes")
        assert list_completed_run_ids(runs) == {"exp-001"}


# ---------------------------------------------------------------------------
# load_loop_status (loop_state)
# ---------------------------------------------------------------------------


class TestLoadLoopStatus:
    def test_returns_default_when_file_absent(self, tmp_path: Path) -> None:
        status = load_loop_status(tmp_path / "loop_status.json")
        assert status["state"] == "running"
        assert status["experiments_completed"] == 0
        assert status["consecutive_failures"] == 0

    def test_loads_existing_file(self, tmp_path: Path) -> None:
        p = tmp_path / "loop_status.json"
        data = {"state": "running", "experiments_completed": 3}
        p.write_text(json.dumps(data))
        status = load_loop_status(p)
        assert status["experiments_completed"] == 3


# ---------------------------------------------------------------------------
# _check_fail_fast_reason (loop_state)
# ---------------------------------------------------------------------------


class TestCheckFailFastReason:
    def test_no_reason_when_below_limits(self) -> None:
        status = {
            "consecutive_failures": 0,
            "disk_free_gb": 100.0,
        }
        assert _check_fail_fast_reason(status) is None

    def test_triggers_on_consecutive_failure_limit(self) -> None:
        status = {
            "consecutive_failures": _CONSECUTIVE_FAILURE_LIMIT,
            "disk_free_gb": 100.0,
        }
        reason = _check_fail_fast_reason(status)
        assert reason is not None
        assert "consecutive_failures" in reason

    def test_triggers_on_disk_below_threshold(self) -> None:
        status = {
            "consecutive_failures": 0,
            "disk_free_gb": _DISK_FREE_THRESHOLD_GB - 0.1,
        }
        reason = _check_fail_fast_reason(status)
        assert reason is not None
        assert "disk_free_gb" in reason

    def test_below_consecutive_limit_does_not_trigger(self) -> None:
        status = {
            "consecutive_failures": _CONSECUTIVE_FAILURE_LIMIT - 1,
            "disk_free_gb": 100.0,
        }
        assert _check_fail_fast_reason(status) is None


# ---------------------------------------------------------------------------
# update_loop_status (loop_state)
# ---------------------------------------------------------------------------


class TestUpdateLoopStatus:
    def test_success_increments_completed_and_successes(self, tmp_path: Path) -> None:
        p = tmp_path / "status.json"
        with patch("experiments.loop_state._disk_free_gb", return_value=50.0):
            s = update_loop_status(p, succeeded=True)
        assert s["experiments_completed"] == 1
        assert s["total_successes"] == 1
        assert s["consecutive_failures"] == 0

    def test_failure_increments_consecutive_failures(self, tmp_path: Path) -> None:
        p = tmp_path / "status.json"
        with patch("experiments.loop_state._disk_free_gb", return_value=50.0):
            s = update_loop_status(p, succeeded=False)
        assert s["consecutive_failures"] == 1
        assert s["total_successes"] == 0

    def test_success_resets_consecutive_failures(self, tmp_path: Path) -> None:
        p = tmp_path / "status.json"
        with patch("experiments.loop_state._disk_free_gb", return_value=50.0):
            update_loop_status(p, succeeded=False)
            update_loop_status(p, succeeded=False)
            s = update_loop_status(p, succeeded=True)
        assert s["consecutive_failures"] == 0

    def test_pauses_after_three_consecutive_failures(self, tmp_path: Path) -> None:
        p = tmp_path / "status.json"
        with patch("experiments.loop_state._disk_free_gb", return_value=50.0):
            for _ in range(_CONSECUTIVE_FAILURE_LIMIT):
                s = update_loop_status(p, succeeded=False)
        assert s["state"] == "paused"
        assert s["pause_reason"] is not None

    def test_pauses_on_low_disk(self, tmp_path: Path) -> None:
        p = tmp_path / "status.json"
        with patch(
            "experiments.loop_state._disk_free_gb",
            return_value=_DISK_FREE_THRESHOLD_GB - 1.0,
        ):
            s = update_loop_status(p, succeeded=True)
        assert s["state"] == "paused"

    def test_success_rate_computed(self, tmp_path: Path) -> None:
        p = tmp_path / "status.json"
        with patch("experiments.loop_state._disk_free_gb", return_value=50.0):
            update_loop_status(p, succeeded=True)
            s = update_loop_status(p, succeeded=False)
        assert s["success_rate"] == pytest.approx(0.5)

    def test_file_written_to_disk(self, tmp_path: Path) -> None:
        p = tmp_path / "status.json"
        with patch("experiments.loop_state._disk_free_gb", return_value=50.0):
            update_loop_status(p, succeeded=True)
        assert p.exists()
        on_disk = json.loads(p.read_text())
        assert on_disk["experiments_completed"] == 1


# ---------------------------------------------------------------------------
# is_paused (loop_state)
# ---------------------------------------------------------------------------


class TestIsPaused:
    def test_running_state_not_paused(self) -> None:
        assert is_paused({"state": "running"}) is False

    def test_paused_state_is_paused(self) -> None:
        assert is_paused({"state": "paused"}) is True

    def test_missing_state_not_paused(self) -> None:
        assert is_paused({}) is False


# ---------------------------------------------------------------------------
# write_pause_report (loop_state)
# ---------------------------------------------------------------------------


class TestWritePauseReport:
    def test_creates_markdown_file(self, tmp_path: Path) -> None:
        report = tmp_path / "PAUSED_REPORT.md"
        status = {
            "state": "paused",
            "pause_reason": "consecutive_failures=3",
            "experiments_completed": 5,
        }
        write_pause_report(status, report)
        assert report.exists()
        text = report.read_text()
        assert "PAUSED" in text
        assert "consecutive_failures=3" in text

    def test_creates_parent_directory(self, tmp_path: Path) -> None:
        report = tmp_path / "subdir" / "report.md"
        write_pause_report({"pause_reason": "disk_free_gb=1.0"}, report)
        assert report.exists()


# ---------------------------------------------------------------------------
# SEARCH_SPACES — structural contract
# ---------------------------------------------------------------------------


class TestSearchSpacesContract:
    def test_five_families_defined(self) -> None:
        assert len(SEARCH_SPACES) == 5

    def test_known_families_present(self) -> None:
        for family in ("random-forest", "svm", "lstm", "transformer", "gcn"):
            assert family in SEARCH_SPACES, f"Missing search space for {family!r}"

    def test_all_entries_have_valid_spec_kinds(self) -> None:
        valid_kinds = {"int", "float", "float_log", "categorical"}
        for family, space in SEARCH_SPACES.items():
            for param, spec in space.items():
                assert spec[0] in valid_kinds, (
                    f"{family}.{param}: unknown kind {spec[0]!r}"
                )

    def test_categorical_specs_have_list(self) -> None:
        for family, space in SEARCH_SPACES.items():
            for param, spec in space.items():
                if spec[0] == "categorical":
                    assert isinstance(spec[1], list), (
                        f"{family}.{param}: categorical spec[1] must be a list"
                    )
                    assert len(spec[1]) >= 1
