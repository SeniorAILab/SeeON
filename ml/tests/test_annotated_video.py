from __future__ import annotations

import os
from pathlib import Path

from demo.annotated_video import annotated_video_path
from demo.model_registry import available_pretrained_specs


def test_annotated_video_path_changes_when_source_file_changes(tmp_path: Path) -> None:
    spec = available_pretrained_specs()[0]
    video = tmp_path / "sample.mp4"
    video.write_bytes(b"first")
    first_path = annotated_video_path(
        source_path=video,
        spec=spec,
        threshold=0.15,
        frame_stride=4,
        output_dir=tmp_path / "annotated",
    )

    video.write_bytes(b"second")
    os.utime(video)
    second_path = annotated_video_path(
        source_path=video,
        spec=spec,
        threshold=0.15,
        frame_stride=4,
        output_dir=tmp_path / "annotated",
    )

    assert first_path != second_path
    assert first_path.suffix == ".mp4"


def test_annotated_video_path_changes_when_model_changes(tmp_path: Path) -> None:
    first_spec, second_spec = available_pretrained_specs()[:2]
    video = tmp_path / "sample.mp4"
    video.write_bytes(b"video")

    first_path = annotated_video_path(
        source_path=video,
        spec=first_spec,
        threshold=0.15,
        frame_stride=4,
        output_dir=tmp_path / "annotated",
    )
    second_path = annotated_video_path(
        source_path=video,
        spec=second_spec,
        threshold=0.15,
        frame_stride=4,
        output_dir=tmp_path / "annotated",
    )

    assert first_path != second_path
