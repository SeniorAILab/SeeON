from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Final, Protocol

DATA_DIR: Final = Path(__file__).resolve().parent.parent / "data"
SUPPORTED_VIDEO_EXTENSIONS: Final[frozenset[str]] = frozenset(
    {".mp4", ".mov", ".avi", ".mkv"}
)


class VideoSource(StrEnum):
    PROCESSED = "processed"
    RAW = "raw"
    UPLOAD = "upload"


@dataclass(frozen=True, slots=True)
class RegisteredVideo:
    video_id: str
    display_name: str
    path: Path
    source: VideoSource


class UploadedVideoFile(Protocol):
    name: str

    def getvalue(self) -> bytes: ...


class UnsupportedVideoError(Exception):
    def __init__(self, filename: str) -> None:
        self.filename = filename
        super().__init__(str(self))

    def __str__(self) -> str:
        return f"Unsupported video extension: {self.filename}"


def list_registered_videos(
    data_root: Path = DATA_DIR,
    include_sources: tuple[VideoSource, ...] = (
        VideoSource.PROCESSED,
        VideoSource.RAW,
        VideoSource.UPLOAD,
    ),
) -> list[RegisteredVideo]:
    video_groups = [
        (VideoSource.PROCESSED, data_root / "processed"),
        (VideoSource.RAW, data_root / "raw"),
        (VideoSource.UPLOAD, data_root / "uploads"),
    ]
    allowed_sources = set(include_sources)
    videos: list[RegisteredVideo] = []
    for source, directory in video_groups:
        if source in allowed_sources:
            videos.extend(_list_videos(directory=directory, source=source))
    return videos


def persist_uploaded_video(
    uploaded_file: UploadedVideoFile,
    uploads_dir: Path = DATA_DIR / "uploads",
) -> RegisteredVideo:
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = _safe_video_filename(uploaded_file.name)
    target = _unique_path(uploads_dir / filename)
    target.write_bytes(uploaded_file.getvalue())
    return _registered_video(path=target, source=VideoSource.UPLOAD)


def _list_videos(directory: Path, source: VideoSource) -> list[RegisteredVideo]:
    if not directory.exists():
        return []
    paths = [
        path
        for path in sorted(directory.iterdir(), key=_video_sort_key)
        if path.is_file() and path.suffix.casefold() in SUPPORTED_VIDEO_EXTENSIONS
    ]
    return [_registered_video(path=path, source=source) for path in paths]


def _video_sort_key(path: Path) -> tuple[int, str]:
    normalized_name = path.name.casefold()
    return (1 if normalized_name.startswith("demo-") else 0, normalized_name)


def _registered_video(path: Path, source: VideoSource) -> RegisteredVideo:
    return RegisteredVideo(
        video_id=f"{source.value}:{path.name}",
        display_name=f"{source.value} / {path.name}",
        path=path,
        source=source,
    )


def _safe_video_filename(filename: str) -> str:
    original = Path(filename).name
    suffix = Path(original).suffix.casefold()
    if suffix not in SUPPORTED_VIDEO_EXTENSIONS:
        raise UnsupportedVideoError(filename=filename)
    stem = Path(original).stem.casefold()
    safe_stem = re.sub(r"[^a-z0-9가-힣._-]+", "-", stem).strip(".-_")
    if not safe_stem:
        safe_stem = "uploaded-video"
    return f"{safe_stem}{suffix}"


def _unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    for index in range(1, 10_000):
        candidate = path.with_name(f"{path.stem}-{index}{path.suffix}")
        if not candidate.exists():
            return candidate
    raise FileExistsError(path)
