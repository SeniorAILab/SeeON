from __future__ import annotations

import streamlit as st

from demo.classifier_module import FallClassifierModule
from demo.classifiers import (
    CLASSIFIER_REGISTRY,
    ClassifierParams,
    ClassifierSpec,
    build_classifier,
)
from demo.model_modules import YoloPoseModule
from demo.playback_status import CurrentPlaybackStatus
from demo.seam import ModelModule
from demo.temporal_module import TEMPORAL_MODEL_KEYS


def build_model(
    size: str,
    classifier_key: str | None,
    classifier_params: ClassifierParams,
) -> ModelModule:
    """Compose the per-playback model: pose alone, or pose + fall classifier.

    A fresh model (hence a fresh classifier with cleared state) is built on every
    재생 so replays never inherit a prior run's fall timer.
    """
    pose = YoloPoseModule(size=size, confidence=classifier_params.confidence)
    if classifier_key is None:
        return pose
    if classifier_key in TEMPORAL_MODEL_KEYS:
        from demo.temporal_module import build_temporal_model

        return build_temporal_model(classifier_key, pose)
    classifier = build_classifier(classifier_key, classifier_params)
    return FallClassifierModule(pose_module=pose, classifier=classifier)


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
