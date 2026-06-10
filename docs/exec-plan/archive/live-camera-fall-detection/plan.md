---
slug: live-camera-fall-detection
issue: 47
status: done
author: gobeumsu
date: 2026-06-10
spec: ./spec.md
---

# Plan — iPhone 카메라 라이브 낙상 탐지 페이지 (issue #47)

autoresearch mission `live-camera-fall-detection`의 구현 계획. 목표는 **실시간 가시성**
(모델이 탐지한 것이 실시간으로 보임)이며 분류 정확도는 명시적 논외(#25/#26).

## Steps

### 1. `CameraSource` — `ml/util/frame_source.py`
`VideoFileSource` 옆에 추가. `FrameSource` 프로토콜 구현(순수 OpenCV):
- `__init__(device_index: int, max_failures: int = 30)`
- 무한 스트림: EOF 없음, 연속 read 실패 `max_failures`회에서 iterator 종료(디바이스 분리 대응)
- `time_sec` = `time.monotonic()` 기준 벽시계 경과 (파일과 달리 fps 메타데이터 신뢰 불가)
- 최신 프레임 우선: `CAP_PROP_BUFFERSIZE=1` 설정으로 스테일 버퍼 누적 방지
- BGR→RGB 변환은 `VideoFileSource`와 동일

### 2. 카메라 프로브 — `ml/util/camera_probe.py`
`probe_cameras(max_index: int = 5) -> list[CameraInfo]`:
인덱스 0..4를 열어 1프레임 캡처 성공 시 `(index, thumbnail_rgb)` 수집. 순수 OpenCV.
util에 두는 이유: Streamlit 비의존(단위 테스트 가능), CameraSource와 동일 seam 레이어.

### 3. 공유 UI 모듈 추출 — `ml/demo/demo_ui.py`
`app.py`에서 다음을 행동 보존 추출(기존 페이지 외관 불변):
- `build_model(size, classifier_key, classifier_params)` (현 `_build_model`)
- `render_status(placeholder, status, confidence)` (현 `_render_status`)
- 탐지 파라미터 expander → `ClassifierParams` 반환 (현 inline 블록)
- 분류 모델 selectbox 블록
`app.py`는 추출된 함수를 import해 동일 동작 유지.

### 4. 라이브 페이지 — `ml/demo/pages/live_camera.py`
- 프로브 결과를 썸네일 + 라디오/셀렉트로 표시, 카메라 미발견 시 `st.warning`
- 시작/중지 버튼 (`st.session_state` 키 분리: `camera_playing`)
- 루프: `CameraSource(index)` + `demo_ui` 공유 컴포넌트 + `iter_live_frames` — **페이싱 sleep 없음**
  (카메라가 실시간 페이스; Streamlit rerun이 사실상의 중지 지점)
- 상태 배지에 처리 fps 표시(실측)

### 5. 벤치마크 — `ml/demo/live_bench.py`
`python -m demo.live_bench --json`:
- `ml/data/processed`에서 클립 1개 선택(또는 `--video` 인자), `VideoFileSource`로 최대 속도 주입
- `iter_live_frames` 전체 파이프라인 통과 fps와 프레임당 평균 지연(ms) 측정
- 마지막 줄 JSON: `{"fps": float, "latency_ms": float, "frames": int}`
- evaluator pass 기준: fps ≥ 10 AND latency_ms ≤ 500

### 6. 테스트 — `ml/tests/`
- `test_util_camera_source.py`: 가짜 `cv2.VideoCapture`(monkeypatch)로 CameraSource 단위 테스트
  — Frame 필드, 벽시계 time_sec 단조 증가, read 실패 시 종료, RGB 변환
- `test_util_camera_probe.py`: monkeypatch로 일부 인덱스만 열리는 상황 검증
- `test_live_bench.py`: 가짜 소스/모델로 JSON 출력 계약 검증
- 기존 테스트 전체 green 유지

### 7. 검증
- `bash .omc/autoresearch/live-camera-fall-detection/evaluator.sh <worktree-ml>` → pass
- visual-verdict: 변경 전후 app.py 스크린샷 비교 — 깨짐/사라진 요소 없음
- (카메라 연결 시) 실카메라 10초 스모크 score 기록

## Out of scope
- 분류기 정확도 개선, streamlit-webrtc(원격 카메라), 디바이스 이름 표시(pyobjc)

## Completion
plan frontmatter `status: done` → `docs/exec-plan/archive/` 이동, `/documentation-and-adrs`로
카메라 intake 결정(ADR-006 seam 확장 + multipage 구조) 증류, PR 생성.
