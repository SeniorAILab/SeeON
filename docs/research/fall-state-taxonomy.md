---
title: 낙상 상태 Taxonomy — 라벨셋 설계
slug: fall-state-taxonomy
type: research
status: active
date: 2026-06-09
author: gobeumsu (deep-research + NotebookLM 코퍼스 합성)
grounds_on:
  - NotebookLM "요양원 낙상 보호 AI" (ba3b3d80-0cec-4c72-8910-2981b523be28, 72 sources)
  - deep-research workflow wf_34d79843-497 (3-vote adversarial)
related: [fall-detection-methods, fall-detection-datasets, streaming-windowing]
---

# §4. 낙상 상태 Taxonomy

> research 문서. 문헌/데이터셋이 낙상 상태를 어떻게 정의하는지 정리하고, 요양원 알림 유스케이스
> (**침대 누움 vs 바닥 누움 구분**)에 맞는 라벨셋 옵션과 추천 후보를 제시한다. 결정은 ADR로.

## 0. 왜 taxonomy가 먼저인가
라벨셋(=모델 출력 클래스)이 정해져야 **라벨링(§2)도, 윈도우 경계(§3)도** 정해진다.
즉 **taxonomy는 데이터·윈도우의 상류 결정**이다. 여기서 막연하면 전 파이프라인이 흔들린다.

## 1. 문헌의 3가지 정의 방식 (코퍼스 — 출처 있음)

| 체계 | 라벨 | 핵심 아이디어 | 대표 출처(코퍼스) |
|------|------|---------------|-------------------|
| **B. Binary** | fall / no-fall | 가장 단순 | 다수 YOLO 계열 |
| **E. Event(시간단계)** | non-fall / **pre-impact(falling)** / fall(post-impact) | 충격 전·중·후 시간 분해 | [NLM: 비침습 pre-impact 3-phase], [NLM: Novel Hybrid DNN(ConvLSTM)] |
| **S. Posture(자세)** | standing / sitting / **lying** / bending (+바닥교차) | 자세 분류 후 낙상 판정 | [NLM: Miao Yu 2012 posture-based] |
| **DS. Dynamic/Static** | falling-state(동적) + fallen-state(정적) | 낙하 중 + 쓰러져 정지 분리 | [NLM: Dual-Channel Feature Integration] |

within-dataset 수치(참고): ConvLSTM 3-class → Fall 98.66% / pre-impact 94.48% [NLM: Novel Hybrid DNN].
Dual-Channel(falling+fallen) → UR Fall 97.33% / Le2i 96.91% [NLM: Dual-Channel].

## 2. deep-research 반대심문 — taxonomy 주장도 대부분 기각(미검증)

| 주장 | 결과 | 출처 |
|------|------|------|
| "16-class(동작4+정적4 등) → 낙상 놓쳐도 fallen 상태로 fallback 가능" | 0-3 ✗ | [Web: OmniFall 2505.19889] |
| "4-class posture(bend/lie/sit/stand)+전이게이팅이 binary보다 우월, 97.48%/FP 2.94%" | 0-3 ✗ | [Web: PMC8321307] |
| "3단계(pre/impact/post) 가능, ~99%(웨어러블)" | 0-3 ✗ | [Web: PMC7866865] |
| "impact 구간=충격 전 1.5s+후 0.5s(2s)로 정의" | 0-3 ✗ | [Web: PMC7866865] |
| "fall 판정=비정상자세 AND 바닥교차 AND 급격전이 AND 지속부동(4조건 결합)" | 0-3 ✗ | [Web: PMC8321307] |

**해석:** 다중클래스/posture가 "더 낫다"는 *구체적 우월성 수치*는 1차 출처로 확인 안 됨.
단 **"fallen 상태(정적 지속)" + "바닥교차"** 라는 **개념적 설계 요소**는 코퍼스(Miao Yu, Dual-Channel)와
웹 양쪽에서 반복 등장 → 우리 유스케이스(침대 vs 바닥)에 직접 유용.

## 3. 요양원 유스케이스 정렬 — 침대 누움 vs 바닥 누움

요양원 알림의 본질: **"바닥에 쓰러져 있음"을 잡되, "침대/소파에 정상적으로 누움"은 알리지 않기.**
이는 단순 binary fall/no-fall로는 부족하고 **위치(바닥 교차) + 정적 지속(fallen)** 정보가 필요하다.
코퍼스의 Miao Yu(2012)가 정확히 이 구조: 바닥 영역 검출 → 인체-바닥 교차로 'lie on floor'를 'lie on sofa'와 분리. [NLM: Miao Yu 2012]

## 4. 라벨셋 옵션

| 옵션 | 클래스 | 침대/바닥 구분 | 복잡도 | 라벨링 비용 |
|------|--------|----------------|--------|-------------|
| **TX1. Binary(추천 v1)** | fall / no-fall | ❌(후처리 게이트로 보완) | 최저 | 최저 |
| **TX2. Event 3-class** | normal / falling / fallen | △(시간만) | 중 | 중(경계 정의 필요) |
| **TX3. Posture+위치** | standing/sitting/**lying-in-bed**/**lying-on-floor**(+bending) | ✅ | 중상 | 중상(바닥영역 주석) |
| **TX4. 하이브리드(Event×위치)** | (falling/fallen) × (on-bed/on-floor) | ✅✅ | 상 | 상 |

## 5. 추천 (research 추천 — 결정 아님)

> **전제 정정(추론 레벨):** taxonomy를 처음부터 세분화할 필요는 없다. per-frame 붕괴를 고치는 핵심은
> **더 많은 클래스가 아니라 시간정보(temporal)**다. 시계열 모델이 "정상 눕기(점진)"와 "낙상(급격 전이+정지)"을
> *운동 패턴*으로 가르므로, **binary fall/no-fall만으로도 v1이 성립**한다. 클래스 세분화는 binary가
> 실제로 과탐할 때 비용을 지불하면 된다(추측성 선투자 금지).

1. **v1 = TX1(Binary fall/no-fall).** 이유: (a) 붕괴의 진짜 원인(시간정보 부재)은 모델 계열(§1 B: pose→시계열)이
   해결, taxonomy가 아님. (b) 라벨링 비용 최저 → 자체 in-domain 데이터 구축(§2)을 가장 빨리 시작. (c) `DetectionResult`
   계약·윈도우 경계(§3)를 단순하게 유지.
2. **v1+ = Binary + "지속 부동(sustained-down) N초" 후처리 게이트.** 이는 **새 클래스가 아니라 운영 규칙**이다.
   바닥에서 N초 이상 정지 지속 시에만 알림 발화 → 일시적 동작 오탐을 클래스 추가 없이 억제(코퍼스의 "fallen-state 지속"
   아이디어를 규칙으로 흡수). [NLM: Miao Yu 2012], [NLM: Dual-Channel]
3. **v2(조건부 확장) = 위치(bed/floor) 또는 posture 축 추가** — **단, binary가 자체 holdout에서 과탐을 보일 때만.**
   이때 Miao Yu식 "바닥 영역(floor region)" 주석이 전제가 된다. 과탐이 없으면 굳이 도입하지 않는다.
4. **다중클래스 "성능 우월" 수치는 미검증**(§2의 0-3 기각) → 확장은 "정확도 보장" 근거가 아니라
   "binary 과탐 관측"이라는 **데이터 증거가 나온 뒤** 결정.
5. **라벨 스키마 설계 시 위치축 확장 여지만 남겨둘 것**(바닥 ROI를 나중에 주석 가능하게) — 지금 라벨링하진 않되,
   스키마가 v2를 막지 않도록.

## 6. ADR 후보 (사용자가 직접 결정 — cross-cutting)

- **ADR 후보 T1 — 낙상 상태 라벨셋 확정.** TX1~TX4 중 선택. 이것이 §2 라벨링 스키마와 §3 윈도우 경계,
  모델 출력 헤드(`DetectionResult` 계약)를 모두 규정 → 최상류 cross-cutting 결정.
- **ADR 후보 T2 — "바닥 영역/위치" 표현 방식.** 바닥 ROI 주석 vs 학습기반 위치추론.
- **ADR 후보 T3 — 알림 트리거 규칙.** 어떤 상태(예: lying-on-floor + N초 지속)에서 알림을 발화할지(운영 정책).
