from __future__ import annotations

import os
from pathlib import Path

from demo.annotated_video import annotated_video_path
from demo.classifiers import ClassifierParams


def _path(video: Path, output_dir: Path, **overrides: object) -> Path:
    kwargs: dict[str, object] = {
        "source_path": video,
        "size": "n",
        "show_boxes": True,
        "show_pose": True,
        "frame_stride": 4,
        "output_dir": output_dir,
    }
    kwargs.update(overrides)
    return annotated_video_path(**kwargs)  # type: ignore[arg-type]


def test_annotated_video_path_changes_when_source_file_changes(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    output_dir = tmp_path / "annotated"
    video.write_bytes(b"first")
    first_path = _path(video, output_dir)

    video.write_bytes(b"second-longer")
    os.utime(video)
    second_path = _path(video, output_dir)

    assert first_path != second_path
    assert first_path.suffix == ".mp4"


def test_annotated_video_path_changes_when_frame_stride_changes(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    output_dir = tmp_path / "annotated"
    video.write_bytes(b"video")

    assert _path(video, output_dir, frame_stride=4) != _path(video, output_dir, frame_stride=2)


def test_annotated_video_path_changes_when_size_changes(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    output_dir = tmp_path / "annotated"
    video.write_bytes(b"video")

    assert _path(video, output_dir, size="n") != _path(video, output_dir, size="s")


def test_annotated_video_path_changes_when_show_boxes_changes(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    output_dir = tmp_path / "annotated"
    video.write_bytes(b"video")

    assert _path(video, output_dir, show_boxes=True) != _path(video, output_dir, show_boxes=False)


def test_annotated_video_path_changes_when_show_pose_changes(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    output_dir = tmp_path / "annotated"
    video.write_bytes(b"video")

    assert _path(video, output_dir, show_pose=True) != _path(video, output_dir, show_pose=False)


def test_annotated_video_path_encodes_size_in_filename(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    output_dir = tmp_path / "annotated"
    video.write_bytes(b"video")

    assert "-posem-" in _path(video, output_dir, size="m").name


def test_annotated_video_path_changes_when_classifier_key_changes(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    output_dir = tmp_path / "annotated"
    video.write_bytes(b"video")

    no_classifier = _path(video, output_dir, classifier_key=None)
    with_classifier = _path(video, output_dir, classifier_key="rule_based")

    assert no_classifier != with_classifier


def test_annotated_video_path_changes_when_classifier_params_change(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    output_dir = tmp_path / "annotated"
    video.write_bytes(b"video")

    params_a = ClassifierParams(sustained_down_sec=2.0)
    params_b = ClassifierParams(sustained_down_sec=4.0)

    path_a = _path(video, output_dir, classifier_key="rule_based", classifier_params=params_a)
    path_b = _path(video, output_dir, classifier_key="rule_based", classifier_params=params_b)

    assert path_a != path_b
