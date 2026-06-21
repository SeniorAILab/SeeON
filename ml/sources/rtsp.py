from __future__ import annotations

from collections.abc import Iterator

from contracts.frame import Frame


class RTSPSource:
    """Deferred RTSP live source scaffold with the FrameSource iterator shape."""

    def __init__(self, url: str) -> None:
        self._url = url

    def __iter__(self) -> Iterator[Frame]:
        raise NotImplementedError("RTSP live wiring deferred")


__all__ = ["RTSPSource"]
