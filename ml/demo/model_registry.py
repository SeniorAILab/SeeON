from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Final, assert_never


class ModelBehavior(StrEnum):
    FALL_RAMP = "fall_ramp"
    STABLE = "stable"


class ModelBackend(StrEnum):
    DEMO = "demo"
    PRETRAINED_YOLO = "pretrained_yolo"


@dataclass(frozen=True, slots=True)
class PosePoint:
    name: str
    x: int
    y: int
    confidence: float


@dataclass(frozen=True, slots=True)
class PoseFrame:
    keypoints: tuple[PosePoint, ...]


@dataclass(frozen=True, slots=True)
class FramePrediction:
    model_id: str
    label: str
    fall_score: float
    pose: PoseFrame


@dataclass(frozen=True, slots=True)
class ModelSpec:
    model_id: str
    display_name: str
    source_url: str
    weight_url: str | None
    artifact_subdir: str | None
    fall_labels: tuple[str, ...]
    default_threshold: float
    behavior: ModelBehavior
    backend: ModelBackend
    status_note: str


@dataclass(frozen=True, slots=True)
class DemoFallModel:
    spec: ModelSpec
    threshold: float

    @property
    def model_id(self) -> str:
        return self.spec.model_id

    @property
    def display_name(self) -> str:
        return self.spec.display_name

    def predict_frame(
        self,
        frame_index: int,
        time_sec: float,
        frame_shape: tuple[int, int, int],
    ) -> FramePrediction:
        score = _score_for_behavior(
            behavior=self.spec.behavior,
            frame_index=frame_index,
            time_sec=time_sec,
        )
        label = "fall_candidate" if score >= self.threshold else "watching"
        pose = _pose_for_score(score=score, frame_shape=frame_shape)
        return FramePrediction(
            model_id=self.model_id,
            label=label,
            fall_score=score,
            pose=pose,
        )


class UnknownModelError(Exception):
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        super().__init__(str(self))

    def __str__(self) -> str:
        return f"Unknown demo model: {self.model_id}"


MODEL_SPECS: Final[tuple[ModelSpec, ...]] = (
    ModelSpec(
        model_id="demo-fall-pose",
        display_name="Demo pose fall detector",
        source_url="local deterministic demo adapter",
        weight_url=None,
        artifact_subdir=None,
        fall_labels=("fall_candidate",),
        default_threshold=0.6,
        behavior=ModelBehavior.FALL_RAMP,
        backend=ModelBackend.DEMO,
        status_note="Local deterministic adapter for realtime UI verification.",
    ),
    ModelSpec(
        model_id="demo-stable-pose",
        display_name="Demo stable pose baseline",
        source_url="local deterministic demo adapter",
        weight_url=None,
        artifact_subdir=None,
        fall_labels=("watching",),
        default_threshold=0.8,
        behavior=ModelBehavior.STABLE,
        backend=ModelBackend.DEMO,
        status_note="Always below threshold; used for regression and no-alert checks.",
    ),
    ModelSpec(
        model_id="melihuzunoglu-human-fall-detection",
        display_name="melihuzunoglu/human-fall-detection",
        source_url="https://huggingface.co/melihuzunoglu/human-fall-detection",
        weight_url="https://huggingface.co/melihuzunoglu/human-fall-detection/resolve/main/best.pt",
        artifact_subdir="melihuzunoglu_yolo11",
        fall_labels=("fallen", "fall", "lying"),
        default_threshold=0.65,
        behavior=ModelBehavior.FALL_RAMP,
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
        default_threshold=0.65,
        behavior=ModelBehavior.FALL_RAMP,
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
        default_threshold=0.65,
        behavior=ModelBehavior.FALL_RAMP,
        backend=ModelBackend.PRETRAINED_YOLO,
        status_note="Pretrained YOLOv11/LE2I candidate with a repo-hosted best.pt artifact.",
    ),
)


def available_model_specs() -> tuple[ModelSpec, ...]:
    return MODEL_SPECS


def available_pretrained_specs() -> tuple[ModelSpec, ...]:
    return tuple(spec for spec in MODEL_SPECS if spec.backend is ModelBackend.PRETRAINED_YOLO)


def select_demo_model(model_id: str, threshold: float | None = None) -> DemoFallModel:
    specs = {spec.model_id: spec for spec in MODEL_SPECS}
    spec = specs.get(model_id)
    if spec is None:
        raise UnknownModelError(model_id=model_id)
    return DemoFallModel(
        spec=spec,
        threshold=threshold if threshold is not None else spec.default_threshold,
    )


def _score_for_behavior(behavior: ModelBehavior, frame_index: int, time_sec: float) -> float:
    match behavior:
        case ModelBehavior.FALL_RAMP:
            raw_score = 0.2 + (frame_index * 0.13) + min(time_sec * 0.02, 0.1)
            return round(min(1.0, raw_score), 4)
        case ModelBehavior.STABLE:
            return 0.18
        case unreachable:
            assert_never(unreachable)


def _pose_for_score(score: float, frame_shape: tuple[int, int, int]) -> PoseFrame:
    height, width, _channels = frame_shape
    center_x = width // 2
    base_y = int(height * 0.35)
    horizontal_shift = int(width * min(score, 1.0) * 0.18)
    fall_offset = int(height * max(score - 0.55, 0.0) * 0.55)
    return PoseFrame(
        keypoints=(
            PosePoint("head", center_x + horizontal_shift, base_y + fall_offset, 0.92),
            PosePoint("left_shoulder", center_x - 18, base_y + 18 + fall_offset, 0.9),
            PosePoint("right_shoulder", center_x + 18, base_y + 18 + fall_offset, 0.9),
            PosePoint("left_hip", center_x - 14 - horizontal_shift, base_y + 58, 0.88),
            PosePoint("right_hip", center_x + 14 - horizontal_shift, base_y + 58, 0.88),
            PosePoint("left_ankle", center_x - 30 - horizontal_shift, base_y + 94, 0.82),
            PosePoint("right_ankle", center_x + 30 - horizontal_shift, base_y + 94, 0.82),
        )
    )
