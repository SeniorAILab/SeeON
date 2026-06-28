"""Per-camera scene-state aggregation for perception."""

from __future__ import annotations

from dataclasses import dataclass, field

from contracts.observation import BoundingBox, FrameObservation


@dataclass(slots=True)
class SceneState:
    """Cache the latest observation, track ids, and bed regions for one camera."""

    camera_id: str
    latest_observation: FrameObservation | None = None
    track_ids: tuple[int, ...] = field(default_factory=tuple)
    bed_regions: tuple[BoundingBox, ...] = field(default_factory=tuple)

    def update(
        self,
        observation: FrameObservation,
        *,
        track_ids: tuple[int, ...] = (),
    ) -> FrameObservation:
        """Store the newest observation and refresh cached scene fields."""
        self.latest_observation = observation
        self.track_ids = track_ids
        bed_boxes, _statuses = observation.regions
        if bed_boxes:
            self.bed_regions = bed_boxes
        return observation
