from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from demo.video_registry import (
    VideoSource,
    list_domains,
    list_registered_videos,
    list_roles_for_domain,
    persist_uploaded_video,
)


@dataclass(frozen=True, slots=True)
class FakeUploadedFile:
    name: str
    payload: bytes

    def getvalue(self) -> bytes:
        return self.payload


def _make_clip(data_root: Path, *parts: str, payload: bytes = b"clip") -> Path:
    path = data_root.joinpath(*parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return path


def test_lists_domain_videos_with_domain_role_filename_ids(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    _make_clip(data_root, "nursing-home", "processed", "2026-04-08 room.mp4")
    _make_clip(data_root, "nursing-home", "raw", "hospital_2.mp4")
    _make_clip(data_root, "nursing-home", "raw", "hospital_1.mov")
    _make_clip(data_root, "le2i", "raw", "video (1).avi")
    (data_root / "nursing-home" / "processed" / "ignore.txt").write_text("not a video")
    _make_clip(data_root, "eval", "report.mp4")  # non-domain: never listed

    videos = list_registered_videos(data_root=data_root)

    assert [(video.domain, video.source, video.video_id) for video in videos] == [
        ("le2i", VideoSource.RAW, "le2i/raw/video (1).avi"),
        ("nursing-home", VideoSource.PROCESSED, "nursing-home/processed/2026-04-08 room.mp4"),
        ("nursing-home", VideoSource.RAW, "nursing-home/raw/hospital_1.mov"),
        ("nursing-home", VideoSource.RAW, "nursing-home/raw/hospital_2.mp4"),
    ]
    assert videos[0].display_name == "le2i / raw / video (1).avi"


def test_can_limit_listing_by_source_and_domain(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    _make_clip(data_root, "nursing-home", "processed", "ready.mp4")
    _make_clip(data_root, "nursing-home", "raw", "raw.mp4")
    _make_clip(data_root, "le2i", "processed", "other.mp4")
    _make_clip(data_root, "uploads", "uploaded.mp4")

    videos = list_registered_videos(
        data_root=data_root,
        include_sources=(VideoSource.PROCESSED, VideoSource.UPLOAD),
        domains=("nursing-home",),
    )

    assert [(video.source, video.video_id) for video in videos] == [
        (VideoSource.PROCESSED, "nursing-home/processed/ready.mp4"),
        (VideoSource.UPLOAD, "uploads/uploaded.mp4"),
    ]


def test_list_domains_excludes_eval_uploads_and_hidden_dirs(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    for name in ("nursing-home", "le2i", "eval", "uploads", ".omc", ".cache"):
        (data_root / name).mkdir(parents=True)

    assert list_domains(data_root) == ["le2i", "nursing-home"]


def test_lists_clips_nested_below_the_role_folder(tmp_path: Path) -> None:
    # Le2i nests raw clips one level down: raw/{scenario}/*.avi.
    data_root = tmp_path / "data"
    _make_clip(data_root, "le2i", "raw", "Home", "video (1).avi")
    _make_clip(data_root, "le2i", "raw", "Coffee_room", "video (2).avi")
    (data_root / "le2i" / "raw" / "Home" / "Annotation_files").mkdir()
    (data_root / "le2i" / "raw" / "Home" / "Annotation_files" / "video (1).txt").write_text("1 2")

    videos = list_registered_videos(data_root=data_root)

    assert [video.video_id for video in videos] == [
        "le2i/raw/Coffee_room/video (2).avi",
        "le2i/raw/Home/video (1).avi",
    ]
    assert videos[1].display_name == "le2i / raw / Home / video (1).avi"


def test_lists_regular_processed_videos_before_reference_demo_videos(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    _make_clip(data_root, "nursing-home", "processed", "2026-04-08 room.mp4")
    _make_clip(data_root, "nursing-home", "processed", "demo-syed-home-fall-1.avi")

    videos = list_registered_videos(
        data_root=data_root,
        include_sources=(VideoSource.PROCESSED,),
    )

    assert [video.path.name for video in videos] == [
        "2026-04-08 room.mp4",
        "demo-syed-home-fall-1.avi",
    ]


def test_list_roles_for_domain_returns_only_roles_with_clips(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    # "le2i" has only raw clips; "nursing-home" has both processed and raw.
    _make_clip(data_root, "le2i", "raw", "video.avi")
    _make_clip(data_root, "nursing-home", "processed", "ready.mp4")
    _make_clip(data_root, "nursing-home", "raw", "raw.mp4")
    # Empty processed dir for le2i — should not appear in results.
    (data_root / "le2i" / "processed").mkdir(parents=True, exist_ok=True)

    assert list_roles_for_domain("le2i", data_root=data_root) == [VideoSource.RAW]
    assert list_roles_for_domain("nursing-home", data_root=data_root) == [
        VideoSource.PROCESSED,
        VideoSource.RAW,
    ]


def test_list_roles_for_domain_returns_empty_when_domain_missing(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    data_root.mkdir()

    assert list_roles_for_domain("nonexistent", data_root=data_root) == []


def test_persists_uploaded_video_with_sanitized_unique_name(tmp_path: Path) -> None:
    uploads_dir = tmp_path / "uploads"
    uploaded = FakeUploadedFile(name="../fall sample.mp4", payload=b"video-bytes")
    duplicate = FakeUploadedFile(name="../fall sample.mp4", payload=b"second-video")

    first = persist_uploaded_video(uploaded, uploads_dir=uploads_dir)
    second = persist_uploaded_video(duplicate, uploads_dir=uploads_dir)

    assert first.source is VideoSource.UPLOAD
    assert first.domain == "uploads"
    assert first.video_id == "uploads/fall-sample.mp4"
    assert first.path.parent == uploads_dir
    assert first.path.read_bytes() == b"video-bytes"
    assert second.path.name == "fall-sample-1.mp4"
    assert second.path.read_bytes() == b"second-video"
