from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Final, Protocol

DATA_DIR: Final = Path(__file__).resolve().parent.parent / "data"
# ml/data/ is domain-first (ADR-011): top-level folders are domains except these.
NON_DOMAIN_DIRS: Final[frozenset[str]] = frozenset({"eval", "uploads"})
SUPPORTED_VIDEO_EXTENSIONS: Final[frozenset[str]] = frozenset(
    {".mp4", ".mov", ".avi", ".mkv"}
)
# Some upstream models ship only a still sample image as their demo asset.
# OpenCV reads these as single-frame clips, so we register them alongside videos.
SUPPORTED_IMAGE_EXTENSIONS: Final[frozenset[str]] = frozenset({".jpg", ".jpeg", ".png"})
SUPPORTED_MEDIA_EXTENSIONS: Final[frozenset[str]] = (
    SUPPORTED_VIDEO_EXTENSIONS | SUPPORTED_IMAGE_EXTENSIONS
)


class VideoSource(StrEnum):
    PROCESSED = "processed"
    RAW = "raw"
    UPLOAD = "upload"


# Roles the demo enumerates inside each domain folder (poses/annotated are not
# playable inputs).
DOMAIN_ROLES: Final[tuple[VideoSource, ...]] = (VideoSource.PROCESSED, VideoSource.RAW)
UPLOADS_DOMAIN: Final = "uploads"


@dataclass(frozen=True, slots=True)
class RegisteredVideo:
    video_id: str
    display_name: str
    path: Path
    source: VideoSource
    domain: str


class UploadedVideoFile(Protocol):
    name: str

    def getvalue(self) -> bytes: ...


def list_domains(data_root: Path = DATA_DIR) -> list[str]:
    """Discover domain folders under *data_root* (everything but eval/uploads)."""
    if not data_root.exists():
        return []
    return sorted(
        entry.name
        for entry in data_root.iterdir()
        if entry.is_dir()
        and entry.name not in NON_DOMAIN_DIRS
        and not entry.name.startswith(".")  # tool scratch (.omc/...), never a domain
    )


def list_registered_videos(
    data_root: Path = DATA_DIR,
    include_sources: tuple[VideoSource, ...] = (
        VideoSource.PROCESSED,
        VideoSource.RAW,
        VideoSource.UPLOAD,
    ),
    domains: tuple[str, ...] | None = None,
) -> list[RegisteredVideo]:
    """Enumerate playable clips, domain-first.

    Domain clips come from ``{domain}/{processed,raw}``; uploads from the
    top-level ``uploads/``. *domains* of ``None`` means every discovered domain.
    """
    allowed_sources = set(include_sources)
    selected_domains = list(domains) if domains is not None else list_domains(data_root)
    videos: list[RegisteredVideo] = []
    for domain in selected_domains:
        for source in DOMAIN_ROLES:
            if source in allowed_sources:
                videos.extend(
                    _list_videos(
                        directory=data_root / domain / source.value,
                        source=source,
                        domain=domain,
                    )
                )
    if VideoSource.UPLOAD in allowed_sources:
        videos.extend(
            _list_videos(
                directory=data_root / UPLOADS_DOMAIN,
                source=VideoSource.UPLOAD,
                domain=UPLOADS_DOMAIN,
            )
        )
    return videos


def persist_uploaded_video(
    uploaded_file: UploadedVideoFile,
    uploads_dir: Path = DATA_DIR / UPLOADS_DOMAIN,
) -> RegisteredVideo:
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = _safe_video_filename(uploaded_file.name)
    target = _unique_path(uploads_dir / filename)
    target.write_bytes(uploaded_file.getvalue())
    return _registered_video(path=target, source=VideoSource.UPLOAD, domain=UPLOADS_DOMAIN)


def _list_videos(directory: Path, source: VideoSource, domain: str) -> list[RegisteredVideo]:
    # Recursive: some domains nest clips below the role folder (e.g. Le2i's
    # raw/{scenario}/*.avi). ids/display names keep the sub-path.
    if not directory.exists():
        return []
    paths = [
        path
        for path in sorted(directory.rglob("*"), key=_video_sort_key)
        if path.is_file() and path.suffix.casefold() in SUPPORTED_MEDIA_EXTENSIONS
    ]
    return [
        _registered_video(path=path, source=source, domain=domain, role_dir=directory)
        for path in paths
    ]


def _video_sort_key(path: Path) -> tuple[int, str]:
    normalized = str(path).casefold()
    return (1 if path.name.casefold().startswith("demo-") else 0, normalized)


def _registered_video(
    path: Path,
    source: VideoSource,
    domain: str,
    role_dir: Path | None = None,
) -> RegisteredVideo:
    # video_id mirrors the on-disk layout relative to ml/data/ so it is unique
    # within one data root: "{domain}/{role}/{subpath…/name}", or
    # "uploads/{name}" for the role-less top-level uploads folder. Never
    # role-only — that collides across domains (ADR-011).
    rel_parts = path.relative_to(role_dir).parts if role_dir is not None else (path.name,)
    if source is VideoSource.UPLOAD:
        id_parts = (UPLOADS_DOMAIN, *rel_parts)
    else:
        id_parts = (domain, source.value, *rel_parts)
    return RegisteredVideo(
        video_id="/".join(id_parts),
        display_name=" / ".join(id_parts),
        path=path,
        source=source,
        domain=domain,
    )


def _safe_video_filename(filename: str) -> str:
    original = Path(filename).name
    suffix = Path(original).suffix.casefold()
    if suffix not in SUPPORTED_VIDEO_EXTENSIONS:
        raise ValueError(f"Unsupported video extension: {filename}")
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
