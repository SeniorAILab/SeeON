---
title: per-frame vs temporal 낙상 판정 — 차이와 처리 방법 (best practice)
slug: per-frame-vs-temporal-fall-judgment
type: research
status: active
date: 2026-06-10
author: gobeumsu (deep-research wf_5397e2ba-7d9 + 교차검증 wf_d52dd601-4ca + 코드베이스 매핑)
grounds_on:
  - deep-research workflow wf_5397e2ba-7d9 (102 agents, 3-vote adversarial)
  - cross-verification workflow wf_d52dd601-4ca (56 agents — 전 주장 원문 재검증 + 4축 신규탐사, 3-렌즈 적대검증)
  - 코드베이스 ml/demo/{features.py, classifiers.py, app.py, live_view.py}
related: [streaming-windowing, fall-detection-methods, fall-state-taxonomy, fall-detection-datasets]
---

# per-frame(프레임 단위) vs temporal(시간축) 낙상 판정

> research 문서. "한 장의 프레임으로 판정 vs 여러 프레임 시계열로 판정"의 차이가 무엇이고
> 각각 어떻게 처리해야 하는지를 1차 출처로 정리하고, **현재 코드가 이미 어디에 해당하는지** 매핑한다.
> 모든 주장은 2회 독립 적대검증(원문 직접 인용 확인)을 통과한 것만 남겼다.

## 0. 한 줄 답 — 둘은 "택1"이 아니라 "2단 레이어"다

낙상 판정은 **반드시 두 개의 분리된 레이어**로 구성된다. 하나를 고르는 게 아니다.

| 레이어 | 질문 | 입력 | 출력 | 우리 코드 |
|--------|------|------|------|-----------|
| **per-frame (프레임 단위)** | "이 *한 장*에서 누운/무너진 자세인가?" | pose 키포인트 1프레임 | 후보 플래그 (down? yes/no) | `features.extract_frame_features` + `RuleBasedClassifier`의 `is_down` 판정 |
| **temporal (시간축)** | "그 자세가 *N초/N프레임 연속* 유지됐는가?" | 프레임 단위 플래그의 시계열 | 최종 낙상 확정 (fire) | `RuleBasedClassifier`의 `_down_start` 타이머 + `sustained_down_sec` |

**핵심 발견:** per-frame 단독은 학계에서 "구조적으로 불충분(architecturally insufficient)"으로 명시된다.
PLOS One(2025)은 *"reliance on single-frame analysis increases false positive rates, as transient
postures are often misinterpreted as falls"* 라고 직접 서술한다. 즉 앉기·눕기·구부리기 같은 **일시적
자세를 낙상으로 오탐**한다. 조사된 모든 프로덕션급 시스템이 최종 알림을 다중 프레임 지속 조건으로
게이팅한다(지속 게이트는 2연속 프레임부터 수 초까지 다양). per-frame 단독으로 충분하다고 주장하는
출처는 발견되지 않았다.
[PMC12173392, arXiv:2503.19501, arXiv:2505.11845, arXiv:2401.01587, PMC7039221(Sci.Rep 2020)]

## 1. per-frame 레이어 — 한 장에서 "후보"를 잡는 기하 신호

확정된 per-frame 휴리스틱:
- **바운딩 박스 aspect ratio**(가로>세로 = 누움) — 다수 출처 확정 [PMC12252158 등].
  단, 2024–25 논문들은 **카메라 각도 불변성** 때문에 bbox → skeleton-angle 피처로 이동 중
  (PIFR은 bbox 치수를 "의도적으로 회피"). 알려진 신호이되 단독 의존은 피할 것.
- **상·하체 수직 붕괴 신호** — 논문마다 공식이 다르다: 상체 kpt(0–10)·하체 kpt(11–16) 평균
  y좌표 차 ≤ 0.05 [arXiv:2401.01587], nose-ankle 각도 [PMC12173392], 몸통 수평 기울기 [PMC11751301].
  "torso-to-ankle 수직거리 최소"는 이 계열의 통칭이지 표준 용어가 아님.
- **UBK-LBK 2중 임계 룰**: **Δy ≤ 0.05 AND |Δx| > 0.5** (정규화 0–1 좌표) → 누움 후보,
  ≥2 연속 프레임 시 알림 [arXiv:2401.01587, MoveNet COCO-17 — **YOLO와 동일 스키마,
  `keypoints.xyn`으로 재매핑 없이 즉시 구현 가능**].
  주의: URFD에서 specificity 0.725(FPR 27.5%) — 단독 사용 금지, 기존 게이트의 보완 신호로.
- **몸통-다리 각도(torso-leg angle) 60°~120°**: shoulder-hip 벡터와 hip-knee 벡터 사이 각
  [arXiv:2503.19501]. **단일 preprint 레시피** — 동일 벡터 정의로 독립 재현한 peer-reviewed
  논문은 없으며, MediaPipe 기반이라 COCO-17 이식 시 인덱스 재매핑 필요(§5).

> **우리 코드 매핑:** `features.py`의 `aspect_ratio`(>1 = 누움), `vertical_center`(클수록 바닥 쪽),
> `torso_vertical`(작을수록 수평)이 정확히 이 per-frame 레이어다. `RuleBasedClassifier.update`의
> `is_down = has_person and aspect_ratio >= 1.2 and vertical_center >= 0.55` 가 "후보 플래그"다.

### per-frame에서 **기각된**(쓰지 말 것) 주장
- ❌ "height ratio < 0.5 가 *주요* 임계값" — 0.5라는 수치 자체는 arXiv:2503.19501에 실재
  (shoulder-hip 거리/기준 키, keypoint 비율 — bbox aspect_ratio와 다른 피처)하나, 그 논문에서도
  다수 피처 투표의 한 표일 뿐. "주요 임계값" 프레이밍은 어떤 출처도 지지하지 않음.
- ❌ "여러 지표 다수결(majority voting)이 *확정* 메커니즘" — 다수결이 시간축 확정을 대체하지 못함.
  유일한 유사 사례(PMC12475177)는 **모델 앙상블** 투표(YOLO/RetinaNet/DETR)이지 per-frame 지표
  투표가 아니며, 지표 투표를 쓰는 시스템(2503.19501)도 20-frame 버퍼를 병용.
- ❌ "9개 각도 피처(nose-ankle 등)가 raw 좌표보다 *반드시* 우월" — 일반화된 정설 아님.
  PIFR 피처를 그대로 차용하는 것도 불가: SVM 가중치 미공개라 재학습 없이 이식 안 됨.
- ❌ "정규화 torso-height ratio 자가보정(첫 프레임 기준) 레시피" — 원문은 좌측 shoulder-hip
  단측 측정이며 "자가보정 절차"는 논문에 없는 해석.

## 2. temporal 레이어 — "지속"으로 확정하고 오탐을 죽인다

per-frame 후보가 **연속으로 유지**될 때만 낙상으로 확정한다. 이게 오탐 억제의 본체다.

확정된 temporal 설계들(서로 다른 시스템의 실측, 단일 정답값은 없음):

| 시스템 | temporal 설계 | 성능 | 출처 |
|--------|--------------|------|------|
| (MediaPipe 버퍼) | **20프레임 버퍼** + 피처 가중 투표 | — | arXiv:2503.19501 (preprint) |
| ElderFallGuard | **AND 이중 게이트: pose 지속 >3초 AND 모션 강하 지속 >2초 동시 충족** | — | arXiv:2505.11845 (preprint) |
| PIFR (YOLOv11n-pose+SVM) | **설정형: 5~10초 또는 200~500 연속프레임** | F1 91.4% / FPR 4.4% | PMC12173392 (**peer-reviewed**) |
| ST-GCN 계열 | **30프레임 tumbling(비중첩) 윈도** → 액션 분류 | — | GajuuzZ repo; 독립 근거 PMC11280873 (**peer-reviewed**, 24/30-frame 평가) |
| NSPR 상태머신 | 비안정 3연속 → **Suspicious 상태**(10프레임 피처 γ/ε/τ 수집) → SVM 판정, 안정 3연속 리셋 | acc 97.34% | PMC7729773 (**peer-reviewed**, Sensors 2020) |

- ElderFallGuard의 **모션 강하 게이트**가 중요한 이유: "누운 자세지만 계속 움직이는" 활동
  (구르기, 일어나기, 의도적 눕기)을 거부 — **단일 지속 타이머가 못 잡는 오탐 클래스**를 죽인다.
- NSPR(PMC7729773)은 단순 타이머가 아닌 **Normal → Suspicious → Classified 3-상태 기계**의
  정식 사례. 단 OpenPose BODY_25 기반(Neck/MidHip가 COCO-17에 없음)이라 임계값·SVM은 이식 불가,
  **구조 패턴만 차용 가능**.
- 자주 인용되는 "TSSTG"는 peer-reviewed 논문의 모델명이 아니라 GajuuzZ GitHub repo의 라벨이다.

> **우리 코드 매핑:** `RuleBasedClassifier`의 `_down_start` 타이머 + `duration >= sustained_down_sec`(기본 2초)가
> 바로 이 temporal 확정이다. **이미 best practice 구조를 구현해 놨다.** `conf = min(1.0, duration/sustained)`로
> 신뢰도가 0→1 램프되는 것도 좋은 패턴(UI에 "확정까지 얼마나 가까운지" 노출).

### temporal 처리 방식의 스펙트럼 (단순 → 복잡)
1. **상태머신 + 지속 타이머 (현재 우리 방식)** — `is_down`이 N초 연속 → fire. 가장 단순·견고. **로컬 데모엔 충분.**
2. **+ AND 모션 강하 게이트 (ElderFallGuard 패턴)** — `is_down` 동안 shoulder/hip 중심점의
   프레임당 변위가 임계 이하로 N초 지속하는지 **병렬 카운터 1개 추가**. 모델 추가 없이 오탐 클래스 1개 제거.
3. **sliding window + smoothing/debouncing** — window 내 down 비율 임계, temporal smoothing으로 깜빡임 제거.
4. **명시적 다단 상태머신 (NSPR 패턴)** — 의심 상태에서 시간 피처를 수집해 경량 분류기로 판정.
5. **시계열 모델 (LSTM/GRU/TCN/ST-GCN)** — 키포인트 시퀀스를 학습. 동적(falling)+정적(fallen) 패턴 포착. 무겁고 데이터 필요.

### 흔한 실수(pitfall)
- **FPS 비정규화 임계값을 그대로 복붙**: 조사된 어떤 논문도 frame↔초 환산 공식을 명시하지 않는다.
  실례 — PIFR의 실측 23fps에서 200프레임 = **8.7초**(명목 5초 대비 74% 초과); 2-frame 임계는
  30fps에서 67ms, 15fps에서 133ms로 2배 차.
  → **초(second) 단위로 임계값을 정하라**(우리 `sustained_down_sec`가 옳은 선택). 프레임 수로 받지 말 것.
- **stride 경로의 배수 오차**: `PLAYBACK_FRAME_STRIDE=4`처럼 프레임을 건너뛰는 경로에서
  frame-count 가드를 쓰면 4배 오차. 반드시 `frame.time_sec` 기반 유지(우리 코드는 정상).
- per-frame만으로 알림 발사 → 일시동작 오탐 폭증.
- 타이머 리셋 누락 → 우리 코드는 `is_down=False`에서 `_down_start=None` 리셋 처리됨(정상).

## 3. 실시간 파이프라인 아키텍처 (로컬 데모)

입력 → 프레임 캡처 → YOLO pose 추론 → 키포인트 후처리(per-frame) → temporal 확정 → UI/알림.

- **Ultralytics 공식 Streamlit live-inference 가이드는 per-frame 동기 루프뿐 — temporal 로직이 0이다**
  (`streamlit_inference.py` 소스 직접 확인). `while cap.isOpened(): model(frame) → plot() →
  st.empty().image()` 구조에 threading/queue/state machine 전부 없음.
  → **시간축 확정 레이어는 개발자가 직접 올려야 한다.** (우리는 이미 올렸다.)
- 실시간 FPS 유지: **프레임 스키핑/다운샘플링**(우리 `PLAYBACK_FRAME_STRIDE=4`), 실시간 페이싱(우리 `time.sleep` 페이싱).

## 4. 로컬 Streamlit 실시간 영상 연동 — 우리 선택이 맞다 (+ 제3 선택지)

로컬 머신 데모에서의 선택지와 트레이드오프:

| 방식 | 실시간 웹캠 | 업로드 비디오 | temporal 상태 보관 | 비고 |
|------|-----------|-------------|------------------|------|
| **OpenCV 루프 + `st.empty()` placeholder (현재 app.py)** | △(로컬 cv2) | ✅ | ✅ 메인스레드 단순 | 메인스레드 블로킹이나 **로컬 데모엔 최적·최단순** |
| **`@st.fragment(run_every=...)`** (1.37.0+ stable) | △(로컬 cv2) | ✅ | ✅ **session_state 직접 접근** | **비블로킹** — 지정 간격으로 fragment만 자동 재실행 |
| `st.camera_input` | ❌ 스냅샷 1장만 | — | — | 실시간 스트림 불가 |
| `streamlit-webrtc` | ✅ 진짜 실시간 | ✅ | ⚠️ **함정** | 아래 경고 |

**`@st.fragment(run_every=...)` 사용 시 주의** (공식 문서 + start/stop 튜토리얼):
- `VideoCapture`와 classifier 인스턴스를 **`st.session_state`에 보관**해야 틱 간 생존한다.
- `run_every=None`으로 정지, 숫자로 재개 — start/stop 버튼 패턴이 공식 문서화돼 있음.
- fragment가 실행경로에서 사라지면 'Could not find fragment with id'(issue #9080)
  → body를 `if st.session_state.stream:`으로 게이트.

**streamlit-webrtc의 함정**(1차 출처: whitphx README + Streamlit issue/포럼):
- 콜백 안에서 **모든 `st.*` 호출이 실패**한다 — 예외는 안 나지만 터미널에
  "missing ScriptRunContext" WARNING이 찍히고 UI에는 아무 효과가 없다.
- **`st.session_state` / 전역변수(`global`)가 콜백 경계를 넘지 못한다.** frame 콜백은 worker
  thread에서, cleanup 콜백(on_ended)은 aiortc asyncio 루프에서 돈다 — 두 컨텍스트 모두 동일 제약.
- 따라서 temporal 상태머신을 **`threading.Lock`으로 보호된 mutable dict**에 넣고 메인 스크립트가 읽어야 한다.
- "콜백이 *완전 독립 forked 스레드*라 메인과 병렬로 무한히 돈다"는 잘못된 멘탈모델 — 실제는
  단일 worker thread의 이벤트루프 호출이며, v0.70.0(2026-05)부터 페이지를 닫으면 track이
  결정적으로 종료된다(CHANGELOG).
- 참고: "VideoProcessorBase가 공식 deprecated(v1.0 제거 예정)"라는 주장은 과장 — 체인지로그
  실문은 README 문구 업데이트일 뿐. (우리는 webrtc 미사용이라 무관.)

**Streamlit 런타임 변화(2025–26)**: 1.57.0(2026-04)에서 Tornado → Starlette/Uvicorn 교체,
1.52.0(2025-12)부터 uvloop 옵션 지원 — 코드 수정 없는 업그레이드. 단 우리는 localhost +
CPU-bound 동기 루프라 서버 계층이 병목이 아니어서 실측 이득은 미지수.

> **결론:** 로컬 데모는 webrtc 안 써도 된다. **현재 OpenCV-루프 + `st.empty()` 방식이 가장 단순하고,
> temporal 상태를 그냥 classifier 인스턴스(`_down_start`)에 들고 있으면 끝.** 비블로킹이 필요해지면
> `@st.fragment(run_every)`가 webrtc보다 먼저 검토할 대안이다(Lock 불필요, session_state 직접 접근).
> webrtc는 "브라우저/원격 웹캠"이 필요할 때만. 우리 ADR-010(per-frame live inference)과 정합.

## 5. YOLO pose 모델 선정 검증

- pose 기반 낙상 탐지는 이 도메인의 **표준 접근 중 하나**로 광범위하게 채택됨(YOLOv8/v11-pose 다수 논문).
  단 분야는 multi-paradigm — bbox-only, pose-only, 결합형이 공존한다.
- pose 기반(키포인트 기하/시계열) vs detection 기반(box aspect ratio)은 **상보적** — 실제로 둘을 합쳐 쓴다
  (우리도 box aspect_ratio + 키포인트 torso_vertical 둘 다 사용 중).
- ⚠️ **벤치마크 수치는 신뢰 보정 필요**: "YOLOv11-pose 90.6% vs YOLOv8-pose 83%" 같은 직접 비교
  주장은 1차 출처가 존재하지 않음(반복 검색으로 확인). DETR perfect-recall 주장도 동일.
  **"어느 모델이 몇 % 더 낫다"는 1차 출처로 확정 불가** → 자체 holdout에서 측정하라.
- ⚠️ **키포인트 스키마 차이**: MediaPipe(33-kpt) 레시피를 YOLO/COCO(17-kpt)에 그대로 쓰면
  **조용히 틀린 관절로 계산**된다 — 예: MediaPipe index 11 = left_shoulder인데 COCO-17 index 11 =
  left_hip. 관절 의미 자체는 동일(BlazePose는 COCO 상위집합)이라 재매핑은 1회성 룩업테이블이면 끝.
  (우리 `features.py`는 이미 COCO-17 인덱스 5/6/11/12 사용 — 정상.)
- **업그레이드 경로 — YOLO26-pose** (2025-09 출시, n/s/m/l/x): keypoint 회귀를 RLE(Residual
  Log-Likelihood Estimation) 불확실성 모델링으로 교체, COCO pose에서 YOLO11 대비 최대 +7.2 AP
  (nano는 ~+2.1), NMS-free. **출력 스키마 동일(COCO-17 x,y,conf)** → `yolo26n-pose.pt`로 한 줄 교체.
  RLE는 가려진 관절의 불확실성을 명시 모델링 → **바닥에 가려지는 누운 자세에 구조적으로 유리**.
  단 AP 수치는 벤더 자체 보고 — 자체 holdout 측정 원칙 그대로 적용.
- **YOLO12에는 pose 사전학습 가중치가 없다** — detection 전용 출시. pose/seg/OBB는 YAML 설정만
  존재(직접 학습 필요), 공식 문서가 production pose는 YOLO11/YOLO26 사용을 명시.
  업그레이드 경로는 YOLO11n-pose → YOLO26n-pose.
- ❌ 기각: "COCO 학습 YOLO pose가 누운 사람에서 좌우 keypoint 반전을 일으키며 conf 게이팅 +
  bbox 폴백이 *문서화된* 완화책" — `flip_idx`는 학습시 증강 파라미터(추론 동작 아님)이고 인용
  출처 어디에도 해당 완화책이 문서화돼 있지 않음. 그리고 그 완화 패턴 자체는 우리 `features.py`에
  이미 구현돼 있다(`_CONF_THRESHOLD=0.2` 게이팅 + bbox 기반 `aspect_ratio` + 좌우 평균 `torso_vertical`).

## 6. 정리 — 당신이 막혔던 지점의 진짜 답

1. **"frame 단위 vs 시간축"은 둘 중 하나를 고르는 문제가 아니다.** frame 단위로 *후보*를 잡고(누운 자세?),
   시간축으로 *확정*한다(그 자세가 2초 지속?). 둘 다 필요하다 — 이건 학계 만장일치다.
2. **당신은 이미 둘 다 구현했다.** `features.py`=프레임 레이어, `RuleBasedClassifier`의 `_down_start`+`sustained_down_sec`
   =시간축 레이어. 혼란스러웠던 이유는 두 레이어가 한 클래스에 섞여 있어 경계가 안 보였을 뿐.
3. **로컬 데모 아키텍처도 이미 best practice다**(OpenCV 루프 + `st.empty()`, 초 단위 임계값, stride 페이싱).
   webrtc로 갈아탈 필요 없다.
4. **다음 개선 우선순위**(research 추천, 결정 아님):
   - **AND 모션 강하 게이트 추가**(§2 스펙트럼 2단계) — 카운터 1개로 "낙상 vs 의도적 눕기" 오탐 클래스 제거.
   - **UBK-LBK 보조 룰**(§1) — `keypoints.xyn`으로 즉시 구현, 기존 게이트 보완(단독 금지).
   - 임계값(`sustained_down_sec`, `aspect_ratio_min`, `vertical_center_min`)을 **자체 holdout에서 sweep**해 확정
     (streaming-windowing.md §4와 동일 원칙 — 단일 최적값 맹신 금지).
   - **YOLO26n-pose 스왑 + 자체 holdout 측정** — 한 줄 교체, 누운 자세 keypoint 품질 개선 여부 실측.
   - 비블로킹이 필요해지면 `@st.fragment(run_every)` 검토(§4) — webrtc보다 먼저.
   - 준비중인 LSTM/Transformer는 **자체 라벨 데이터가 충분히 쌓인 뒤** 도입(per-frame 휴리스틱으로 베이스라인 확보가 먼저).

## 7. 신뢰성 경고 (caveats)

- 핵심 각도 임계값(60–120°)은 **단일 preprint** 출처이며 **MediaPipe** 기반 — YOLO에 인덱스 재매핑 필요.
- 프레임 수 임계값은 **FPS 비정규화** — 어떤 논문도 환산 공식을 주지 않는다. 초 단위로 환산해 쓸 것.
- 91.4% F1(PMC12173392)은 URFD(낙상 학습샘플 30개)+MCFD 기반, **일반화 한계를 저자가 명시**.
- peer-review 구분: PMC12173392(PLOS One)·PMC7729773(Sensors)·PMC11280873(MDPI Sensors)은 심사 통과;
  arXiv:2503.19501 / 2505.11845 / 2401.01587은 **미심사 preprint**; YOLO26 수치는 벤더 자체 보고.
- 모델 간 정확도 직접비교 주장은 1차 출처 부재로 전부 기각됨 — **자체 측정이 유일하게 신뢰 가능**.
- 검증 방법론 주의: 출처 본문을 직접 fetch하지 않은 판정은 뒤집힌 사례가 있었다(ElderFallGuard의
  AND 이중 게이트). 본 문서의 수치·인용은 모두 원문 직접 확인을 거친 것만 남겼다.

## 8. ADR 후보 (cross-cutting — 사용자가 직접 결정)

- **ADR 후보 — 2단 낙상 판정 레이어 계약.** "per-frame 후보 + temporal 초단위 지속 확정"을 표준 파이프라인 계약으로
  고정(모든 classifier가 이 2단을 따른다). streaming-windowing의 ADR 후보 W1/W2와 결합.
- **ADR 후보 — 로컬 데모 실시간 연동 방식.** 3안 비교로 결정: ① OpenCV-루프+`st.empty()`(현행, 블로킹)
  ② `@st.fragment(run_every)`(비블로킹, session_state 직접) ③ webrtc(원격 웹캠 요구 시에만). ADR-010 연장.
