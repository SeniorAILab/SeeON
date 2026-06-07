from __future__ import annotations

from demo.video_playback import clamp_seek_time, jump_seek_time, raw_frame_index_for_time


def test_clamps_seek_time_to_available_video_duration() -> None:
    assert clamp_seek_time(value_sec=-3.0, duration_sec=12.0) == 0.0
    assert clamp_seek_time(value_sec=4.44, duration_sec=12.0) == 4.44
    assert clamp_seek_time(value_sec=13.0, duration_sec=12.0) == 12.0


def test_jumps_seek_time_forward_and_backward_within_duration() -> None:
    assert jump_seek_time(current_sec=5.0, delta_sec=-10.0, duration_sec=30.0) == 0.0
    assert jump_seek_time(current_sec=5.0, delta_sec=10.0, duration_sec=30.0) == 15.0
    assert jump_seek_time(current_sec=25.0, delta_sec=10.0, duration_sec=30.0) == 30.0


def test_maps_seek_time_to_raw_frame_index() -> None:
    assert raw_frame_index_for_time(time_sec=-1.0, fps=24.0) == 0
    assert raw_frame_index_for_time(time_sec=2.5, fps=24.0) == 60
    assert raw_frame_index_for_time(time_sec=2.5, fps=0.0) == 2
