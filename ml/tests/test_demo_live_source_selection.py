from __future__ import annotations

from pathlib import Path

from demo.demo_ui import CAMERA_SOURCE_LABEL, LiveSourceOption, build_live_source_options
from demo.video_registry import RegisteredVideo, VideoSource
from worker.sources import CameraSource


def _video(video_id: str = "uploads/demo.mp4") -> RegisteredVideo:
    return RegisteredVideo(
        video_id=video_id,
        display_name="Demo clip",
        path=Path("/tmp") / video_id,
        source=VideoSource.UPLOAD,
        domain="uploads",
    )


def test_source_options_include_laptop_camera() -> None:
    video = _video()

    options = build_live_source_options(registered_videos=[video])

    assert options[0] == LiveSourceOption(kind="camera", label=CAMERA_SOURCE_LABEL)
    assert options[1] == LiveSourceOption(kind="video", label=video.display_name, video=video)


def test_camera_selection_creates_camera_source_without_video_path(monkeypatch) -> None:
    from demo import model_bootstrap

    monkeypatch.setattr(model_bootstrap, "ensure_fall_models", lambda: None)
    from demo import app

    def fail_video_source(_path: object) -> None:
        raise AssertionError("camera source selection must not open a registered video path")

    monkeypatch.setattr(app, "VideoFileSource", fail_video_source)

    source = app._frame_source_for_selection(
        LiveSourceOption(kind="camera", label=CAMERA_SOURCE_LABEL),
        camera_index=2,
    )

    assert isinstance(source, CameraSource)
    assert (
        app._source_id_for_selection(
            LiveSourceOption(kind="camera", label=CAMERA_SOURCE_LABEL),
            camera_index=2,
        )
        == "camera:2"
    )
