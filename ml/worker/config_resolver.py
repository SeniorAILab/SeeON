from __future__ import annotations

from contracts.worker_config import PulledWorkerConfig
from worker.domains.bed_exit.detector import NightWindow
from worker.edge_worker_config import CameraRuntimeConfig, EdgeWorkerConfig


def resolve_effective_config(
    yaml_config: EdgeWorkerConfig,
    pulled: PulledWorkerConfig | None,
    *,
    source: str | None = None,
) -> tuple[EdgeWorkerConfig, int, int, str]:
    if pulled is None:
        return yaml_config, 0, 0, "yaml"

    pulled_by_camera_id = {camera.camera_id: camera for camera in pulled.cameras}
    cameras = tuple(
        _override_camera_rtsp(camera, pulled_by_camera_id.get(camera.camera_id).rtsp_url)
        if camera.camera_id in pulled_by_camera_id
        else camera
        for camera in yaml_config.cameras
    )
    return (
        yaml_config.model_copy(update={"cameras": cameras}),
        pulled.config_version,
        pulled.restart_epoch,
        "pulled" if source is None else source,
    )
def resolve_night_window(
    yaml_config: EdgeWorkerConfig,
    pulled: PulledWorkerConfig | None,
) -> NightWindow | None:
    if pulled is not None and pulled.night_window is not None:
        return NightWindow(
            start=pulled.night_window.start,
            end=pulled.night_window.end,
            tz=pulled.night_window.tz,
        )

    bed_exit = yaml_config.domains.bed_exit
    if bed_exit is not None and bed_exit.night_window is not None:
        return NightWindow(
            start=bed_exit.night_window.start,
            end=bed_exit.night_window.end,
            tz=bed_exit.night_window.tz,
        )
    return None




def _override_camera_rtsp(camera: CameraRuntimeConfig, rtsp_url: str | None) -> CameraRuntimeConfig:
    if rtsp_url is None:
        return camera
    if camera.streams is not None:
        return camera.model_copy(
            update={"streams": camera.streams.model_copy(update={"sub": rtsp_url})}
        )
    return camera.model_copy(update={"rtsp_url": rtsp_url})


__all__ = ["resolve_effective_config", "resolve_night_window"]
