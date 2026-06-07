from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from demo.video_registry import (
    VideoSource,
    list_registered_videos,
    persist_uploaded_video,
)


@dataclass(frozen=True, slots=True)
class FakeUploadedFile:
    name: str
    payload: bytes

    def getvalue(self) -> bytes:
        return self.payload


def test_lists_processed_and_raw_videos_in_stable_display_order(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    processed_dir = data_root / "processed"
    raw_dir = data_root / "raw"
    processed_dir.mkdir(parents=True)
    raw_dir.mkdir(parents=True)
    (processed_dir / "2026-04-08 room.mp4").write_bytes(b"processed-a")
    (processed_dir / "ignore.txt").write_text("not a video")
    (raw_dir / "hospital_2.mp4").write_bytes(b"raw-b")
    (raw_dir / "hospital_1.mov").write_bytes(b"raw-a")

    videos = list_registered_videos(data_root=data_root)

    assert [(video.source, video.display_name) for video in videos] == [
        (VideoSource.PROCESSED, "processed / 2026-04-08 room.mp4"),
        (VideoSource.RAW, "raw / hospital_1.mov"),
        (VideoSource.RAW, "raw / hospital_2.mp4"),
    ]


def test_can_limit_registered_videos_to_processed_and_uploads(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    (data_root / "processed").mkdir(parents=True)
    (data_root / "raw").mkdir()
    (data_root / "uploads").mkdir()
    (data_root / "processed" / "ready.mp4").write_bytes(b"processed")
    (data_root / "raw" / "raw.mp4").write_bytes(b"raw")
    (data_root / "uploads" / "uploaded.mp4").write_bytes(b"upload")

    videos = list_registered_videos(
        data_root=data_root,
        include_sources=(VideoSource.PROCESSED, VideoSource.UPLOAD),
    )

    assert [(video.source, video.path.name) for video in videos] == [
        (VideoSource.PROCESSED, "ready.mp4"),
        (VideoSource.UPLOAD, "uploaded.mp4"),
    ]


def test_lists_regular_processed_videos_before_reference_demo_videos(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    processed_dir = data_root / "processed"
    processed_dir.mkdir(parents=True)
    (processed_dir / "2026-04-08 room.mp4").write_bytes(b"processed")
    (processed_dir / "demo-syed-home-fall-1.avi").write_bytes(b"demo")

    videos = list_registered_videos(
        data_root=data_root,
        include_sources=(VideoSource.PROCESSED,),
    )

    assert [video.path.name for video in videos] == [
        "2026-04-08 room.mp4",
        "demo-syed-home-fall-1.avi",
    ]


def test_persists_uploaded_video_with_sanitized_unique_name(tmp_path: Path) -> None:
    uploads_dir = tmp_path / "uploads"
    uploaded = FakeUploadedFile(name="../fall sample.mp4", payload=b"video-bytes")
    duplicate = FakeUploadedFile(name="../fall sample.mp4", payload=b"second-video")

    first = persist_uploaded_video(uploaded, uploads_dir=uploads_dir)
    second = persist_uploaded_video(duplicate, uploads_dir=uploads_dir)

    assert first.source is VideoSource.UPLOAD
    assert first.path.parent == uploads_dir
    assert first.path.name == "fall-sample.mp4"
    assert first.path.read_bytes() == b"video-bytes"
    assert second.path.name == "fall-sample-1.mp4"
    assert second.path.read_bytes() == b"second-video"
