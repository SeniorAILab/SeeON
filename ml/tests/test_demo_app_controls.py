"""Headless control-verification suite for the Streamlit fall-detection demo.

Uses ``streamlit.testing.v1.AppTest`` to exercise every interactive control
in ``demo/app.py`` without a browser.  FALL_DEMO_MODE=operator is forced so
domain/role segmented controls, all domain clip sources, and all classifier
options are exercised.

Play-button (재생) blocking caveat
-----------------------------------
Clicking 재생 and calling ``at.run()`` enters the per-frame video-inference
loop, which runs to clip completion before returning.  The 재생 test therefore
only asserts the button *exists* with the correct label.  The 정지 (stop) test
covers the state machine safely by pre-setting ``live_playing=True`` before
clicking stop: the stop handler writes ``live_playing=False`` before the
loop-entry guard fires, so the run returns immediately without entering the
video loop.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

# Absolute path — AppTest.from_file resolves relative to cwd which can vary.
_APP = str(Path(__file__).resolve().parent.parent / "demo" / "app.py")
_PLAYING_KEY = "live_playing"
_TIMEOUT = 30  # seconds per AppTest run


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
    at = _boot()
    assert not at.exception, f"App raised on initial boot: {at.exception}"


# ---------------------------------------------------------------------------
# 1. file_uploader
# ---------------------------------------------------------------------------


def test_file_uploader_present_with_correct_label() -> None:
    at = _boot()
    assert not at.exception
    matches = [w for w in at.file_uploader if w.label == "영상 추가 업로드"]
    assert len(matches) == 1, (
        f"Expected exactly 1 file_uploader labelled '영상 추가 업로드', "
        f"found {len(matches)}"
    )


# ---------------------------------------------------------------------------
# 2. Domain segmented_control ("도메인") — operator mode only
# ---------------------------------------------------------------------------


def test_domain_segmented_control_present_with_correct_label() -> None:
    at = _boot()
    assert not at.exception
    assert len(at.segmented_control) >= 1, "No segmented_control found"
    assert at.segmented_control[0].label == "도메인", (
        f"First segmented_control label is {at.segmented_control[0].label!r}, "
        "expected '도메인'"
    )


def test_domain_segmented_control_selects_each_option_without_crash() -> None:
    from demo.video_registry import UPLOADS_DOMAIN, list_domains

    domain_options = [*list_domains(), UPLOADS_DOMAIN]
    if not domain_options:
        pytest.skip("No domain folders found on this machine")

    for option in domain_options:
        at = _boot()
        assert not at.exception
        at.segmented_control[0].set_value(option)
        at.run()
        assert not at.exception, (
            f"Exception when selecting domain={option!r}: {at.exception}"
        )


# ---------------------------------------------------------------------------
# 3. Role segmented_control ("종류")
# ---------------------------------------------------------------------------


def test_role_segmented_control_present_after_domain_selection() -> None:
    from demo.video_registry import list_domains

    if not list_domains():
        pytest.skip("No domain folders available on this machine")

    at = _boot()
    assert not at.exception
    # First domain is selected by default; role control is the second
    # segmented_control rendered for non-uploads domains.
    sc_labels = [sc.label for sc in at.segmented_control]
    assert "종류" in sc_labels, (
        f"Role control '종류' not found; segmented_control labels: {sc_labels}"
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
    assert not at.exception
    # Ensure the target domain is selected.
    at.segmented_control[0].set_value(domain)
    at.run()
    assert not at.exception

    role_sc = next((sc for sc in at.segmented_control if sc.label == "종류"), None)
    assert role_sc is not None, "'종류' control absent after domain selection"

    for role in roles:
        role_sc.set_value(role)
        at.run()
        assert not at.exception, (
            f"Exception selecting role={role!r} in domain={domain!r}: {at.exception}"
        )
        # Re-fetch after each run (widget list is refreshed).
        role_sc = next(sc for sc in at.segmented_control if sc.label == "종류")


# ---------------------------------------------------------------------------
# 4. Video selectbox ("영상")
# ---------------------------------------------------------------------------


def test_video_selectbox_present_with_at_least_one_option() -> None:
    at = _boot()
    assert not at.exception
    video_sb = next((sb for sb in at.selectbox if sb.label == "영상"), None)
    assert video_sb is not None, "Video selectbox '영상' not found"
    assert len(video_sb.options) > 0, "Video selectbox has no options"


def test_video_selectbox_default_selection_is_valid() -> None:
    """The first run already has a default video selected; no interaction needed."""
    at = _boot()
    assert not at.exception
    video_sb = next(sb for sb in at.selectbox if sb.label == "영상")
    # A default value is already selected — verify the selectbox renders with one.
    assert video_sb.value is not None, "Video selectbox has no default selection"


# ---------------------------------------------------------------------------
# 5. Classifier selectbox ("분류 모델")
# ---------------------------------------------------------------------------


def test_classifier_selectbox_present() -> None:
    at = _boot()
    assert not at.exception
    clf_sb = next((sb for sb in at.selectbox if sb.label == "분류 모델"), None)
    assert clf_sb is not None, "Classifier selectbox '분류 모델' not found"


def test_classifier_selectbox_all_options_selectable_no_crash() -> None:
    """Selecting '준비중' entries must show an info notice, not raise.

    Uses selectbox.select(raw_spec) — the AppTest API for selectboxes with a
    format_func requires passing the raw Python option value, not the formatted
    display string that select_index() would store.
    """
    from demo.classifiers import CLASSIFIER_REGISTRY

    at = _boot()
    assert not at.exception
    clf_sb = next(sb for sb in at.selectbox if sb.label == "분류 모델")
    assert len(clf_sb.options) > 0

    for spec in CLASSIFIER_REGISTRY:
        clf_sb.select(spec)
        at.run()
        assert not at.exception, (
            f"Exception selecting classifier {spec.key!r}: {at.exception}"
        )
        clf_sb = next(sb for sb in at.selectbox if sb.label == "분류 모델")


# ---------------------------------------------------------------------------
# 6. Decision-threshold slider ("판정 임계값")
# ---------------------------------------------------------------------------


def test_threshold_slider_absent_for_rule_based_default() -> None:
    at = _boot()
    assert not at.exception
    clf_sb = next(sb for sb in at.selectbox if sb.label == "분류 모델")
    # rule_based is index 0 (the default).
    assert clf_sb.index == 0, (
        f"Expected rule_based at index 0, got index {clf_sb.index}"
    )
    assert len(at.slider) == 0, (
        "Threshold slider must not appear for rule_based classifier"
    )


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
    assert not at.exception

    # Use select(raw_spec) — format_func-based selectboxes require the raw value.
    clf_sb = next(sb for sb in at.selectbox if sb.label == "분류 모델")
    clf_sb.select(spec)
    at.run()
    assert not at.exception, f"Exception selecting {spec.key!r}: {at.exception}"

    sliders = at.slider
    assert len(sliders) == 1, (
        f"Expected 1 threshold slider for {spec.key!r}, got {len(sliders)}"
    )
    assert sliders[0].label == "판정 임계값 (낙상 확률)"


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
    clf_sb = next(sb for sb in at.selectbox if sb.label == "분류 모델")
    clf_sb.select(spec)
    at.run()
    assert not at.exception

    target = 0.5
    at.slider[0].set_value(target)
    at.run()
    assert not at.exception
    assert abs(at.slider[0].value - target) < 1e-6, (
        f"Slider value mismatch: expected {target}, got {at.slider[0].value}"
    )


# ---------------------------------------------------------------------------
# 7. Detection-params expander inputs (conf / window / stride / sustained)
# ---------------------------------------------------------------------------


def test_detection_params_all_four_number_inputs_present() -> None:
    at = _boot()
    assert not at.exception
    ni_labels = {ni.label for ni in at.number_input}
    expected = {
        "신뢰도 임계값 (conf)",
        "윈도우 (프레임)",
        "스트라이드 (프레임)",
        "낙상 판단 지속시간 (초)",
    }
    missing = expected - ni_labels
    assert not missing, f"Missing number_input widgets: {missing}"


@pytest.mark.parametrize(
    "label,new_value",
    [
        ("신뢰도 임계값 (conf)", 0.25),
        ("윈도우 (프레임)", 30),
        ("스트라이드 (프레임)", 5),
        ("낙상 판단 지속시간 (초)", 3.0),
    ],
    ids=["conf", "window", "stride", "sustained"],
)
def test_detection_param_number_input_accepts_value(
    label: str, new_value: float
) -> None:
    at = _boot()
    assert not at.exception

    ni = next(n for n in at.number_input if n.label == label)
    ni.set_value(new_value)
    at.run()
    assert not at.exception, (
        f"Exception setting {label!r}={new_value}: {at.exception}"
    )
    result = next(n for n in at.number_input if n.label == label).value
    assert abs(float(result) - new_value) < 1e-6, (
        f"{label!r}: expected {new_value}, got {result}"
    )


# ---------------------------------------------------------------------------
# 8. YOLO size selectbox ("YOLO26-pose 크기")
# ---------------------------------------------------------------------------


def test_yolo_size_selectbox_present() -> None:
    at = _boot()
    assert not at.exception
    yolo_sb = next((sb for sb in at.selectbox if sb.label == "YOLO26-pose 크기"), None)
    assert yolo_sb is not None, "YOLO size selectbox 'YOLO26-pose 크기' not found"


def test_yolo_size_selectbox_selects_each_option_without_crash() -> None:
    """Use select(raw_size_code) — format_func maps "n"→"nano/…" so select_index
    would store the label instead of the key, breaking the next run's format_func
    lookup.  Passing the raw size code avoids this AppTest limitation.
    """
    from demo.model_modules import POSE_MODEL_SIZES

    at = _boot()
    assert not at.exception
    yolo_sb = next(sb for sb in at.selectbox if sb.label == "YOLO26-pose 크기")
    assert len(yolo_sb.options) == len(POSE_MODEL_SIZES)

    for size in POSE_MODEL_SIZES:
        yolo_sb.select(size)
        at.run()
        assert not at.exception, (
            f"Exception selecting YOLO size {size!r}: {at.exception}"
        )
        yolo_sb = next(sb for sb in at.selectbox if sb.label == "YOLO26-pose 크기")


# ---------------------------------------------------------------------------
# 9. Overlay checkboxes: 바운딩 박스 and 포즈 스켈레톤
# ---------------------------------------------------------------------------


def test_bounding_box_checkbox_present_and_defaults_true() -> None:
    at = _boot()
    assert not at.exception
    cb = next((c for c in at.checkbox if c.label == "바운딩 박스"), None)
    assert cb is not None, "바운딩 박스 checkbox not found"
    assert cb.value is True, "바운딩 박스 should default to True"


def test_pose_skeleton_checkbox_present_and_defaults_true() -> None:
    at = _boot()
    assert not at.exception
    cb = next((c for c in at.checkbox if c.label == "포즈 스켈레톤"), None)
    assert cb is not None, "포즈 스켈레톤 checkbox not found"
    assert cb.value is True, "포즈 스켈레톤 should default to True"


@pytest.mark.parametrize(
    "boxes,pose",
    [(False, False), (True, False), (False, True), (True, True)],
    ids=["both-off", "boxes-only", "pose-only", "both-on"],
)
def test_overlay_checkbox_combination_does_not_crash(
    boxes: bool, pose: bool
) -> None:
    at = _boot()
    assert not at.exception

    boxes_cb = next(c for c in at.checkbox if c.label == "바운딩 박스")
    pose_cb = next(c for c in at.checkbox if c.label == "포즈 스켈레톤")

    boxes_cb.set_value(boxes)
    pose_cb.set_value(pose)
    at.run()
    assert not at.exception, (
        f"Crash with 바운딩 박스={boxes}, 포즈 스켈레톤={pose}: {at.exception}"
    )


# ---------------------------------------------------------------------------
# 10. Play / Stop buttons — session_state transitions
# ---------------------------------------------------------------------------


def test_play_button_present_with_correct_label() -> None:
    at = _boot()
    assert not at.exception
    play_btn = next((b for b in at.button if b.label == "재생"), None)
    assert play_btn is not None, "재생 button not found"


def test_stop_button_present_with_correct_label() -> None:
    at = _boot()
    assert not at.exception
    stop_btn = next((b for b in at.button if b.label == "정지"), None)
    assert stop_btn is not None, "정지 button not found"


def test_live_playing_defaults_to_falsy_on_first_run() -> None:
    """SafeSessionState has no .get() method; use direct key access with a guard."""
    at = _boot()
    assert not at.exception
    # live_playing may not be set at all on the first run; treat absence as False.
    try:
        playing = bool(at.session_state[_PLAYING_KEY])
    except (KeyError, AttributeError):
        playing = False
    assert not playing, "live_playing should be falsy before any button interaction"


def test_stop_button_sets_live_playing_false_without_entering_video_loop() -> None:
    """정지 click resets live_playing to False and never enters the video loop.

    Pre-set ``live_playing=True``.  On the next run:
      1. The 정지 handler fires and sets ``live_playing=False``.
      2. The loop-entry guard (``if not session_state.get("live_playing")``)
         evaluates True and returns early — no video clip is loaded.
    The run therefore completes within the normal timeout.
    """
    at = _boot()
    assert not at.exception

    # Simulate the app already being in "playing" state.
    at.session_state[_PLAYING_KEY] = True

    stop_btn = next(b for b in at.button if b.label == "정지")
    stop_btn.click()
    at.run()

    assert not at.exception, f"Exception after clicking 정지: {at.exception}"
    assert at.session_state[_PLAYING_KEY] is False, (
        "Expected live_playing=False after 정지 click, "
        f"got {at.session_state[_PLAYING_KEY]!r}"
    )
