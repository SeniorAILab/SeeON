from __future__ import annotations

from demo.live_view import DetectionLossMonitor


def test_detection_loss_monitor_ignores_zero_pose_before_prior_detection() -> None:
    monitor = DetectionLossMonitor(loss_after_sec=5.0)

    emitted = [monitor.update(pose_count=0, time_sec=t) for t in (0.0, 5.0, 6.0)]

    assert emitted == [False, False, False]


def test_detection_loss_monitor_emits_once_after_five_seconds_without_pose() -> None:
    monitor = DetectionLossMonitor(loss_after_sec=5.0)

    signal = [(1, 0.0), (0, 1.0), (0, 5.9), (0, 6.0), (0, 7.0)]
    emitted = [monitor.update(pose_count=count, time_sec=t) for count, t in signal]

    assert emitted == [False, False, False, True, False]


def test_detection_loss_monitor_resets_only_after_detection_returns() -> None:
    monitor = DetectionLossMonitor(loss_after_sec=5.0)

    signal = [
        (1, 0.0),
        (0, 1.0),
        (0, 6.0),
        (0, 10.0),
        (1, 11.0),
        (0, 12.0),
        (0, 17.0),
    ]
    emitted = [monitor.update(pose_count=count, time_sec=t) for count, t in signal]

    assert emitted == [False, False, True, False, False, False, True]


def test_detection_loss_monitor_treats_pose_return_as_recovered() -> None:
    monitor = DetectionLossMonitor(loss_after_sec=5.0)

    emitted = [
        monitor.update(pose_count=1, time_sec=0.0),
        monitor.update(pose_count=0, time_sec=1.0),
        monitor.update(pose_count=1, time_sec=3.0),
        monitor.update(pose_count=0, time_sec=4.0),
        monitor.update(pose_count=0, time_sec=8.9),
    ]

    assert emitted == [False, False, False, False, False]
