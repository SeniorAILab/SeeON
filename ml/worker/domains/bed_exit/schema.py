from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from contracts.observation import BoundingBox

BedOccupancy = Literal["empty", "occupied", "exit"]


@dataclass(frozen=True, slots=True)
class BedStatus:
    bed_id: int
    box: BoundingBox
    occupancy: BedOccupancy
    person_id: int | None = None


@dataclass(frozen=True, slots=True)
class BedExitEvent:
    person_id: int
    bed_id: int


@dataclass(frozen=True, slots=True)
class BedExitFrame:
    statuses: tuple[BedStatus, ...]
    events: tuple[BedExitEvent, ...] = field(default_factory=tuple)
