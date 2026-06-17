from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pytest
from sklearn.ensemble import RandomForestClassifier

from serving import model as serving_model
from serving.model import FallDetector, ModelInputError, ModelLoadError

REAL_ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "models" / "fall" / "random-forest"


def _metadata(**overrides: object) -> dict[str, object]:
    data = json.loads((REAL_ARTIFACT_DIR / "metadata.json").read_text())
    data.update(overrides)
    return data


def _write_artifact(root: Path, metadata: dict[str, object] | None = None) -> Path:
    artifact_dir = root / "fall" / "random-forest"
    artifact_dir.mkdir(parents=True)
    if metadata is None:
        metadata = _metadata()
    (artifact_dir / "metadata.json").write_text(json.dumps(metadata))

    x = np.vstack([np.zeros((4, 45), dtype=np.float32), np.ones((4, 45), dtype=np.float32)])
    y = np.array([0, 0, 0, 0, 1, 1, 1, 1])
    clf = RandomForestClassifier(n_estimators=4, random_state=42).fit(x, y)
    joblib.dump(clf, artifact_dir / "model.pkl")
    return artifact_dir


def test_real_random_forest_artifact_loads_and_predicts() -> None:
    detector = FallDetector()

    assert detector.metadata.model_type == "random-forest"
    assert detector.metadata.feature_dim == 45
    assert detector.metadata.window == 30
    assert detector.metadata.stride == 5

    prob = detector.predict([0.0] * detector.metadata.feature_dim)

    assert 0.0 <= prob <= 1.0
    assert prob != 0.3  # removed len(window) / 100 dummy probability
    assert detector.metadata_dict()["source"] == "trained"


def test_missing_model_fails_explicitly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    artifact_dir = _write_artifact(tmp_path)
    (artifact_dir / "model.pkl").unlink()
    monkeypatch.setattr(serving_model, "MODELS_DIR", tmp_path)

    with pytest.raises(ModelLoadError, match="missing model.pkl"):
        FallDetector()


def test_missing_metadata_fails_explicitly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    artifact_dir = _write_artifact(tmp_path)
    (artifact_dir / "metadata.json").unlink()
    monkeypatch.setattr(serving_model, "MODELS_DIR", tmp_path)

    with pytest.raises(ModelLoadError, match="missing metadata.json"):
        FallDetector()


def test_invalid_metadata_shape_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write_artifact(tmp_path, _metadata(feature_dim="forty-five"))
    monkeypatch.setattr(serving_model, "MODELS_DIR", tmp_path)

    with pytest.raises(ModelLoadError, match="feature_dim"):
        FallDetector()


def test_unsupported_model_type_fails_explicitly() -> None:
    with pytest.raises(ModelLoadError, match="unsupported model_type"):
        FallDetector(model_type="lstm")


@pytest.mark.parametrize(
    ("field", "value", "match"),
    [
        ("feature_dim", 44, "feature_dim"),
        ("window", 29, "window"),
        ("stride", 10, "stride"),
    ],
)
def test_metadata_contract_mismatch_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    value: object,
    match: str,
) -> None:
    _write_artifact(tmp_path, _metadata(**{field: value}))
    monkeypatch.setattr(serving_model, "MODELS_DIR", tmp_path)

    with pytest.raises(ModelLoadError, match=match):
        FallDetector()


def test_predict_rejects_wrong_window_shape(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_artifact(tmp_path)
    monkeypatch.setattr(serving_model, "MODELS_DIR", tmp_path)
    detector = FallDetector()

    with pytest.raises(ModelInputError, match="window shape"):
        detector.predict([0.0] * 44)


def test_no_fake_empty_window_fallback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write_artifact(tmp_path)
    monkeypatch.setattr(serving_model, "MODELS_DIR", tmp_path)
    detector = FallDetector()

    with pytest.raises(ModelInputError, match="window must be"):
        detector.predict([])


def test_loader_only_import_boundary() -> None:
    source = Path(serving_model.__file__).read_text()

    forbidden_source_refs = [
        "YoloPoseModule",
        "FrameSource",
        "streamlit",
        "training.extract_poses",
        "demo.",
        "ultralytics",
    ]
    assert all(ref not in source for ref in forbidden_source_refs)
    assert "ultralytics" not in sys.modules
    assert "demo.app" not in sys.modules
    assert "training.extract_poses" not in sys.modules


def test_health_exposes_real_metadata() -> None:
    from serving.main import health

    payload = health()

    assert payload["status"] == "ok"
    assert payload["model_type"] == "random-forest"
    assert payload["metadata"]["feature_dim"] == 45
    assert payload["metadata"]["source"] == "trained"
