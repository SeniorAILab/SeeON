# ML Dashboard Design Notes

## Operator Flow

- The dashboard is an edge operations tool, not a marketing page.
- Camera identity is human-first: operators enter a camera name, and ml-api issues the id.
- RTSP entry is structured as scheme, host, port, credentials, path, and query; the default path is `/trackID=1`.
- Event monitoring starts with a camera grid, then an event selector for the selected camera, then the real worker MJPEG stream.
- Evidence clips are history for the selected camera/event. They must not be used as a live-stream fallback.

## Failure States

- A broken stream shows an explicit unavailable state.
- The UI must not render fake frames, placeholder video, demo streams, or clip playback as live monitoring.
- Secrets stay out of visible text, logs, screenshots, and committed artifacts.
