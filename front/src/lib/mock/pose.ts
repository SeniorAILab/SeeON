// Pose-overlay data for the alert detail evidence card.
//
// REAL research data (no patient footage). Captured by
// ml/scratch_capture_le2i_demo_frame.py from the public Le2i Fall Detection
// Dataset (acted falls): a representative "fallen" frame + the COCO-17 pose
// extracted by the project's YOLO-pose pipeline. See le2i-fall-pose.json for
// the exact clip / frame index / provenance.
import fall from "./le2i-fall-pose.json";

export type Keypoint = { x: number; y: number; name: string; score: number };

export const LE2I_FRAME_SRC: string = fall.src;
export const LE2I_PROVENANCE: string = fall.provenance;

// Real extracted COCO-17 keypoints (x,y normalized 0..1 of the frame).
export const FALL_KEYPOINTS: Keypoint[] = fall.keypoints;

// Index pairs into FALL_KEYPOINTS forming the skeleton (COCO-17 topology).
export const SKELETON_SEGMENTS: ReadonlyArray<readonly [number, number]> = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [0, 5], [0, 6],
];

/** Derived metrics shown as the privacy-safe "explanation" of the fall. */
export const FALL_DERIVED_METRICS: { label: string; value: string }[] = fall.metrics;
