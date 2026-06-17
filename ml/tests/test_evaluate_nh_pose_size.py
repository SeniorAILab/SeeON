from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from training import evaluate_nh
from training.data.nursing_home import NHGoldRow


def test_pose_size_parser_accepts_supported_sizes() -> None:
    parser = evaluate_nh.build_arg_parser()

    args = parser.parse_args(["--model-key", "random-forest", "--pose-size", "m"])

    assert args.pose_size == "m"


def test_pose_size_parser_rejects_unsupported_size() -> None:
    parser = evaluate_nh.build_arg_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(["--model-key", "random-forest", "--pose-size", "l"])


def test_pose_size_cache_dir_separates_supported_sizes(tmp_path: Path) -> None:
    root = tmp_path / "poses"

    assert evaluate_nh._pose_size_cache_dir(root, "n") == root / "n"
    assert evaluate_nh._pose_size_cache_dir(root, "s") == root / "s"
    assert evaluate_nh._pose_size_cache_dir(root, "m") == root / "m"
    assert len({evaluate_nh._pose_size_cache_dir(root, size) for size in ("n", "s", "m")}) == 3


def test_pose_size_cache_dir_rejects_invalid_size(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="Unsupported pose size"):
        evaluate_nh._pose_size_cache_dir(tmp_path, "x")


def test_evaluate_nh_provenance_fields(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    artifact_base = tmp_path / "artifacts"
    out_dir = artifact_base / "random-forest"
    out_dir.mkdir(parents=True)
    (out_dir / "model.pkl").write_bytes(b"model")
    gold_csv = tmp_path / "gold.csv"
    processed_dir = tmp_path / "processed"
    processed_dir.mkdir()
    video = processed_dir / "clip-a.mp4"
    video.write_bytes(b"video")
    cache_file = tmp_path / "poses" / "s" / "clip-a__track0000.npz"

    class FakeFactory:
        @staticmethod
        def load(_out_dir: Path) -> object:
            return object()

    monkeypatch.setitem(
        evaluate_nh.REGISTRY,
        "random-forest",
        {"artifact_filename": "model.pkl", "factory": FakeFactory, "mode": "features"},
    )
    monkeypatch.setattr(
        evaluate_nh,
        "load_metadata",
        lambda _out_dir: SimpleNamespace(operating_threshold=0.5, window=2, stride=1),
    )
    monkeypatch.setattr(
        evaluate_nh,
        "parse_gold_csv",
        lambda _csv: ([NHGoldRow("clip-a", 0, 5, 30.0, "confirmed", "")], []),
    )
    monkeypatch.setattr(evaluate_nh, "enumerate_processed_videos", lambda _dir: [video])
    monkeypatch.setattr(
        evaluate_nh,
        "_resolve_pose_weight",
        lambda size: (tmp_path / f"yolo26{size}-pose.pt", f"yolo26{size}-pose.pt", "abc123"),
    )
    monkeypatch.setattr(
        evaluate_nh,
        "_ensure_track_poses",
        lambda video_path, poses_cache_dir, video_stem, pose_size, refresh_cache=False: [
            cache_file
        ],
    )
    monkeypatch.setattr(evaluate_nh, "_any_track_catches_fall", lambda *args, **kwargs: True)
    monkeypatch.setattr(evaluate_nh, "check_gate", lambda model_key, caught, mask: (True, []))

    result = evaluate_nh.evaluate_nh(
        "random-forest",
        artifact_base,
        pose_size="s",
        gold_csv=gold_csv,
        processed_dir=processed_dir,
        poses_cache_dir=tmp_path / "poses",
        command_args=["--model-key", "random-forest", "--pose-size", "s"],
    )

    provenance = result["provenance"]
    assert provenance["command_args"] == ["--model-key", "random-forest", "--pose-size", "s"]
    assert provenance["pose_size"] == "s"
    assert provenance["pose_weight_filename"] == "yolo26s-pose.pt"
    assert provenance["pose_weight_sha256"] == "abc123"
    assert provenance["clip_list"] == [{"clip_id": "clip-a", "path": str(video)}]
    assert provenance["processed_dir"] == str(processed_dir)
    assert provenance["gold_csv"] == str(gold_csv)
    assert provenance["pose_size_cache_dir"] == str(tmp_path / "poses" / "s")
    assert provenance["cache_paths"] == {"clip-a": [str(cache_file)]}
    assert provenance["detection_rate"] == {
        "numerator": 1,
        "denominator": 1,
        "formula": "caught_confirmed_falls / confirmed_gold_falls",
        "value": 1.0,
    }
    assert provenance["missing_clips"] == []
    assert provenance["failed_clips"] == []
    assert provenance["model_artifact_key"] == "random-forest"
