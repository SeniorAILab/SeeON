from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Final


class ModelBackend(StrEnum):
    PRETRAINED_YOLO = "pretrained_yolo"


@dataclass(frozen=True, slots=True)
class ModelSpec:
    model_id: str
    display_name: str
    source_url: str
    weight_url: str | None
    artifact_subdir: str | None
    fall_labels: tuple[str, ...]
    default_threshold: float
    backend: ModelBackend
    status_note: str


MODEL_SPECS: Final[tuple[ModelSpec, ...]] = (
    ModelSpec(
        model_id="melihuzunoglu-human-fall-detection",
        display_name="melihuzunoglu/human-fall-detection",
        source_url="https://huggingface.co/melihuzunoglu/human-fall-detection",
        weight_url="https://huggingface.co/melihuzunoglu/human-fall-detection/resolve/main/best.pt",
        artifact_subdir="melihuzunoglu_yolo11",
        fall_labels=("fallen", "fall", "lying"),
        default_threshold=0.25,
        backend=ModelBackend.PRETRAINED_YOLO,
        status_note=(
            "Pretrained YOLO candidate loaded from the local artifact through Ultralytics."
        ),
    ),
    ModelSpec(
        model_id="tomotsugu-human-fall-detection",
        display_name="Tomotsugu-dev/Human-Fall-Detection",
        source_url="https://github.com/Tomotsugu-dev/Human-Fall-Detection",
        weight_url="https://raw.githubusercontent.com/Tomotsugu-dev/Human-Fall-Detection/main/models/yolo_fall/best.pt",
        artifact_subdir="tomotsugu_yolov8",
        fall_labels=("fall", "fallen", "lying"),
        default_threshold=0.25,
        backend=ModelBackend.PRETRAINED_YOLO,
        status_note="Pretrained YOLO candidate with a repo-hosted best.pt artifact.",
    ),
    ModelSpec(
        model_id="syed-yolo-fall-detection",
        display_name="SyedBurhanAhmed/Real-Time-Fall-Detection-using-YOLO",
        source_url="https://github.com/SyedBurhanAhmed/Real-Time-Fall-Detection-using-YOLO",
        weight_url="https://raw.githubusercontent.com/SyedBurhanAhmed/Real-Time-Fall-Detection-using-YOLO/main/Model/weights/best.pt",
        artifact_subdir="syed_yolo11_le2i",
        fall_labels=("fall", "fallen", "lying"),
        default_threshold=0.25,
        backend=ModelBackend.PRETRAINED_YOLO,
        status_note="Pretrained YOLOv11/LE2I candidate with a repo-hosted best.pt artifact.",
    ),
)


def available_pretrained_specs() -> tuple[ModelSpec, ...]:
    return tuple(spec for spec in MODEL_SPECS if spec.backend is ModelBackend.PRETRAINED_YOLO)
