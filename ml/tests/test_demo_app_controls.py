"""Headless control-verification suite for the Streamlit fall-detection demo.

Uses ``streamlit.testing.v1.AppTest`` to exercise every interactive control
in ``demo/app.py`` without a browser.  FALL_DEMO_MODE=operator is forced so
domain/role segmented controls, all domain clip sources, and all classifier
options are exercised.

Play-button blocking caveat
---------------------------
Clicking the play button and calling ``at.run()`` enters the per-frame
video-inference loop, which runs to clip completion before returning.  The play
test therefore only asserts the button exists with the correct label.  The stop
test covers the state machine safely by pre-setting ``live_playing=True`` before
clicking stop: the stop handler writes ``live_playing=False`` before the
loop-entry guard fires, so the run returns immediately without entering the
video loop.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from demo_app_control_helpers import (
    assert_no_exception,
    find_labeled,
    labels,
    require_exactly_one_labeled,
    session_state_bool,
)
from streamlit.testing.v1 import AppTest

from demo.ui_labels import (
    BOUNDING_BOXES_LABEL,
    CLASSIFIER_SELECT_LABEL,
    CONFIDENCE_THRESHOLD_LABEL,
    DECISION_THRESHOLD_LABEL,
    DOMAIN_SELECT_LABEL,
    POSE_SKELETON_LABEL,
    ROLE_SELECT_LABEL,
    STRIDE_FRAMES_LABEL,
    SUSTAINED_FALL_SECONDS_LABEL,
    UPLOAD_VIDEO_LABEL,
    VIDEO_SELECT_LABEL,
    WINDOW_FRAMES_LABEL,
    YOLO_SIZE_LABEL,
)

# Absolute path — AppTest.from_file resolves relative to cwd which can vary.
_APP = str(Path(__file__).resolve().parent.parent / "demo" / "app.py")
_PLAYING_KEY = "live_playing"
_TIMEOUT = 30  # seconds per AppTest run

# Action copy stays test-local because app.py and live_camera.py intentionally
# pass different start/stop labels into render_live_controls().
_PLAY_BUTTON_LABEL = "재생"
_STOP_BUTTON_LABEL = "정지"

_DETECTION_PARAM_VALUES = [
    pytest.param(CONFIDENCE_THRESHOLD_LABEL, 0.25, id="conf"),
    pytest.param(WINDOW_FRAMES_LABEL, 30, id="window"),
    pytest.param(STRIDE_FRAMES_LABEL, 5, id="stride"),
    pytest.param(SUSTAINED_FALL_SECONDS_LABEL, 3.0, id="sustained"),
]

_OVERLAY_VALUES = [
    pytest.param(False, False, id="both-off"),
    pytest.param(True, False, id="boxes-only"),
    pytest.param(False, True, id="pose-only"),
    pytest.param(True, True, id="both-on"),
]


@pytest.fixture(autouse=True)
def _operator_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force operator mode for every test in this module."""
    monkeypatch.setenv("FALL_DEMO_MODE", "operator")


def _at() -> AppTest:
    """Return a fresh (not yet run) AppTest instance."""
    return AppTest.from_file(_APP, default_timeout=_TIMEOUT)


def _boot() -> AppTest:
    """Return an AppTest that has completed its first run (no interactions)."""
    at = _at()
    at.run()
    return at


# ---------------------------------------------------------------------------
# 0. Baseline smoke
# ---------------------------------------------------------------------------


def test_app_boots_without_exception() -> None:
    assert_no_exception(_boot(), "Initial boot")


# ---------------------------------------------------------------------------
# 1. file_uploader
# ---------------------------------------------------------------------------


def test_file_uploader_present_with_correct_label() -> None:
    at = _boot()
    assert_no_exception(at)
    require_exactly_one_labeled(at.file_uploader, UPLOAD_VIDEO_LABEL, "file_uploader")


# ---------------------------------------------------------------------------
# 2. Domain segmented_control — operator mode only
# ---------------------------------------------------------------------------


def test_domain_segmented_control_present_with_correct_label() -> None:
    at = _boot()
    assert_no_exception(at)
    assert len(at.segmented_control) >= 1, "No segmented_control found"
    assert at.segmented_control[0].label == DOMAIN_SELECT_LABEL, (
        f"First segmented_control label is {at.segmented_control[0].label!r}, "
        f"expected {DOMAIN_SELECT_LABEL!r}"
    )


def test_domain_segmented_control_selects_each_option_without_crash() -> None:
    from demo.video_registry import UPLOADS_DOMAIN, list_domains

    domain_options = [*list_domains(), UPLOADS_DOMAIN]
    if not domain_options:
        pytest.skip("No domain folders found on this machine")

    for option in domain_options:
        at = _boot()
        assert_no_exception(at)
        at.segmented_control[0].set_value(option)
        at.run()
        assert_no_exception(at, f"Selecting domain={option!r}")


# ---------------------------------------------------------------------------
# 3. Role segmented_control
# ---------------------------------------------------------------------------


def test_role_segmented_control_present_after_domain_selection() -> None:
    from demo.video_registry import list_domains

    if not list_domains():
        pytest.skip("No domain folders available on this machine")

    at = _boot()
    assert_no_exception(at)
    assert ROLE_SELECT_LABEL in labels(at.segmented_control), (
        f"Role control not found; segmented_control labels: {labels(at.segmented_control)}"
    )


def test_role_segmented_control_selects_each_option_without_crash() -> None:
    from demo.video_registry import list_domains, list_roles_for_domain

    domains = list_domains()
    if not domains:
        pytest.skip("No domain folders available on this machine")

    # Prefer a domain that has more than one role to exercise both branches.
    domain = next(
        (d for d in domains if len(list_roles_for_domain(d)) > 1), domains[0]
    )
    roles = list_roles_for_domain(domain)

    at = _boot()
    assert_no_exception(at)
    at.segmented_control[0].set_value(domain)
    at.run()
    assert_no_exception(at, f"Selecting domain={domain!r}")

    role_sc = find_labeled(at.segmented_control, ROLE_SELECT_LABEL, "segmented_control")
    for role in roles:
        role_sc.set_value(role)
        at.run()
        assert_no_exception(at, f"Selecting role={role!r} in domain={domain!r}")
        role_sc = find_labeled(at.segmented_control, ROLE_SELECT_LABEL, "segmented_control")


# ---------------------------------------------------------------------------
# 4. Video selectbox
# ---------------------------------------------------------------------------


def test_video_selectbox_present_with_at_least_one_option() -> None:
    at = _boot()
    assert_no_exception(at)
    video_sb = find_labeled(at.selectbox, VIDEO_SELECT_LABEL, "selectbox")
    assert len(video_sb.options) > 0, "Video selectbox has no options"


def test_video_selectbox_default_selection_is_valid() -> None:
    """The first run already has a default video selected; no interaction needed."""
    at = _boot()
    assert_no_exception(at)
    video_sb = find_labeled(at.selectbox, VIDEO_SELECT_LABEL, "selectbox")
    assert video_sb.value is not None, "Video selectbox has no default selection"


# ---------------------------------------------------------------------------
# 5. Classifier selectbox
# ---------------------------------------------------------------------------


def test_classifier_selectbox_present() -> None:
    at = _boot()
    assert_no_exception(at)
    find_labeled(at.selectbox, CLASSIFIER_SELECT_LABEL, "selectbox")


def test_classifier_selectbox_all_options_selectable_no_crash() -> None:
    """Selecting pending entries must show an info notice, not raise.

    Uses selectbox.select(raw_spec) — the AppTest API for selectboxes with a
    format_func requires passing the raw Python option value, not the formatted
    display string that select_index() would store.
    """
    from demo.classifiers import CLASSIFIER_REGISTRY

    at = _boot()
    assert_no_exception(at)
    clf_sb = find_labeled(at.selectbox, CLASSIFIER_SELECT_LABEL, "selectbox")
    assert len(clf_sb.options) > 0

    for spec in CLASSIFIER_REGISTRY:
        clf_sb.select(spec)
        at.run()
        assert_no_exception(at, f"Selecting classifier {spec.key!r}")
        clf_sb = find_labeled(at.selectbox, CLASSIFIER_SELECT_LABEL, "selectbox")


# ---------------------------------------------------------------------------
# 6. Decision-threshold slider
# ---------------------------------------------------------------------------


def test_threshold_slider_absent_for_rule_based_default() -> None:
    at = _boot()
    assert_no_exception(at)
    clf_sb = find_labeled(at.selectbox, CLASSIFIER_SELECT_LABEL, "selectbox")
    # rule_based is index 0 (the default).
    assert clf_sb.index == 0, f"Expected rule_based at index 0, got {clf_sb.index}"
    assert len(at.slider) == 0, "Threshold slider must not appear for rule_based classifier"


def test_threshold_slider_present_for_available_temporal_model() -> None:
    from demo.classifiers import CLASSIFIER_REGISTRY

    temporal_available = [
        spec
        for spec in CLASSIFIER_REGISTRY
        if spec.key != "rule_based" and spec.available
    ]
    if not temporal_available:
        pytest.skip("No available temporal models on this machine")

    spec = temporal_available[0]
    at = _boot()
    assert_no_exception(at)

    # Use select(raw_spec) — format_func-based selectboxes require the raw value.
    clf_sb = find_labeled(at.selectbox, CLASSIFIER_SELECT_LABEL, "selectbox")
    clf_sb.select(spec)
    at.run()
    assert_no_exception(at, f"Selecting {spec.key!r}")

    sliders = at.slider
    assert len(sliders) == 1, f"Expected 1 threshold slider for {spec.key!r}"
    assert sliders[0].label == DECISION_THRESHOLD_LABEL


def test_threshold_slider_accepts_custom_value() -> None:
    from demo.classifiers import CLASSIFIER_REGISTRY

    temporal_available = [
        spec
        for spec in CLASSIFIER_REGISTRY
        if spec.key != "rule_based" and spec.available
    ]
    if not temporal_available:
        pytest.skip("No available temporal models on this machine")

    spec = temporal_available[0]
    at = _boot()
    clf_sb = find_labeled(at.selectbox, CLASSIFIER_SELECT_LABEL, "selectbox")
    clf_sb.select(spec)
    at.run()
    assert_no_exception(at, f"Selecting {spec.key!r}")

    target = 0.5
    at.slider[0].set_value(target)
    at.run()
    assert_no_exception(at, "Setting threshold slider")
    assert abs(at.slider[0].value - target) < 1e-6, (
        f"Slider value mismatch: expected {target}, got {at.slider[0].value}"
    )


# ---------------------------------------------------------------------------
# 7. Detection-params expander inputs
# ---------------------------------------------------------------------------


def test_detection_params_all_four_number_inputs_present() -> None:
    at = _boot()
    assert_no_exception(at)
    expected = {
        CONFIDENCE_THRESHOLD_LABEL,
        WINDOW_FRAMES_LABEL,
        STRIDE_FRAMES_LABEL,
        SUSTAINED_FALL_SECONDS_LABEL,
    }
    assert expected <= set(labels(at.number_input)), (
        f"Missing number_input widgets: {expected - set(labels(at.number_input))}"
    )


@pytest.mark.parametrize("label,new_value", _DETECTION_PARAM_VALUES)
def test_detection_param_number_input_accepts_value(
    label: str, new_value: float
) -> None:
    at = _boot()
    assert_no_exception(at)

    ni = find_labeled(at.number_input, label, "number_input")
    ni.set_value(new_value)
    at.run()
    assert_no_exception(at, f"Setting {label!r}={new_value}")
    result = find_labeled(at.number_input, label, "number_input").value
    assert abs(float(result) - new_value) < 1e-6, (
        f"{label!r}: expected {new_value}, got {result}"
    )


# ---------------------------------------------------------------------------
# 8. YOLO size selectbox
# ---------------------------------------------------------------------------


def test_yolo_size_selectbox_present() -> None:
    at = _boot()
    assert_no_exception(at)
    find_labeled(at.selectbox, YOLO_SIZE_LABEL, "selectbox")


def test_yolo_size_selectbox_selects_each_option_without_crash() -> None:
    """Use select(raw_size_code) — format_func maps size keys to display labels.

    Passing the raw size code avoids an AppTest limitation where select_index()
    would store the formatted label instead of the key expected by format_func.
    """
    from demo.model_modules import POSE_MODEL_SIZES

    at = _boot()
    assert_no_exception(at)
    yolo_sb = find_labeled(at.selectbox, YOLO_SIZE_LABEL, "selectbox")
    assert len(yolo_sb.options) == len(POSE_MODEL_SIZES)

    for size in POSE_MODEL_SIZES:
        yolo_sb.select(size)
        at.run()
        assert_no_exception(at, f"Selecting YOLO size {size!r}")
        yolo_sb = find_labeled(at.selectbox, YOLO_SIZE_LABEL, "selectbox")


# ---------------------------------------------------------------------------
# 9. Overlay checkboxes
# ---------------------------------------------------------------------------


def test_bounding_box_checkbox_present_and_defaults_true() -> None:
    at = _boot()
    assert_no_exception(at)
    cb = find_labeled(at.checkbox, BOUNDING_BOXES_LABEL, "checkbox")
    assert cb.value is True, f"{BOUNDING_BOXES_LABEL} should default to True"


def test_pose_skeleton_checkbox_present_and_defaults_true() -> None:
    at = _boot()
    assert_no_exception(at)
    cb = find_labeled(at.checkbox, POSE_SKELETON_LABEL, "checkbox")
    assert cb.value is True, f"{POSE_SKELETON_LABEL} should default to True"


@pytest.mark.parametrize("boxes,pose", _OVERLAY_VALUES)
def test_overlay_checkbox_combination_does_not_crash(
    boxes: bool, pose: bool
) -> None:
    at = _boot()
    assert_no_exception(at)

    boxes_cb = find_labeled(at.checkbox, BOUNDING_BOXES_LABEL, "checkbox")
    pose_cb = find_labeled(at.checkbox, POSE_SKELETON_LABEL, "checkbox")

    boxes_cb.set_value(boxes)
    pose_cb.set_value(pose)
    at.run()
    assert_no_exception(
        at, f"Overlay combination {BOUNDING_BOXES_LABEL}={boxes}, {POSE_SKELETON_LABEL}={pose}"
    )


# ---------------------------------------------------------------------------
# 10. Play / Stop buttons — session_state transitions
# ---------------------------------------------------------------------------


def test_play_button_present_with_correct_label() -> None:
    at = _boot()
    assert_no_exception(at)
    find_labeled(at.button, _PLAY_BUTTON_LABEL, "button")


def test_stop_button_present_with_correct_label() -> None:
    at = _boot()
    assert_no_exception(at)
    find_labeled(at.button, _STOP_BUTTON_LABEL, "button")


def test_live_playing_defaults_to_falsy_on_first_run() -> None:
    at = _boot()
    assert_no_exception(at)
    assert not session_state_bool(at, _PLAYING_KEY), (
        f"{_PLAYING_KEY} should be falsy before any button interaction"
    )


def test_stop_button_sets_live_playing_false_without_entering_video_loop() -> None:
    """Stop click resets state and never enters the video loop.

    Pre-set ``live_playing=True``. On the next run, the stop handler fires,
    writes ``live_playing=False``, and the loop-entry guard returns early.
    """
    at = _boot()
    assert_no_exception(at)

    at.session_state[_PLAYING_KEY] = True

    stop_btn = find_labeled(at.button, _STOP_BUTTON_LABEL, "button")
    stop_btn.click()
    at.run()

    assert_no_exception(at, "Clicking stop")
    assert at.session_state[_PLAYING_KEY] is False, (
        f"Expected {_PLAYING_KEY}=False after stop click, "
        f"got {at.session_state[_PLAYING_KEY]!r}"
    )
