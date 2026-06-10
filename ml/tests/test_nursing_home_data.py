"""Unit tests for nursing_home CSV parser, label validators, and evaluate_nh gate.

All fixtures are synthetic (tmp_path + csv.DictWriter).
No real NH videos, no YOLO, no cv2 required.
"""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

from training.data.nursing_home import NHGoldRow, _validate_row, parse_gold_csv
from training.evaluate_nh import _window_overlaps_fall, check_gate

# ---------------------------------------------------------------------------
# CSV fixture helpers
# ---------------------------------------------------------------------------

_FIELDNAMES = [
    "video",
    "fall_start_frame",
    "fall_end_frame",
    "fps",
    "status",
    "notes",
]


def _write_csv(path: Path, rows: list[dict]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=_FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    return path


def _good_row(
    *,
    video: str = "clip01",
    start: int = 100,
    end: int = 130,
    status: str = "confirmed",
    notes: str = "",
) -> dict:
    return {
        "video": video,
        "fall_start_frame": start,
        "fall_end_frame": end,
        "fps": 25.0,
        "status": status,
        "notes": notes,
    }


# ---------------------------------------------------------------------------
# TestParseGoldCsvValid — happy-path parsing
# ---------------------------------------------------------------------------


class TestParseGoldCsvValid:
    def test_single_confirmed_row(self, tmp_path: Path) -> None:
        csv_path = _write_csv(tmp_path / "gold.csv", [_good_row()])
        confirmed, proposed = parse_gold_csv(csv_path)
        assert len(confirmed) == 1
        assert len(proposed) == 0
        row = confirmed[0]
        assert row.fall_id == "clip01"
        assert row.fall_start_frame == 100
        assert row.fall_end_frame == 130
        assert row.fps == 25.0
        assert row.status == "confirmed"
        assert row.notes == ""

    def test_mixed_status_rows(self, tmp_path: Path) -> None:
        rows = [
            _good_row(video="clip01", status="confirmed"),
            _good_row(video="clip02", status="proposed"),
            _good_row(video="clip03", status="confirmed"),
        ]
        csv_path = _write_csv(tmp_path / "gold.csv", rows)
        confirmed, proposed = parse_gold_csv(csv_path)
        assert len(confirmed) == 2
        assert len(proposed) == 1
        assert [r.fall_id for r in confirmed] == ["clip01", "clip03"]
        assert proposed[0].fall_id == "clip02"

    def test_proposed_only_rows(self, tmp_path: Path) -> None:
        rows = [_good_row(video="clip01", status="proposed")]
        csv_path = _write_csv(tmp_path / "gold.csv", rows)
        confirmed, proposed = parse_gold_csv(csv_path)
        assert len(confirmed) == 0
        assert len(proposed) == 1

    def test_video_lengths_valid(self, tmp_path: Path) -> None:
        csv_path = _write_csv(
            tmp_path / "gold.csv", [_good_row(start=100, end=130)]
        )
        confirmed, _ = parse_gold_csv(csv_path, video_lengths={"clip01": 500})
        assert confirmed[0].fall_end_frame == 130

    def test_notes_field_populated(self, tmp_path: Path) -> None:
        csv_path = _write_csv(
            tmp_path / "gold.csv",
            [_good_row(notes="camera angle ok")],
        )
        confirmed, _ = parse_gold_csv(csv_path)
        assert confirmed[0].notes == "camera angle ok"

    def test_notes_field_absent_from_csv(self, tmp_path: Path) -> None:
        """CSV without 'notes' column still parses (notes defaults to '')."""
        path = tmp_path / "no_notes.csv"
        with path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(
                fh,
                fieldnames=["video", "fall_start_frame", "fall_end_frame", "fps", "status"],
            )
            writer.writeheader()
            writer.writerow(
                {
                    "video": "clip01",
                    "fall_start_frame": 10,
                    "fall_end_frame": 20,
                    "fps": 25.0,
                    "status": "confirmed",
                }
            )
        confirmed, _ = parse_gold_csv(path)
        assert confirmed[0].notes == ""

    def test_status_case_insensitive(self, tmp_path: Path) -> None:
        """Status values are lowercased before comparison."""
        row = _good_row()
        row["status"] = "Confirmed"
        csv_path = _write_csv(tmp_path / "gold.csv", [row])
        confirmed, _ = parse_gold_csv(csv_path)
        assert len(confirmed) == 1

    def test_multiple_video_lengths(self, tmp_path: Path) -> None:
        rows = [
            _good_row(video="clip01", start=0, end=29),
            _good_row(video="clip02", start=50, end=99),
        ]
        csv_path = _write_csv(tmp_path / "gold.csv", rows)
        lengths = {"clip01": 200, "clip02": 200}
        confirmed, _ = parse_gold_csv(csv_path, video_lengths=lengths)
        assert len(confirmed) == 2


# ---------------------------------------------------------------------------
# TestParseGoldCsvValidation — error paths
# ---------------------------------------------------------------------------


class TestParseGoldCsvValidation:
    def test_file_not_found_raises(self, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            parse_gold_csv(tmp_path / "nonexistent.csv")

    def test_start_equals_end_raises(self, tmp_path: Path) -> None:
        csv_path = _write_csv(tmp_path / "gold.csv", [_good_row(start=50, end=50)])
        with pytest.raises(ValueError, match="strictly less than"):
            parse_gold_csv(csv_path)

    def test_start_greater_than_end_raises(self, tmp_path: Path) -> None:
        csv_path = _write_csv(tmp_path / "gold.csv", [_good_row(start=80, end=50)])
        with pytest.raises(ValueError, match="strictly less than"):
            parse_gold_csv(csv_path)

    def test_duration_too_short_raises(self, tmp_path: Path) -> None:
        # duration = end - start + 1 = 54 - 51 + 1 = 4 < _MIN_FALL_FRAMES (5)
        csv_path = _write_csv(tmp_path / "gold.csv", [_good_row(start=51, end=54)])
        with pytest.raises(ValueError, match="below the minimum"):
            parse_gold_csv(csv_path)

    def test_exact_min_duration_passes(self, tmp_path: Path) -> None:
        # duration = end - start + 1 = 5 == _MIN_FALL_FRAMES
        csv_path = _write_csv(tmp_path / "gold.csv", [_good_row(start=10, end=14)])
        confirmed, _ = parse_gold_csv(csv_path)
        assert len(confirmed) == 1

    def test_video_length_overflow_raises(self, tmp_path: Path) -> None:
        # fall_end_frame=130 >= video_length=100 → rejected
        csv_path = _write_csv(
            tmp_path / "gold.csv", [_good_row(start=100, end=130)]
        )
        with pytest.raises(ValueError, match="video_length"):
            parse_gold_csv(csv_path, video_lengths={"clip01": 100})

    def test_video_length_exact_boundary_raises(self, tmp_path: Path) -> None:
        # fall_end_frame=130 == video_length=130 → condition: end >= video_length
        # A video with 130 frames has last valid index 129; index 130 is out of range.
        csv_path = _write_csv(
            tmp_path / "gold.csv", [_good_row(start=100, end=130)]
        )
        with pytest.raises(ValueError, match="video_length"):
            parse_gold_csv(csv_path, video_lengths={"clip01": 130})

    def test_invalid_status_raises(self, tmp_path: Path) -> None:
        row = _good_row()
        row["status"] = "unknown"
        csv_path = _write_csv(tmp_path / "gold.csv", [row])
        with pytest.raises(ValueError, match="status"):
            parse_gold_csv(csv_path)

    def test_non_numeric_start_raises(self, tmp_path: Path) -> None:
        row = _good_row()
        row["fall_start_frame"] = "abc"
        csv_path = _write_csv(tmp_path / "gold.csv", [row])
        with pytest.raises(ValueError, match="cannot parse numeric"):
            parse_gold_csv(csv_path)

    def test_non_numeric_fps_raises(self, tmp_path: Path) -> None:
        row = _good_row()
        row["fps"] = "bad_fps"
        csv_path = _write_csv(tmp_path / "gold.csv", [row])
        with pytest.raises(ValueError, match="cannot parse numeric"):
            parse_gold_csv(csv_path)

    def test_empty_video_field_raises(self, tmp_path: Path) -> None:
        csv_path = _write_csv(tmp_path / "gold.csv", [_good_row(video="")])
        with pytest.raises(ValueError, match="empty or missing"):
            parse_gold_csv(csv_path)

    def test_video_length_only_for_matching_key(self, tmp_path: Path) -> None:
        """video_lengths for a different clip does not affect current row."""
        csv_path = _write_csv(
            tmp_path / "gold.csv", [_good_row(video="clip01", start=100, end=130)]
        )
        # Key is "clip02" — not matched — so no length validation on "clip01"
        confirmed, _ = parse_gold_csv(
            csv_path, video_lengths={"clip02": 50}
        )
        assert len(confirmed) == 1


# ---------------------------------------------------------------------------
# TestValidateRow — direct unit tests on _validate_row
# ---------------------------------------------------------------------------


class TestValidateRow:
    def _row(
        self,
        start: int,
        end: int,
        fall_id: str = "clip01",
    ) -> NHGoldRow:
        return NHGoldRow(
            fall_id=fall_id,
            fall_start_frame=start,
            fall_end_frame=end,
            fps=25.0,
            status="confirmed",
            notes="",
        )

    def test_valid_row_no_error(self) -> None:
        _validate_row(self._row(0, 29))  # duration = 30 >= 5

    def test_start_equals_end_raises(self) -> None:
        with pytest.raises(ValueError, match="strictly less than"):
            _validate_row(self._row(10, 10))

    def test_start_greater_than_end_raises(self) -> None:
        with pytest.raises(ValueError, match="strictly less than"):
            _validate_row(self._row(20, 10))

    def test_exact_min_duration_passes(self) -> None:
        # duration = 5 - 1 + 1 = 5 (exactly _MIN_FALL_FRAMES)
        _validate_row(self._row(1, 5))

    def test_one_below_min_duration_raises(self) -> None:
        # duration = 4 - 1 + 1 = 4 < 5
        with pytest.raises(ValueError, match="below the minimum"):
            _validate_row(self._row(1, 4))

    def test_video_length_ok(self) -> None:
        _validate_row(self._row(0, 29), video_length=100)

    def test_video_length_exact_end_raises(self) -> None:
        # fall_end_frame == video_length is forbidden (must be < video_length)
        with pytest.raises(ValueError, match="video_length"):
            _validate_row(self._row(0, 100), video_length=100)

    def test_video_length_none_skips_check(self) -> None:
        # No video_length → length check is skipped entirely
        _validate_row(self._row(0, 9999), video_length=None)


# ---------------------------------------------------------------------------
# TestWindowOverlapsFall — _window_overlaps_fall helper
# ---------------------------------------------------------------------------


class TestWindowOverlapsFall:
    """T_WINDOW = 30 by default; frames are 0-based inclusive."""

    def test_window_fully_before_fall(self) -> None:
        # window [0, 30), fall [50, 80]
        assert not _window_overlaps_fall(0, 50, 80)

    def test_window_fully_after_fall(self) -> None:
        # window [100, 130), fall [50, 80]
        assert not _window_overlaps_fall(100, 50, 80)

    def test_window_exactly_at_fall_start(self) -> None:
        # window [50, 80), fall [50, 80] — first frame overlaps
        assert _window_overlaps_fall(50, 50, 80)

    def test_window_partially_overlaps_fall_start(self) -> None:
        # window [40, 70), fall [60, 90] — overlap at [60, 70)
        assert _window_overlaps_fall(40, 60, 90)

    def test_window_adjacent_before_fall_no_overlap(self) -> None:
        # window [20, 50), fall [50, 80] — window ends at exclusive 50;
        # fall starts at 50 inclusive → min(50, 81) - max(20, 50) = 50 - 50 = 0
        assert not _window_overlaps_fall(20, 50, 80)

    def test_fall_contained_in_window(self) -> None:
        # window [0, 30), fall [5, 10]
        assert _window_overlaps_fall(0, 5, 10)

    def test_single_frame_fall_in_window(self) -> None:
        # fall is a single frame [15, 15], window [10, 40)
        assert _window_overlaps_fall(10, 15, 15, window_size=30)

    def test_custom_window_size(self) -> None:
        assert _window_overlaps_fall(0, 10, 20, window_size=15)
        assert not _window_overlaps_fall(0, 20, 30, window_size=15)


# ---------------------------------------------------------------------------
# TestCheckGate — pure gate evaluation
# ---------------------------------------------------------------------------


class TestCheckGate:
    def test_none_mask_always_passes(self) -> None:
        passed, missed = check_gate("random-forest", set(), None)
        assert passed is True
        assert missed == []

    def test_none_mask_with_caught_ids_still_passes(self) -> None:
        passed, missed = check_gate("lstm", {"fall01", "fall02"}, None)
        assert passed is True
        assert missed == []

    def test_all_required_caught(self) -> None:
        mask = {"random-forest": ["fall01", "fall02", "fall03"]}
        passed, missed = check_gate(
            "random-forest", {"fall01", "fall02", "fall03"}, mask
        )
        assert passed is True
        assert missed == []

    def test_one_missed(self) -> None:
        mask = {"random-forest": ["fall01", "fall02"]}
        passed, missed = check_gate("random-forest", {"fall01"}, mask)
        assert passed is False
        assert missed == ["fall02"]

    def test_multiple_missed(self) -> None:
        mask = {"random-forest": ["fall01", "fall02", "fall03"]}
        passed, missed = check_gate("random-forest", {"fall01"}, mask)
        assert passed is False
        assert missed == ["fall02", "fall03"]

    def test_all_missed(self) -> None:
        mask = {"lstm": ["fall01"]}
        passed, missed = check_gate("lstm", set(), mask)
        assert passed is False
        assert missed == ["fall01"]

    def test_model_key_not_in_mask_always_passes(self) -> None:
        """Model not present in mask → no required falls → gate passes."""
        mask = {"random-forest": ["fall01"]}
        passed, missed = check_gate("lstm", set(), mask)
        assert passed is True
        assert missed == []

    def test_extra_caught_not_penalised(self) -> None:
        """Catching more falls than required is fine."""
        mask = {"random-forest": ["fall01"]}
        passed, missed = check_gate(
            "random-forest", {"fall01", "fall02", "fall_bonus"}, mask
        )
        assert passed is True
        assert missed == []

    def test_missed_list_is_sorted(self) -> None:
        mask = {"lstm": ["fall_c", "fall_a", "fall_b"]}
        _, missed = check_gate("lstm", set(), mask)
        assert missed == ["fall_a", "fall_b", "fall_c"]

    def test_empty_mask_entry_passes(self) -> None:
        """Model present in mask but with empty list → no required falls."""
        mask = {"random-forest": []}
        passed, missed = check_gate("random-forest", set(), mask)
        assert passed is True
        assert missed == []
