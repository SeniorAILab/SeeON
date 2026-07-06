# Rule: RTSP H.264 substream fallback

> Scope: edge `ml-worker` RTSP intake when the first-frame probe cannot decode the configured main stream.

## Probe before changing worker config

Run the first-frame probe against the exact RTSP URL that `ml-worker` will use. The probe result must not expose camera credentials; copied errors should show masked userinfo and sensitive query values.

```bash
uv run --directory ml python -m worker.sources.probe "rtsp://USER:PASSWORD@NVR_OR_CAMERA/PATH" --backend opencv --timeout-ms 5000
```

Interpret the probe error class:

- `auth`: fix the NVR/camera account, password, channel permission, or URL path first. Do not rotate worker config through alternate streams until credentials are known-good.
- `timeout`: verify the edge host can reach the NVR/camera address and port, then test the NVR substream URL.
- `decode`: treat the main stream profile/codec as incompatible with the current OpenCV RTSP backend and test an H.264 substream.

## H.264 substream fallback order

1. In the NVR/camera web console, locate the camera channel used by the failing URL.
2. Enable the channel's substream/extra stream.
3. Set the substream codec to H.264. Avoid H.265/H.265+, smart codec, vendor-enhanced profiles, or MJPEG for the worker fallback path.
4. Choose a modest substream profile before raising quality: 640x360 or 704x480, 10-15 FPS, constant bitrate, baseline/main profile, and a keyframe interval near the FPS value.
5. Copy the vendor's RTSP substream URL for that same channel. Common patterns use a subtype/substream selector such as `subtype=1`, `stream=1`, `channel=1&subtype=1`, or a secondary path documented by the NVR vendor.
6. Re-run the first-frame probe against the substream URL. Keep only the masked probe output in tickets or logs.
7. Update the worker camera RTSP configuration only after the substream probe reports `ok: true` with the expected resolution and channel count.
8. Leave `ML_RTSP_BACKEND` unset or set to `opencv`. `nvdec` is an explicit future backend and currently raises `NotImplementedError`.

## Do not mask a bad main stream with retries

Increasing worker retry counts does not fix an unsupported codec/profile. A first-frame `decode` failure should be resolved by switching the NVR channel to a worker-compatible H.264 substream or by changing the camera/NVR codec settings, not by adding another frame server or a second FastAPI process.
