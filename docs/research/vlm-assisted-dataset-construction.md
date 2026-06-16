---
title: VLM-assisted 데이터셋 부트스트랩 — 라벨 없는 CCTV에서 pseudo-label 생성
slug: vlm-assisted-dataset-construction
type: research
status: active
date: 2026-06-09
author: gobeumsu (deep-interview 설계 + NotebookLM 코퍼스 합성)
grounds_on:
  - NotebookLM "요양원 낙상 보호 AI" (ba3b3d80-0cec-4c72-8910-2981b523be28, 72 sources)
  - 코드베이스 직접 분석 (ml/demo/seam.py, ml/util/frame_source.py)
related: [fall-detection-datasets, fall-detection-methods, fall-state-taxonomy]
---

# §5. VLM-assisted 데이터셋 부트스트랩

> **이 문서의 위치:** research(=내가 찾은 사실)다. 결정하지 않는다. VLM-assisted 라벨링
> 방법론의 옵션·근거·트레이드오프·추천 후보를 제시하고, cross-cutting 결정은 사용자가
> ADR로 확정한다(문서 말미 "ADR 후보" 참조).

## 0. 한 줄 요약 (TL;DR)

우리 요양원 탑다운 CCTV 클립에는 **라벨이 전혀 없다**. 공개 낙상 데이터셋은 "고령자 + 탑다운"을
동시에 만족하지 않는다(`fall-detection-datasets.md §0` 확정 사실). 따라서 **VLM/멀티모달 모델의
시각 판정**과 **규칙기반 기하 판정**을 교차하여 불일치 구간만 사람이 검수하는 **불일치 기반
pseudo-label 부트스트랩** 방법론을 탐색한다. 단 VLM 탑다운 정확도 미검증·순환 참조·프라이버시
등 중요 리스크가 있으며, 모든 최종 결정은 ADR로.

## 1. 개요 — 라벨 부재 문제 재진술

### 1.1 우리가 직면한 라벨 공백

| 사실 | 출처 |
|------|------|
| 공개셋은 "고령자 + 탑다운 영상"을 동시에 만족하지 않음 | [확정 사실: `fall-detection-datasets.md §0`] |
| 우리 보유 클립: `ml/data/raw`, `ml/data/processed` — 영상 존재, 낙상 라벨 없음 | 코드베이스 확인 |
| 3종 pretrained per-frame 모델 붕괴 — "도메인 갭이 1차 문제" | [`fall-detection-methods.md §1`] |
| 자체 in-domain 데이터셋 구축이 최우선 전제 | [`fall-detection-datasets.md §3 추천 1`] |

### 1.2 VLM-assisted annotation의 발상

```
라벨 없는 클립
      │
      ▼
프레임 샘플링 (N프레임/클립 — 비용 제어)
      │
      ├── [R] 규칙기반 판정 (pose keypoint + bbox 기하)  ──┐
      │                                                    ├── 교차 일치율 판정
      └── [V] VLM 판정 (멀티모달 모델: 프레임 시각 분석) ──┘
                  │ 일치                    │ 불일치
                  ▼                        ▼
         고신뢰 pseudo-label        불일치 큐 → 사람 검수
         (자동 적용)                → gold 앵커 (정답 기준점)
```

**핵심 아이디어:** Claude Vision 등 멀티모달 모델에 탑다운 CCTV 프레임을 제시하면,
모델이 "낙상인지, 비낙상인지, 어느 시점에 낙상이 발생했는지"를 텍스트 판정으로 출력한다.
이 VLM 판정과 독립적으로 구현한 규칙기반 판정을 교차(cross-check)하여:
- **일치 구간** → 고신뢰 pseudo-label로 자동 적용(사람 불필요)
- **불일치 구간** → 사람 검수 → **gold 앵커(정답 기준점)** 구성

이 구조는 **active-learning / co-training 계열** 방법에 속한다. 능동 학습(active learning)은
"모델이 가장 불확실해하는 샘플을 우선 라벨링하도록 선택"하는 방법이며, 여기서는 두 판정기의
불일치 구간이 불확실 구간에 해당한다. 비디오 낙상 탐지에서 약한 라벨(weak labels)과 dual-stream
fusion을 결합한 약지도 학습 선례가 코퍼스 내에 존재한다. [NLM: HFD-YOLO]

## 2. 불일치 기반 라벨링 프로토콜 (Co-training / Disagreement)

### 2.1 두 판정기

| 판정기 | 방법 | 사용 신호 | 특성 |
|--------|------|-----------|------|
| **[R] 규칙기반** | pose keypoint + bbox 기하 (§3 참조) | 종횡비·중심 수직위치·변화속도·지속 부동 | 빠름, 확정적, 설명 가능. 탑다운 foreshortening에 취약 가능 |
| **[V] VLM 판정** | 멀티모달 모델(예: Claude Vision, GPT-4o Vision) | 샘플 프레임 → 이진 판정 + 타이밍 추정 | 풍부한 시각 이해. 탑다운 원근압축 정확도 **미검증**(§5 리스크 ③) |

### 2.2 프로토콜 단계

```
1. 클립 분할 → 키프레임/N프레임 샘플링(예: 1프레임/초)
2. [R] pose + bbox 피처 추출 → 규칙 판정
3. [V] 샘플 프레임 → VLM API 호출 → fall/non-fall + 추정 타이밍
4. 일치 판정
   ├── R=fall,  V=fall     → pseudo-label: FALL     (고신뢰)
   ├── R=non-fall, V=non-fall → pseudo-label: NON-FALL (고신뢰)
   └── R ≠ V             → 불일치 큐 추가 → 사람 검수
5. 사람 검수 결과 → gold 앵커 셋 (정답 기준점)
6. gold 앵커로 평가 → pseudo-label 품질 측정 → 재라벨/재학습 반복
```

### 2.3 co-training 문헌적 위치

Co-training(Blum & Mitchell 1998 계열)은 **두 독립적 뷰(view)**로 학습기를 훈련시키고,
한쪽이 고신뢰로 라벨을 예측하면 다른 쪽의 학습 데이터로 사용하는 반지도 방법이다.
여기서 두 뷰는 각각 "기하 피처 뷰(규칙기반)"와 "시각 의미 뷰(VLM)"에 해당한다.
불일치 구간만 사람이 검수하는 아이디어는 **uncertainty sampling** 기반 능동학습의 변형이다.

> **코퍼스 근거 요약:**
> - Wu et al.: weak labels + dual-mode fusion 비디오 낙상 탐지. [NLM: HFD-YOLO]
> - KFall: IMU+영상 통합 재생으로 fall onset 반자동 식별 → 라벨 품질·효율 균형. [NLM: KFall Frontiers]
> - Heritage gallery: LabelImg 어노테이션 + 전문가 교차검증 Kappa 0.89. [NLM: Heritage gallery YOLOv11-SEFA]
>
> **주의:** "VLM을 낙상 라벨링에 직접 사용한 연구"는 코퍼스 내에 명시적 사례 없음(NLM 쿼리 직접 확인).
> 이 문서의 VLM-assisted 파이프라인 설계는 코퍼스 근거가 아닌 **설계 제안**이다.

## 3. 피처셋: Pose Keypoints + Bbox 기하

### 3.1 코드베이스 근거 — 이미 존재하는 인터페이스

```python
# ml/demo/seam.py:23-28
@dataclass(frozen=True, slots=True)
class BoundingBox:
    x1: int; y1: int; x2: int; y2: int; confidence: float

# ml/demo/seam.py:38-43
@dataclass(frozen=True, slots=True)
class DetectionResult:
    boxes: tuple[BoundingBox, ...]          # bbox 기하 피처 직접 사용 가능
    labels: tuple[DetectionLabel, ...]
    # per-person COCO-17 keypoints; each kpt = (x:int, y:int, conf:float)
    keypoints: tuple[tuple[tuple[int, int, float], ...], ...]
```

`DetectionResult`는 `.boxes`(BoundingBox x1·y1·x2·y2·confidence)와
`.keypoints`(COCO-17) 양쪽을 이미 보유한다. 추가 수정 없이 피처로 활용 가능.

```python
# ml/util/frame_source.py:57
image = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
```

VLM API(Claude Vision, GPT-4o 등)는 RGB 이미지를 기대한다. `frame_source.py`가 이미
BGR→RGB 변환을 수행한 `Frame.image`를 제공하므로 그대로 API에 제출 가능하다.

### 3.2 규칙기반 판정에 사용할 피처

| 피처 | 계산 방법 | 탑다운 낙상 신호 | 한계 |
|------|-----------|-----------------|------|
| **bbox 종횡비** `(x2-x1)/(y2-y1)` | `BoundingBox` 직접 | 종횡비 급증(수평으로 퍼짐) → 낙상 후보 | 침대 위 누움, 바닥 앉기와 유사 비율 |
| **bbox 중심 수직위치** `(y1+y2)/2 / H` | `BoundingBox` + 화면 높이 | 변화 없이 낮은 위치 지속 → fallen 후보 | 앉기·쪼그리기와 혼동 |
| **중심 이동 속도** | 연속 프레임 bbox 중심 delta | 급격한 수직 이동 → falling 후보 | 빠른 이동·절뚝거림과 혼동 |
| **지속 부동 (sustained stillness)** | N프레임 이상 bbox·keypoint 변화 없음 | fallen-state 지속 확인 | 정상 수면·착석도 해당 |
| **keypoint 배열 (COCO-17)** | 상체/하체 상대 각도·수직 정렬 | 수직 정렬 붕괴 → 낙상 후보 | **탑다운 원근압축에서 keypoint 추출 정확도 미검증** [`fall-detection-methods.md §2 openQ`] |

> **설계 원칙:** keypoint가 탑다운에서 흔들릴 때(자세 추정기 신뢰도 저하 시) **bbox 기하 피처가
> 견고한 fallback 신호**로 작동한다. bbox는 keypoint 실패 시에도 탐지기가 제공하는 1차 출력이다.
> 두 피처를 병렬로 유지하는 것이 탑다운 도메인에서 특히 중요하다.

## 4. Autoresearch 루프와의 결합

### 4.1 부트스트랩 → 학습 → 평가 반복 루프

```
[부트스트랩 라벨]
     │  pseudo-label(고신뢰) + gold 앵커(사람 검수셋)
     ▼
[경량 학습]
  - Random Forest (RF): 소량 데이터에서 빠르게 학습, 피처 중요도 해석 가능
  - 단순 시계열 분류기 (LSTM/TCN): pose 시계열 윈도우 학습
  - 입력: bbox 기하 + pose keypoints 피처 (윈도우 단위)
     │
     ▼
[평가 — 이중 evaluator]
  ① gold 앵커 대비 F1 / Accuracy  ← 유일한 truth source
  ② R·V 교차 일치율               ← 프록시 지표 (순환 참조 주의 — §5 리스크 ①)
     │
     ├── F1 ≥ 임계, 일치율 안정적  → 현 모델 유지
     └── F1 < 임계 또는 일치율 하락 → 불일치 큐에서 추가 샘플 사람 검수
                                        → gold 앵커 확장 → 재학습
```

### 4.2 자율 루프 & 병렬 서브에이전트 가능성

- **자율 루프(프롬프트 없이):** 평가 스크립트가 "F1 < threshold → 불일치 큐 추가 검수 → 재학습"을
  자동 순환할 수 있다. 사람 개입은 gold 앵커 검수에만 집중.
- **병렬 팬아웃(dynamic fan-out):** 클립 단위 VLM 판정·R 판정 작업은 클립 간 독립적이므로
  서브에이전트 병렬 처리가 가능하다. autoresearch 워크플로우의 동적 분기와 결합 시 확장성 있음.
- **경량 모델 우선:** RF·단순 LSTM 등 소량 데이터에 강한 모델이 초기 루프에 적합.
  gold 앵커가 충분히 쌓인 뒤 pose→Transformer 계열(ADR-025 YOLO26-pose 시임, `seam.py:46-48`)으로
  업그레이드.

## 5. 트레이드오프 & 리스크 (정직하게)

| 리스크 | 내용 | 완화 방안 |
|--------|------|-----------|
| **① 순환 참조** | VLM이 라벨을 만들고 그 라벨로 평가하면 "정답"이 아닌 "VLM 편향 재현"을 측정 | **gold 앵커(사람 검수셋)가 유일한 truth source** — evaluator ②(VLM 일치율)는 프록시일 뿐. 최종 판단은 항상 ① 기준 |
| **② 프라이버시** | 클라우드 VLM에 고령자 얼굴 CCTV 프레임 전송 = GDPR/개인정보 이슈. `fall-detection-datasets.md ADR 후보 D3`과 직결 | 데모·실험: 클라우드 VLM 허용 가능. **배포**: 로컬 오픈 VLM(LLaVA, InternVL 등) 또는 pose-only → ADR로 분리 결정 필요 |
| **③ VLM 탑다운 정확도 미검증** | 클라우드 VLM이 천장 탑다운 원근압축 영상에서 낙상을 신뢰성 있게 인식하는지 **1차 출처로 검증 안 됨**. NLM 코퍼스에도 직접 근거 없음 | 파이프라인 본격 가동 전 탑다운 클립 10~20개 파일럿 검증 필수 |
| **④ 비용·지연** | 프레임당 VLM API 호출은 비싸고 느림. 30fps 클립 전량 처리 불가 | 키프레임 샘플링(1프레임/초) 또는 슬라이딩 윈도우 단위 1회 호출. 불일치 의심 구간만 VLM 호출 |
| **⑤ 약지도 수치 미검증** | `fall-detection-datasets.md §2.1 L3`: 반자동/semi-sup 수치는 deep-research에서 기각(미검증). [Web: PMC11798530, 2012.10911] | 수치 목표치를 미리 설정하지 말고 **자체 gold 앵커 holdout 기준**으로만 성능 측정 |

> **핵심 요약:** 이 방법론의 유효성은 두 가지에 달려 있다: (a) VLM이 탑다운을 얼마나 신뢰성 있게
> 판정하는가, (b) gold 앵커가 얼마나 충실한가. **둘 다 아직 우리 데이터에서 검증되지 않았다.**
> 파이프라인을 본격 가동하기 전 소규모 파일럿 검증이 선행되어야 한다.

## 6. 코퍼스 연결 — 관련 근거 정리

| 근거 | 내용 | 출처 | 신뢰 수준 |
|------|------|------|-----------|
| **Weak supervised 낙상 탐지** | Wu et al.: weak labels + dual-stream fusion으로 비디오 낙상 탐지 | [NLM: HFD-YOLO] | 코퍼스 내 인용 확인 |
| **KFall 반자동 라벨링** | IMU+영상 통합 재생으로 fall onset 반자동 식별. 사람 검수 효율화 참고 | [NLM: KFall Frontiers] | 코퍼스 직접 언급(datasets.md §2.1 교차참조) |
| **Kappa 0.89 품질관리** | Heritage gallery: LabelImg 어노테이션 + 전문가 2인 교차검증, κ=0.89 | [NLM: Heritage gallery YOLOv11-SEFA] | 코퍼스 직접 언급(datasets.md §2.1 교차참조) |
| **LLM/확산모델 낙상 데이터 생성** | Alamgeer et al.(2025): 웨어러블 낙상 데이터 생성 탐색(영상·탑다운 아님, 참고 수준) | 코퍼스 내 리뷰 인용 확인 — 제목 미확정, [NLM:] 생략 | 방향 참고만 |
| **VLM-assisted 낙상 라벨링** | 코퍼스 내 **명시적 사례 없음** (NLM 쿼리 직접 확인) | — | ❌ 코퍼스 미지원 — 이 문서의 해당 설계는 추정임 |

## 7. ADR 후보 (사용자가 직접 결정 — cross-cutting)

- **ADR 후보 V1 — VLM 선택(클라우드 vs 로컬 오픈 모델).** 라벨링 실험 단계: 클라우드 VLM(Claude Vision 등)
  허용 가능. 배포·운영 단계: 로컬 오픈 VLM(LLaVA, InternVL 등) 또는 pose-only 전환 여부. 프라이버시 정책
  (ADR 후보 D3)과 연동. → cross-cutting, 모든 데이터 파이프라인 및 서빙 아키텍처에 영향.

- **ADR 후보 V2 — 불일치 검수 임계 & gold 앵커 최소 규모.** R·V 불일치율 임계(예: 몇 % 이상일 때 사람 검수
  트리거), gold 앵커 최소 샘플 수(F1 평가 신뢰도 확보 기준), holdout 구성 정책(클립/환경 단위 분리).

- **ADR 후보 V3 — Evaluator 구성(gold 앵커 단일 vs VLM 일치율 보조).** 평가를 gold 앵커 기준 F1로
  단일화할지, VLM 일치율을 보조 지표로 유지할지. 순환 참조 위험 수용 수준 결정. →
  autoresearch 루프 종료 조건에 직접 영향.

- **ADR 후보 V4 — 데이터 프라이버시 & 익명화 정책.** 클라우드 VLM에 전송 가능한 데이터 범위(원본 영상 vs
  bbox crop vs 골격 렌더링), 익명화(blur/silhouette/pose-only) 전처리 의무화 여부. `fall-detection-datasets.md
  ADR 후보 D3`과 통합하거나 분리할지. → 법적·운영적 리스크로 cross-cutting.
