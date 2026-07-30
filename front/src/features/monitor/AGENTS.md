# Floor monitor kiosk

- This is an always-on wall display, not an operator console. Keep interaction to floor select, fullscreen, and sound toggle; no admin affordances on the board.
- `FloorMonitorPage` serves both the all-floor view and `/floor/:floorId`. `useRealtimeSpaceStatus` merges dashboard SSE with the alert REST read model — state comes from that seam, never from a component fetch.
- DANGER and CHECK_NEEDED persist until acknowledged; only CAUTION may decay on its own. Acknowledgement stops both the visual emphasis and the voice queue.
- TTS runs through `services/tts/ttsProvider` + `ttsManager` (priority queue, re-announce backoff, no duplicate per event). Swapping providers means implementing `TTSProvider` only; leave queue and schedule logic untouched.
- Voice and sound default to off. First utterance needs a user gesture (browser autoplay policy) — do not work around it.
- Public surface is `index.ts` (`useMonitorSettingsStore`, `FloorMonitorPage`, `FloorSelectLandingPage`). Monitor settings are per-device browser state, not facility config.
