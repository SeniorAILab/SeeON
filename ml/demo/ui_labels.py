"""Stable shared labels for Streamlit demo controls.

Keep this module narrow: only labels shared across app code and AppTest coverage
belong here. Page-specific prose, status messages, and one-off copy stay with
the rendering code that owns them.
"""

UPLOAD_VIDEO_LABEL = "영상 추가 업로드"
VIDEO_SELECT_LABEL = "영상"
DOMAIN_SELECT_LABEL = "도메인"
ROLE_SELECT_LABEL = "종류"

CLASSIFIER_SELECT_LABEL = "분류 모델"
DECISION_THRESHOLD_LABEL = "판정 임계값 (낙상 확률)"
DETECTION_PARAMS_LABEL = "탐지 파라미터"
CONFIDENCE_THRESHOLD_LABEL = "신뢰도 임계값 (conf)"
WINDOW_FRAMES_LABEL = "윈도우 (프레임)"
STRIDE_FRAMES_LABEL = "스트라이드 (프레임)"
SUSTAINED_FALL_SECONDS_LABEL = "낙상 판단 지속시간 (초)"

YOLO_SIZE_LABEL = "YOLO26-pose 크기"
BOUNDING_BOXES_LABEL = "바운딩 박스"
POSE_SKELETON_LABEL = "포즈 스켈레톤"
