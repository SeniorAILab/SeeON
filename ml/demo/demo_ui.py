from __future__ import annotations

import streamlit as st

from demo.classifier_module import FallClassifierModule
from demo.classifiers import (
    CLASSIFIER_REGISTRY,
    ClassifierParams,
    ClassifierSpec,
    build_classifier,
)
from demo.model_modules import POSE_MODEL_SIZE_LABELS, POSE_MODEL_SIZES, YoloPoseModule
from demo.playback_status import CurrentPlaybackStatus
from demo.seam import ModelModule
from demo.temporal_module import TEMPORAL_MODEL_KEYS
from demo.thresholds import default_threshold


def build_model(
    size: str,
    classifier_key: str | None,
    classifier_params: ClassifierParams,
    decision_threshold: float | None = None,
) -> ModelModule:
    """Compose the per-playback model: pose alone, or pose + fall classifier.

    A fresh model (hence a fresh classifier with cleared state) is built on every
    재생 so replays never inherit a prior run's fall timer. ``decision_threshold``
    (the 판정 임계값 slider value) applies to temporal models only.
    """
    pose = YoloPoseModule(size=size, confidence=classifier_params.confidence)
    if classifier_key is None:
        return pose
    if classifier_key in TEMPORAL_MODEL_KEYS:
        from demo.temporal_module import build_temporal_model

        return build_temporal_model(classifier_key, pose, threshold_override=decision_threshold)
    classifier = build_classifier(classifier_key, classifier_params)
    return FallClassifierModule(pose_module=pose, classifier=classifier)


def render_live_controls(
    playing_key: str,
    *,
    start_label: str,
    stop_label: str,
) -> tuple[str, bool, bool]:
    """Render the shared live-inference control rows for a playback page.

    Row 1: YOLO size + overlay toggles. Row 2: start/stop buttons that write
    ``st.session_state[playing_key]``. Returns (size, show_boxes, show_pose).
    """
    size_col, boxes_col, pose_col = st.columns([2, 1, 1])
    size = size_col.selectbox(
        "YOLO26-pose size",
        options=POSE_MODEL_SIZES,
        format_func=lambda s: POSE_MODEL_SIZE_LABELS[s],
        help="사이즈가 클수록 정확도는 높아지고 속도는 느려집니다.",
    )
    show_boxes = boxes_col.checkbox("Bounding boxes", value=True)
    show_pose = pose_col.checkbox("Pose skeleton", value=True)

    play_col, stop_col = st.columns(2)
    if play_col.button(start_label, use_container_width=True, type="primary"):
        st.session_state[playing_key] = True
    if stop_col.button(stop_label, use_container_width=True):
        st.session_state[playing_key] = False
    return size, show_boxes, show_pose


def render_status(
    placeholder: st.delta_generator.DeltaGenerator,
    status: CurrentPlaybackStatus,
    confidence: float,
) -> None:
    body = f"**{status.label}** · {status.detail} · 낙상도 {confidence:.0%} · {status.pose_label}"
    if status.is_fall:
        placeholder.error(f"🔴 {body}")
    else:
        placeholder.success(f"🟢 {body}")


def select_classifier_spec() -> ClassifierSpec:
    """Render the 분류 모델 selectbox and return the selected ClassifierSpec."""
    selected_spec: ClassifierSpec = st.selectbox(
        "분류 모델",
        options=CLASSIFIER_REGISTRY,
        format_func=lambda spec: spec.display_name,
    )
    if not selected_spec.available:
        st.info("규칙기반 분류만 현재 지원됩니다. 선택한 모델은 준비중입니다.")
    return selected_spec


def select_decision_threshold(spec: ClassifierSpec) -> float | None:
    """Render the 판정 임계값 slider for an available temporal model.

    The default is the model's recommended operating point — the NH-measured
    value where one exists (demo.thresholds.NH_RECOMMENDED_THRESHOLDS), else
    the artifact's LE2I operating_threshold. Returns None for non-temporal or
    unavailable specs (no slider rendered).
    """
    if spec.key not in TEMPORAL_MODEL_KEYS or not spec.available:
        return None
    default = default_threshold(spec.key)
    if default is None:
        return None
    return float(
        st.slider(
            "판정 임계값 (fall probability)",
            min_value=0.0,
            max_value=1.0,
            value=round(default, 3),
            step=0.005,
            help=(
                "이 확률 이상이면 낙상으로 판정합니다. 기본값은 모델별 권장 운영점 — "
                "요양원 평가에서 측정된 값이 있으면 그 값, 없으면 LE2I 보정값입니다."
            ),
        )
    )


def select_classifier_params() -> ClassifierParams:
    """Render the 탐지 파라미터 expander and return the selected ClassifierParams."""
    with st.expander("탐지 파라미터", expanded=False):
        col1, col2 = st.columns(2)
        conf = col1.number_input(
            "신뢰도 임계값 (conf)", min_value=0.01, max_value=1.0, value=0.05, step=0.01
        )
        window = col1.number_input("윈도우 (frames)", min_value=1, value=60, step=1)
        stride_param = col2.number_input("스트라이드 (frames)", min_value=1, value=15, step=1)
        sustained = col2.number_input(
            "낙상 판단 지속시간 (초)", min_value=0.1, max_value=30.0, value=2.0, step=0.1
        )
    return ClassifierParams(
        confidence=float(conf),
        window=int(window),
        stride=int(stride_param),
        sustained_down_sec=float(sustained),
    )
