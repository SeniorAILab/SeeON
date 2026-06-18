// Pose-overlay data for the alert detail evidence card.
//
// Image provenance (NEVER rendered in the UI — see front/README.md):
//   Dataset:  Le2i Fall Detection Dataset (public academic dataset)
//   Use:      single representative fall frame, public dataset, for product
//             demonstration of pose-based detection. No nursing-home footage.
//   Asset:    /le2i/fall-frame-01.svg  (representative synthetic frame)
//
// The skeleton is a normalized COCO-17 keypoint set (x,y in 0..1 of the frame)
// depicting a person in a fallen/lying posture, plus the limb segments to draw.
// /le2i/fall-frame-01.svg is a REPRESENTATIVE synthetic top-down camera frame
// (NOT patient footage). Replace with a licensed public Le2i Fall Detection
// Dataset frame for production (record source/license in front/README.md).
export const LE2I_FRAME_SRC = "/le2i/fall-frame-01.svg";

export const LE2I_PROVENANCE =
  "Representative synthetic top-down camera frame (no patient footage). Replace with a licensed public Le2i Fall Detection Dataset frame for production.";

export type Keypoint = { x: number; y: number; name: string; score: number };

// COCO-17 order. Coordinates describe a person lying on the floor (low torso,
// horizontal spine) to match a fall frame.
export const FALL_KEYPOINTS: Keypoint[] = [
  { name: "nose", x: 0.30, y: 0.70, score: 0.91 },
  { name: "left_eye", x: 0.31, y: 0.68, score: 0.88 },
  { name: "right_eye", x: 0.29, y: 0.69, score: 0.87 },
  { name: "left_ear", x: 0.33, y: 0.69, score: 0.80 },
  { name: "right_ear", x: 0.28, y: 0.71, score: 0.79 },
  { name: "left_shoulder", x: 0.40, y: 0.64, score: 0.93 },
  { name: "right_shoulder", x: 0.40, y: 0.74, score: 0.92 },
  { name: "left_elbow", x: 0.50, y: 0.60, score: 0.85 },
  { name: "right_elbow", x: 0.50, y: 0.78, score: 0.84 },
  { name: "left_wrist", x: 0.58, y: 0.57, score: 0.78 },
  { name: "right_wrist", x: 0.58, y: 0.81, score: 0.77 },
  { name: "left_hip", x: 0.60, y: 0.66, score: 0.90 },
  { name: "right_hip", x: 0.60, y: 0.73, score: 0.89 },
  { name: "left_knee", x: 0.72, y: 0.64, score: 0.83 },
  { name: "right_knee", x: 0.72, y: 0.75, score: 0.82 },
  { name: "left_ankle", x: 0.83, y: 0.63, score: 0.74 },
  { name: "right_ankle", x: 0.83, y: 0.76, score: 0.73 },
];

// Index pairs into FALL_KEYPOINTS forming the skeleton.
export const SKELETON_SEGMENTS: ReadonlyArray<readonly [number, number]> = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [0, 5], [0, 6],
];

/** Derived metrics shown as the privacy-safe "explanation" of the fall. */
export const FALL_DERIVED_METRICS = [
  { label: "몸통 각도", value: "78° 급변 (수직→수평)" },
  { label: "수직 변위", value: "1.8초간 급강하" },
  { label: "침대 영역", value: "이탈 후 바닥 감지" },
  { label: "낙상 확률", value: "0.91" },
];
