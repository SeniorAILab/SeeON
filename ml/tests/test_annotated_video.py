from __future__ import annotations

import os
from pathlib import Path

from demo.annotated_video import annotated_video_path


def test_annotated_video_path_changes_when_source_file_changes(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    video.write_bytes(b"first")
    first_path = annotated_video_path(
        source_path=video,
        frame_stride=4,
        output_dir=tmp_path / "annotated",
    )

    video.write_bytes(b"second-longer")
    os.utime(video)
    second_path = annotated_video_path(
        source_path=video,
        frame_stride=4,
        output_dir=tmp_path / "annotated",
    )

    assert first_path != second_path
    assert first_path.suffix == ".mp4"


def test_annotated_video_path_changes_when_frame_stride_changes(tmp_path: Path) -> None:
    video = tmp_path / "sample.mp4"
    video.write_bytes(b"video")

    stride_four = annotated_video_path(
        source_path=video,
        frame_stride=4,
        output_dir=tmp_path / "annotated",
    )
    stride_two = annotated_video_path(
        source_path=video,
        frame_stride=2,
        output_dir=tmp_path / "annotated",
    )

    assert stride_four != stride_two
