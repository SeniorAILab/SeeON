---
title: 낙상 탐지 방법론 & 모델 지형도 — 요양원 탑다운 CCTV 관점
slug: fall-detection-methods
type: research
status: active
date: 2026-06-09
author: gobeumsu (deep-research + NotebookLM 코퍼스 합성)
grounds_on:
  - NotebookLM "요양원 낙상 보호 AI" (ba3b3d80-0cec-4c72-8910-2981b523be28, 72 sources)
  - deep-research workflow wf_34d79843-497 (22 sources fetched, 3-vote adversarial)
related: [fall-detection-datasets, streaming-windowing, fall-state-taxonomy]
---

# §1. 낙상 탐지 방법론 & 모델 지형도

> **이 문서의 위치:** research(=내가 찾은 사실)다. 결정하지 않는다. 옵션·근거·추천 후보만 제시하고,
> cross-cutting 결정은 사용자가 ADR로 확정한다(문서 말미 "ADR 후보" 참조).

## 0. 한 줄 요약 (TL;DR)

우리 자체 증거(per-frame pretrained 3종이 요양원 CCTV에서 fall/non-fall **양쪽 모두** 발화하며 붕괴)와
독립적인 웹 adversarial 리서치가 **같은 결론**에 도달했다: **문제의 본질은 모델 아키텍처가 아니라
도메인 갭**이다. 따라서 "어떤 모델이 정답인가"보다 **"어떤 접근이 우리 도메인(고령자 + 천장 탑다운)에서
검증 가능한가"**가 핵심 질문이다. 코퍼스는 pose→시계열(Transformer) 계열을 유력 후보로 제시하지만,
**그 어떤 아키텍처도 우리 도메인에서 1차 출처로 검증된 바 없다**(deep-research, 2/24 claim만 생존).

## 1. 우리의 출발점 — 왜 기존 pretrained가 붕괴했는가

### 1.1 관측된 붕괴
- 3종 pretrained(`melihuzunoglu` / `syed` / `tomotsugu`)는 모두 **per-frame RGB 이미지 분류기**.
- 요양원 CCTV(주로 천장 탑다운)에서 **fall 클립과 non-fall 클립 모두에 "fall"을 발화**.
  예: 502호 `syed` → fall 25/25 AND non-fall 25/25. **threshold 튜닝으로 분리 불가.**
- pose 오버레이는 현재 판정 로직과 무관(시각적 장식).

### 1.2 문헌이 설명하는 붕괴 메커니즘 (코퍼스로 직접 입증됨)
| 원인 | 설명 | 출처 |
|------|------|------|
| **원근 압축(foreshortening)** | 천장 탑다운에서는 사람 상체가 수직으로 찌그러져 짧게 보인다 | [NLM: BenAbdennour 2026 YOLOv11-Pose], [NLM: Real-Time YOLOv11 Pose .pdf] |
| **오류 연관성 학습** | per-frame 모델은 "상체 수직위치 낮음 = 낙상"을 강하게 학습 | 동일 |
| **정상 행동과 충돌** | 바닥에 스스로 눕기/앉기(=No-Fall)를 실제 낙상과 시각적으로 구분 못함 → 오탐 폭증 | 동일 |
| **시간정보 부재** | 단일 2D 프레임엔 3D 깊이·연속 운동학 단서가 없어 앵글 변화·self-occlusion에 취약 | [NLM: Real-Time YOLOv11 Pose .pdf] |

> 핵심: 우리가 본 붕괴는 모델 버그가 아니라 **per-frame + 탑다운 조합의 구조적 실패 모드**다.
> 문헌은 이를 대표적 false-positive 원인으로 명명한다.

## 2. 방법 계열 4종 — 장단점 & 탑다운 적합성

> **수치 읽는 법:** 아래 정확도는 대부분 **within-dataset(학습/평가 같은 도메인)** 수치다.
> deep-research의 교차도메인 검증에서 이런 수치들은 우리 도메인으로 일반화된다고 **확인되지 않았다**.

| 계열 | 대표 구조 | 보고 성능(within-dataset) | 장점 | 단점 | 탑다운 요양원 적합성 |
|------|-----------|---------------------------|------|------|---------------------|
| **A. per-frame RGB 분류** | YOLO 1-stage, CNN | yolov3 63% → 최신 mAP@.5 0.98+ | 빠름·엣지·저지연 | 조명/배경/시점에 민감, 시간정보 없음 | ❌ **우리가 붕괴 확인** |
| **B. pose→시계열** | YOLO/AlphaPose-Pose → LSTM/TCN/**Transformer** | YOLOv11-Pose+Transformer **97.96%**, 76.2FPS, 142MB VRAM, cross-dataset(Le2i) 91.65% | 외형변화에 강건, **프라이버시(골격만)**, 실시간 | 자세추정기 품질에 의존, 다단계 연산, 2D는 depth 손실 | ⭐ **유력**(단 탑다운 keypoint 정확도 미검증) |
| **C. 비디오 액션인식** | 3D-CNN, **ST-GCN**, VideoMAE | 3D-CNN 99.44%, ST-GCN ~100%(NTU/TST) | 시공간 통째 학습, 최고 정확도 | 막대한 연산/메모리, 대규모 시계열 데이터 필수 | △ 데이터·연산 부담 큼 |
| **D. 멀티모달** | Vision+IMU (GSTCAN+Bi-LSTM) | UP-Fall 99.09%, UR Fall 99.32% | 사각지대·조명 보완, 최고 신뢰도 | **웨어러블 → 노인 순응도/배터리/불편**, 복잡·고비용 | △ 요양원 웨어러블 도입 장벽 |

출처: A/B [NLM: HFD-YOLO], [NLM: YOLO-Fall Zhao 2024], [NLM: BenAbdennour 2026], [NLM: Raza pose ML→ViT];
B [NLM: ViT+LSTM Korea Univ], [NLM: Real-Time YOLOv11 Pose .pdf];
C [NLM: ST-GCN Keskes 2021], [NLM: Spatial-Temporal GCN 1801.07455];
D [NLM: Multimodal GSTCAN+Bi-LSTM], [NLM: Dual-Channel Feature Integration].

### 2.1 deep-research의 차가운 반대심문 (반드시 같이 읽을 것)
- "GCN이 per-frame보다 구조적으로 우월" → **0-3 기각** (출처가 주장을 뒷받침 못함). [Web: PMC12609388]
- "합성 시점 증강(2축 회전 27각도)으로 측면학습 모델을 탑다운에 적용 가능" → **0-3 기각**. [Web: PMC12609388]
- "staged↔in-the-wild 도메인 갭은 데이터 합산으로 줄지 않는다(임베딩 클러스터 분리)" → **0-3 기각**(수치 미확인이지 방향은 시사적). [Web: OmniFall 2505.19889]
- **해석:** "방법이 틀렸다"가 아니라 **"우리 도메인에 대해 1차 출처로 검증된 추천 아키텍처가 없다"**.
  → 아키텍처 선택은 **잠정**으로 두고 **자체 데이터로 검증**해야 한다.

## 3. 기존 자산 재사용 옵션

| 옵션 | 내용 | 평가 |
|------|------|------|
| **R1. pretrained 3종 그대로** | per-frame best.pt 재사용 | ❌ 붕괴 확인됨. 폐기 권고 |
| **R2. pose 백본만 재사용 + 시계열 헤드 신규** | YOLO26-pose(ADR-005)로 keypoint 추출 → LSTM/TCN/Transformer 헤드 학습 | ⭐ 시임(`ModelModule.predict`) 그대로 활용. 가장 현실적 |
| **R3. 비디오 파운데이션 모델 fine-tune** | VideoMAE 등 자체 클립으로 미세조정 | △ "소량(3~4k clip) fine-tune 가능" 주장은 **0-3 기각** → 데이터 요구량 미지수 [Web: 2203.12602] |

## 4. 추천 (research 추천 — 결정 아님)

1. **1순위 후보: B(pose→시계열) + R2 재사용 경로.** 이유: (a) 외형/조명/시점 강건성과 프라이버시,
   (b) 기존 YOLO26-pose 시임에 그대로 얹힘, (c) 코퍼스 내 최고 효율·실시간 근거(97.96%/76.2FPS).
2. **단, 무조건 전제:** keypoint 추출이 **천장 탑다운 극단 앵글에서 동작하는지 먼저 검증**해야 한다
   (deep-research openQ: ViTPose/RTMPose가 탑다운 foreshortening에서 17-keypoint를 신뢰성 있게 뽑는가?).
   → 이 검증 없이 B를 확정하면 per-frame 붕괴를 시계열에서 반복할 위험.
3. **C/D는 후순위.** C는 데이터·연산 부담, D는 웨어러블 순응도 장벽. 단 D의 "정적 fallen-state" 아이디어는
   §4 taxonomy로 흡수 가치 있음.
4. **모든 수치는 잠정.** 채택 전 **자체 in-domain 데이터셋**(→ `fall-detection-datasets.md`)으로 재측정.

## 5. 종합 & 데모 방향 옵션 (인덱스 없음 → 여기 모음)

세 문서(datasets/windowing/taxonomy)를 종합하면, 가장 정직한 로드맵은:

```
도메인 갭이 1차 문제  →  (a) 탑다운 keypoint 추출 검증  →  (b) 소량 자체 라벨 데이터 구축
                      →  (c) pose→시계열 헤드 학습  →  (d) 자체 holdout으로 검증
```

**데모 방향 옵션 (Streamlit 최소 데모로 무엇을 먼저?):**
| 옵션 | 데모 내용 | 노력 | 의사결정 가치 |
|------|-----------|------|---------------|
| **D1. Keypoint 가시화 데모** | 우리 탑다운 클립에 YOLO26-pose 올려 keypoint 품질을 눈으로 검증 | 낮음 | ⭐ B 채택 가능성을 즉시 판가름(가장 싼 risk-down) |
| **D2. per-frame vs pose-temporal 비교 데모** | 같은 클립에 붕괴(per-frame) vs 시계열 후보를 나란히 | 중간 | 붕괴 서사를 시각적으로 증명 |
| **D3. 라벨링 도구 데모** | 자체 클립 반자동 라벨링 UI | 중간 | 데이터 구축 병목 해소 |

→ **추천: D1 먼저.** 가장 적은 노력으로 1순위 후보(B)의 생사를 가른다.

## 6. ADR 후보 (사용자가 직접 결정 — cross-cutting)

- **ADR 후보 M1 — 1차 모델 계열 선택:** per-frame 폐기, **pose→시계열 채택 여부**. (기존 ADR-005 YOLO26-pose 시임 위에 시계열 헤드 추가하는 형태) → cross-cutting, 모든 후속 학습/서빙에 영향.
- **ADR 후보 M2 — "탑다운 keypoint 검증"을 모델 채택의 게이트로 삼을지.** 검증 실패 시 대체 경로(실루엣/depth/액션인식)로 분기하는 결정 규칙.
- **ADR 후보 M3 — pretrained 3종 폐기 공식화.** `ml/artifacts/pretrained/*`의 위상(폐기/baseline 보존).

## 부록 — 핵심 출처
- 코퍼스(낙관·within-dataset): YOLOv11-Pose+Transformer, ViT+LSTM, ST-GCN, GSTCAN+Bi-LSTM, HFD-YOLO 등.
- 웹(adversarial, 대부분 기각=미검증): PMC12609388(GCN/합성증강), OmniFall(2505.19889), 2203.12602(VideoMAE).
- **확정 사실(3-0):** 공개셋 도메인 미스매치 → `fall-detection-datasets.md` §확정 finding 참조.
