"""Evaluation pipeline — Step 5 of the Le2i temporal fall-classifier PoC.

CLI::

    python -m training.evaluate [--pose-dir P] [--annotation-dir P]
                                [--gold-clips-dir D]

Reconstructs the identical held-out test split used during training, runs
inference for every artifact found under ``config.ARTIFACT_BASE``, computes
metrics at three operating points, prints a Markdown comparison table, writes
``config.EVAL_DIR/le2i-poc-results.csv``, and persists the chosen operating
threshold back into each model's ``metadata.json``.

Operating-point definitions
----------------------------
``fixed_0.5``
    Hard threshold at 0.5 — the default before evaluation calibrates it.
``optimal_f1``
    Threshold from the precision-recall curve that maximises fall-class F1.
``recall_90``
    The **highest** threshold where fall recall is still >= 0.90 (most
    precise operating point that satisfies the 90 % recall target).  Falls
    back to ``optimal_f1`` when 90 % recall is not achievable.

The ``recall_90`` threshold is written back into ``metadata.json``; this is
what the live demo temporal adapter reads when it classifies a window.

Gold-8 secondary evaluation (optional)
---------------------------------------
Only runs when ``--gold-clips-dir`` is provided **and** the path exists.
Drives ``YoloPoseRunner.predict_full`` with the same
``normalize_person_keypoints`` + confidence gating as ``extract_poses`` to
avoid preprocessing skew.  If the directory is absent or YOLO weights are
missing the run continues cleanly with a log warning.
"""

from __future__ import annotations

import argparse
import csv
import logging
from pathlib import Path

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
)

from training.config import (
    ARTIFACT_BASE,
    CONF_THRESHOLD,
    EVAL_DIR,
    GOLD8_POS_WINDOW_FRACTION,
    POSE_CACHE_DIR,
    RAW_DATA_DIR,
    TEST_SPLIT_FRACTION,
)
from training.data.le2i import load_clip_metas
from training.data.windowing import WindowDataset
from training.metadata import ModelMetadata, artifact_dir, load_metadata, save_metadata

log = logging.getLogger(__name__)

_ALL_MODEL_KEYS: tuple[str, ...] = ("rf", "lstm", "transformer")


# ---------------------------------------------------------------------------
# Threshold selection helpers
# ---------------------------------------------------------------------------


def _find_optimal_f1_threshold(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """Return the threshold from precision_recall_curve that maximises fall-class F1."""
    precision, recall, thresholds = precision_recall_curve(y_true, y_prob)
    if len(thresholds) == 0:
        return 0.5
    with np.errstate(invalid="ignore"):
        f1s = (
            2.0 * precision[:-1] * recall[:-1] / (precision[:-1] + recall[:-1] + 1e-9)
        )
    return float(thresholds[int(np.argmax(f1s))])


def _find_recall90_threshold(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    fallback: float,
    *,
    target_recall: float = 0.90,
) -> float:
    """Return the highest threshold where fall recall >= *target_recall*.

    Lower threshold → higher recall, so the highest threshold that still
    achieves the recall target is the most precise operating point that
    satisfies the safety constraint.  Returns *fallback* when no threshold
    in the curve reaches *target_recall*.
    """
    _, recall, thresholds = precision_recall_curve(y_true, y_prob)
    if len(thresholds) == 0:
        return fallback
    valid = recall[:-1] >= target_recall  # exclude sentinel (recall=0, no threshold)
    if not valid.any():
        log.warning(
            "Recall %.2f unreachable on test set — falling back to optimal-F1 threshold %.4f",
            target_recall,
            fallback,
        )
        return fallback
    return float(thresholds[valid].max())


# ---------------------------------------------------------------------------
# Per-threshold metrics
# ---------------------------------------------------------------------------


def _metrics_at(
    y_true: np.ndarray, y_prob: np.ndarray, threshold: float
) -> dict[str, float]:
    """Compute fall-class F1, Recall, Precision, and AUC-PR at *threshold*."""
    y_pred = (y_prob >= threshold).astype(int)
    return {
        "threshold": threshold,
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "auc_pr": float(average_precision_score(y_true, y_prob)),
    }


# ---------------------------------------------------------------------------
# Model loader
# ---------------------------------------------------------------------------


def _load_model(key: str, out_dir: Path) -> object:
    """Load a saved fall-classifier artifact from *out_dir*."""
    if key == "rf":
        from training.models.rf import RandomForestFallClassifier

        return RandomForestFallClassifier.load(out_dir)
    if key == "lstm":
        from training.models.lstm import LstmFallClassifier

        return LstmFallClassifier.load(out_dir)
    if key == "transformer":
        from training.models.transformer import TransformerFallClassifier

        return TransformerFallClassifier.load(out_dir)
    raise ValueError(f"Unknown model key: {key!r}")


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------


def _print_markdown_table(rows: list[dict[str, object]]) -> None:
    header = "| model | op_point | threshold | f1 | recall | precision | auc_pr |"
    sep = "|-------|----------|-----------|-----|--------|-----------|--------|"
    print(header)
    print(sep)
    for r in rows:
        print(
            f"| {r['model']} | {r['op_point']} | {r['threshold']:.4f}"
            f" | {r['f1']:.4f} | {r['recall']:.4f}"
            f" | {r['precision']:.4f} | {r['auc_pr']:.4f} |"
        )


def _write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def run(
    pose_dir: Path = POSE_CACHE_DIR,
    annotation_dir: Path = RAW_DATA_DIR,
    gold_clips_dir: Path | None = None,
) -> None:
    """Evaluate all saved artifacts and update their operating thresholds.

    Parameters
    ----------
    pose_dir:
        Pose cache directory (same as used in training).
    annotation_dir:
        Le2i annotation root (same as used in training).
    gold_clips_dir:
        Optional directory of gold-8 video clips for secondary evaluation.
        Skipped when ``None`` or path does not exist.
    """
    # === 단계 1: 훈련과 동일한 결정적 분할 재구성 — 동일 테스트 셋 보장 ===
    # --- Reconstruct identical test split ---
    metas = load_clip_metas(pose_dir, annotation_dir)

    ds_seq = WindowDataset(metas, mode="sequence")
    ds_feat = WindowDataset(metas, mode="features")
    _, test_seq = ds_seq.split(test_fraction=TEST_SPLIT_FRACTION)
    _, test_feat = ds_feat.split(test_fraction=TEST_SPLIT_FRACTION)

    X_test_seq, y_test_seq = test_seq.to_arrays()
    X_test_feat, y_test_feat = test_feat.to_arrays()
    print(
        f"[evaluate] test windows: seq={len(y_test_seq)} feat={len(y_test_feat)}"
        f"  pos_seq={int(y_test_seq.sum())} pos_feat={int(y_test_feat.sum())}"
    )

    # === 단계 2: 모델별 예측 확률 산출 ===
    # --- Evaluate each artifact ---
    rows: list[dict[str, object]] = []
    chosen_thresholds: dict[str, float] = {}

    for key in _ALL_MODEL_KEYS:
        out_dir = artifact_dir(key, ARTIFACT_BASE)
        model_file = out_dir / ("model.pkl" if key == "rf" else "model.pt")
        if not out_dir.exists() or not model_file.exists():
            log.info("No artifact for %r (expected %s) — skipping", key, out_dir)
            continue

        log.info("Evaluating %r from %s", key, out_dir)
        clf = _load_model(key, out_dir)
        meta = load_metadata(out_dir)

        X_test = X_test_feat if meta.framework == "sklearn" else X_test_seq
        y_test = y_test_feat if meta.framework == "sklearn" else y_test_seq

        y_prob: np.ndarray = clf.predict_proba(X_test)[:, 1]  # type: ignore[union-attr]

        opt_thr = _find_optimal_f1_threshold(y_test, y_prob)
        recall90_thr = _find_recall90_threshold(y_test, y_prob, fallback=opt_thr)

        # === 단계 3: 3개 운영점(고정 0.5 / 최적 F1 / recall_90) 지표 계산 ===
        for op_name, thr in [
            ("fixed_0.5", 0.5),
            ("optimal_f1", opt_thr),
            ("recall_90", recall90_thr),
        ]:
            m = _metrics_at(y_test, y_prob, thr)
            rows.append(
                {
                    "model": key,
                    "op_point": op_name,
                    "threshold": round(m["threshold"], 4),
                    "f1": round(m["f1"], 4),
                    "recall": round(m["recall"], 4),
                    "precision": round(m["precision"], 4),
                    "auc_pr": round(m["auc_pr"], 4),
                }
            )

        # recall_90 is the persisted threshold (fallback=optimal_f1 already handled)
        chosen_thresholds[key] = recall90_thr

    # --- Print Markdown comparison table ---
    _print_markdown_table(rows)

    # --- Write CSV ---
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = EVAL_DIR / "le2i-poc-results.csv"
    _write_csv(csv_path, rows)
    print(f"[evaluate] results written to {csv_path}")

    # === 단계 4: recall_90 임계값을 metadata.json에 영속화 — train↔serve 스큐 방지 ===
    # --- Persist chosen operating thresholds back into metadata.json (CRITICAL skew-closer) ---
    for key, thr in chosen_thresholds.items():
        out_dir = artifact_dir(key, ARTIFACT_BASE)
        meta = load_metadata(out_dir)
        updated = ModelMetadata(
            model_type=meta.model_type,
            framework=meta.framework,
            window=meta.window,
            stride=meta.stride,
            input_shape=meta.input_shape,
            feature_dim=meta.feature_dim,
            seed=meta.seed,
            classes=meta.classes,
            operating_threshold=thr,
        )
        save_metadata(out_dir, updated)
        log.info("Updated %r operating_threshold → %.4f in %s", key, thr, out_dir)
        print(f"[evaluate] {key!r} operating_threshold updated → {thr:.4f}")

    # --- Optional gold-8 secondary evaluation ---
    if gold_clips_dir is None or not gold_clips_dir.exists():
        log.info(
            "gold-8 evaluation skipped: --gold-clips-dir %s",
            "not provided" if gold_clips_dir is None else f"not found ({gold_clips_dir})",
        )
        return

    _run_gold8_eval(gold_clips_dir, chosen_thresholds)


# ---------------------------------------------------------------------------
# Gold-8 secondary evaluation
# ---------------------------------------------------------------------------


def _run_gold8_eval(
    gold_clips_dir: Path,
    chosen_thresholds: dict[str, float],
) -> None:
    """Secondary evaluation on gold-8 clips using YOLO pose inference.

    Uses the same ``normalize_person_keypoints`` + confidence gating as
    ``training.extract_poses`` to avoid preprocessing skew between training
    and inference.
    """
    from training.config import KPT_VECTOR_DIM, N_KEYPOINTS
    from training.data.features import extract_window_features
    from training.extract_poses import normalize_person_keypoints

    try:
        import cv2
    except ImportError:
        log.warning("gold-8 eval: cv2 not available — skipping")
        return

    try:
        from demo.model_modules import pose_weight_path
        from demo.yolo_runtime import YoloPoseRunner

        weight_path = pose_weight_path("n")
        runner = YoloPoseRunner(model_path=str(weight_path))
    except Exception as exc:  # noqa: BLE001
        log.warning("gold-8 eval: could not initialise YOLO runner (%s) — skipping", exc)
        return

    video_files = sorted(gold_clips_dir.glob("*.avi")) + sorted(gold_clips_dir.glob("*.mp4"))
    if not video_files:
        log.warning("gold-8 eval: no .avi/.mp4 clips found in %s", gold_clips_dir)
        return

    print(f"[evaluate/gold8] {len(video_files)} clip(s) in {gold_clips_dir}")

    # === 단계 1: 클립별 포즈 캐시 — YOLO 추론을 모델 루프 밖에서 1회만 실행 ===
    # All gold-8 clips are human-verified FALL clips (gold_label = 1 for every clip).
    # Source: docs/exec-plan/active/pose-classifier-fall-demo/gold-labels.md
    #         — all 8 entries have a fall onset.
    GOLD_LABEL = 1

    clip_cache: dict[str, dict] = {}  # clip_id → {kpts_arr, no_person_frac}
    for vid_path in video_files:
        cap = cv2.VideoCapture(str(vid_path))
        if not cap.isOpened():
            log.warning("gold-8 eval: cannot open %s", vid_path)
            continue
        frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        frames: list[np.ndarray] = []
        n_no_person = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            kpts = normalize_person_keypoints(
                runner.predict_full(frame)[0], frame_w, frame_h, CONF_THRESHOLD
            )
            if not kpts.any():
                n_no_person += 1
            frames.append(kpts)
        cap.release()

        if not frames:
            continue

        n_frames = len(frames)
        kpts_arr = np.stack(frames, axis=0).astype(np.float32)
        no_person_frac = round(n_no_person / n_frames, 4)
        clip_cache[vid_path.stem] = {
            "kpts_arr": kpts_arr,
            "no_person_frac": no_person_frac,
        }

    if not clip_cache:
        log.warning("gold-8 eval: no clips could be decoded — skipping")
        return

    # === 단계 2: 모델별 윈도우 추론 — 캐시된 포즈 배열 재사용, 모델별 window/stride 적용 ===
    csv_rows: list[dict[str, object]] = []

    for key in _ALL_MODEL_KEYS:
        out_dir = artifact_dir(key, ARTIFACT_BASE)
        model_file = out_dir / ("model.pkl" if key == "rf" else "model.pt")
        if not model_file.exists():
            continue

        clf = _load_model(key, out_dir)
        meta = load_metadata(out_dir)
        thr = chosen_thresholds.get(key, meta.operating_threshold)

        n_pred_fall = 0
        n_total = len(clip_cache)

        for clip_id, cached in clip_cache.items():
            kpts_arr = cached["kpts_arr"]
            no_person_frac = cached["no_person_frac"]
            n = len(kpts_arr)

            # Per-model window geometry (MINOR-6): use meta.window / meta.stride
            win = meta.window
            stride = meta.stride
            starts = list(range(0, n - win + 1, stride)) if n >= win else [0]

            n_pos_windows = 0
            n_total_windows = 0

            for start in starts:
                window = np.zeros((win, N_KEYPOINTS, 3), dtype=np.float32)
                end = min(start + win, n)
                window[: end - start] = kpts_arr[start:end]

                if meta.framework == "sklearn":
                    x = extract_window_features(window)[np.newaxis]
                else:
                    x = window.reshape(1, win, KPT_VECTOR_DIM)

                prob_fall = float(clf.predict_proba(x)[0, 1])  # type: ignore[union-attr]
                n_total_windows += 1
                if prob_fall >= thr:
                    n_pos_windows += 1

            pos_window_frac = (
                round(n_pos_windows / n_total_windows, 4) if n_total_windows > 0 else 0.0
            )
            predicted_label = 1 if pos_window_frac >= GOLD8_POS_WINDOW_FRACTION else 0
            correct = int(predicted_label == GOLD_LABEL)
            n_pred_fall += predicted_label

            csv_rows.append(
                {
                    "model": key,
                    "clip_id": clip_id,
                    "gold_label": GOLD_LABEL,
                    "predicted_label": predicted_label,
                    "pos_window_frac": pos_window_frac,
                    "no_person_frac": no_person_frac,
                    "correct": correct,
                }
            )

        print(
            f"[evaluate/gold8] {key!r}: {n_pred_fall}/{n_total}"
            f" clips predicted fall (threshold={thr:.4f}) — ADR-009 rule-based floor: 0/8"
        )

    # === 단계 3: CSV 기록 — gold8-poc-results.csv에 클립별 결과 저장 ===
    if csv_rows:
        EVAL_DIR.mkdir(parents=True, exist_ok=True)
        gold_csv_path = EVAL_DIR / "gold8-poc-results.csv"
        _write_csv(gold_csv_path, csv_rows)
        print(f"[evaluate/gold8] results written to {gold_csv_path}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate saved fall-classifier artifacts on the Le2i test split.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--pose-dir", type=Path, default=POSE_CACHE_DIR)
    parser.add_argument("--annotation-dir", type=Path, default=RAW_DATA_DIR)
    parser.add_argument(
        "--gold-clips-dir",
        type=Path,
        default=None,
        help="Optional directory of gold-8 video clips for secondary evaluation.",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    run(
        pose_dir=args.pose_dir,
        annotation_dir=args.annotation_dir,
        gold_clips_dir=args.gold_clips_dir,
    )


if __name__ == "__main__":
    main()
