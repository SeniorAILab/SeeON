from __future__ import annotations

from pathlib import Path

from demo.demo_videos import (
    available_demo_videos,
    demo_video_exists,
    demo_video_path,
    materialize_demo_video,
)


def test_exposes_model_demo_videos_for_repos_with_video_assets() -> None:
    videos = available_demo_videos()

    assert {video.model_id for video in videos} == {
        "tomotsugu-human-fall-detection",
        "syed-yolo-fall-detection",
    }
    assert all(video.url.startswith("https://raw.githubusercontent.com/") for video in videos)


def test_materializes_model_demo_video_into_processed_folder(tmp_path: Path) -> None:
    video = available_demo_videos()[0]
    processed_dir = tmp_path / "processed"

    path = materialize_demo_video(
        video=video,
        processed_dir=processed_dir,
        fetcher=lambda _url: b"demo-video-bytes",
    )

    assert path == demo_video_path(video=video, processed_dir=processed_dir)
    assert path.read_bytes() == b"demo-video-bytes"
    assert demo_video_exists(video=video, processed_dir=processed_dir)
