from __future__ import annotations

import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Final

try:
    from demo.video_registry import DATA_DIR
except ModuleNotFoundError:
    from video_registry import DATA_DIR


@dataclass(frozen=True, slots=True)
class ModelDemoVideo:
    model_id: str
    display_name: str
    filename: str
    url: str


class DemoVideoDownloadError(Exception):
    def __init__(self, url: str) -> None:
        self.url = url
        super().__init__(str(self))

    def __str__(self) -> str:
        return f"Could not download model demo video: {self.url}"


FetchVideoBytes = Callable[[str], bytes]

PROCESSED_DIR: Final = DATA_DIR / "processed"
DEMO_VIDEOS: Final[tuple[ModelDemoVideo, ...]] = (
    ModelDemoVideo(
        # Upstream HF repo ships only a still sample image (no demo video).
        # OpenCV VideoCapture reads it as a single-frame clip, so it flows
        # through the same playback pipeline as the video demos.
        model_id="melihuzunoglu-human-fall-detection",
        display_name="melihuzunoglu sample image",
        filename="demo-melihuzunoglu-sample.jpg",
        url="https://huggingface.co/melihuzunoglu/human-fall-detection/resolve/main/sample_image.jpg",
    ),
    ModelDemoVideo(
        model_id="tomotsugu-human-fall-detection",
        display_name="Tomotsugu output.mp4",
        filename="demo-tomotsugu-output.mp4",
        url=(
            "https://raw.githubusercontent.com/Tomotsugu-dev/Human-Fall-Detection/"
            "main/results/fall_detection/output.mp4"
        ),
    ),
    ModelDemoVideo(
        model_id="syed-yolo-fall-detection",
        display_name="Syed annotated home fall 1",
        filename="demo-syed-home-fall-1.avi",
        url=(
            "https://raw.githubusercontent.com/"
            "SyedBurhanAhmed/Real-Time-Fall-Detection-using-YOLO/"
            "main/Result%20videos/annotated_home%20fall%201.avi"
        ),
    ),
    ModelDemoVideo(
        model_id="syed-yolo-fall-detection",
        display_name="Syed annotated home not fall 1",
        filename="demo-syed-home-not-fall-1.avi",
        url=(
            "https://raw.githubusercontent.com/"
            "SyedBurhanAhmed/Real-Time-Fall-Detection-using-YOLO/"
            "main/Result%20videos/annotated_home%20not%20fall%201.avi"
        ),
    ),
)


def available_demo_videos() -> tuple[ModelDemoVideo, ...]:
    return DEMO_VIDEOS


def demo_video_path(
    video: ModelDemoVideo,
    processed_dir: Path = PROCESSED_DIR,
) -> Path:
    return processed_dir / video.filename


def demo_video_exists(
    video: ModelDemoVideo,
    processed_dir: Path = PROCESSED_DIR,
) -> bool:
    return demo_video_path(video=video, processed_dir=processed_dir).exists()


def _fetch_video_bytes(url: str) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=90) as response:
            return response.read()
    except (urllib.error.URLError, TimeoutError) as error:
        raise DemoVideoDownloadError(url=url) from error


def materialize_demo_video(
    video: ModelDemoVideo,
    processed_dir: Path = PROCESSED_DIR,
    fetcher: FetchVideoBytes = _fetch_video_bytes,
) -> Path:
    processed_dir.mkdir(parents=True, exist_ok=True)
    target = demo_video_path(video=video, processed_dir=processed_dir)
    if target.exists():
        return target
    target.write_bytes(fetcher(video.url))
    return target
