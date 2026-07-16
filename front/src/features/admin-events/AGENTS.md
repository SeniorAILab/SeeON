# Admin event evidence

- Import through the feature's public barrel. Keep media states exhaustive: loading, pending, ready, unavailable, expired, deleted, denied, error.
- Key requests by event/media identity, abort stale loads, and tear down native video sources on navigation or unmount.
- Use the authenticated native video URL so browser Range requests work. Playback stays 1x; fix clip timestamps at the producer.
- Record playback/fullscreen access. Do not add download UI, resident identity, model internals, or live-CCTV affordances.
- Screenshots and tests must not capture resident frames; pause or mask the video before visual QA.

