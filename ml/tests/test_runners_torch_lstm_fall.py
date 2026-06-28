from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import torch
import yaml

from worker.runners.torch_lstm_fall import LstmFallRunner, ModelLoadError


def _write_lstm_artifact(path: Path) -> Path:
    from worker.runners.torch_lstm_fall import build_lstm_module

    path.mkdir()
    arch = {"hidden": 4, "layers": 1, "dropout": 0.0}
    module = build_lstm_module(hidden=4, layers=1, dropout=0.0)
    with torch.no_grad():
        module.fc.bias[0] = -5.0
        module.fc.bias[1] = 5.0
    torch.save(module.state_dict(), path / "model.pt")
    (path / "arch.json").write_text(json.dumps(arch), encoding="utf-8")
    (path / "metadata.yaml").write_text(
        yaml.safe_dump(
            {
                "type": "lstm",
                "framework": "pytorch",
                "mode": "sequence",
                "artifact_dir": str(path),
                "weights": "model.pt",
                "architecture": "arch.json",
                "metadata": "metadata.yaml",
                "window": 3,
                "stride": 1,
                "input_shape": [3, 51],
                "operating_threshold": 0.5,
            }
        ),
        encoding="utf-8",
    )
    return path


def test_lstm_runner_loads_generated_artifact_and_predicts_probability(tmp_path: Path) -> None:
    runner = LstmFallRunner.from_artifact_dir(_write_lstm_artifact(tmp_path / "lstm"))
    sequence = np.zeros((3, 51), dtype=np.float32)

    probability = runner.predict(sequence)

    assert 0.99 <= probability <= 1.0
    assert runner.metadata.window == 3
    assert runner.metadata.mode == "sequence"


def test_lstm_runner_rejects_wrong_input_shape(tmp_path: Path) -> None:
    runner = LstmFallRunner.from_artifact_dir(_write_lstm_artifact(tmp_path / "lstm"))

    with pytest.raises(ModelLoadError, match="input shape"):
        runner.predict(np.zeros((45,), dtype=np.float32))
