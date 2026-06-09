---
title: Pose→Classifier 낙상 데모 + VLM-보조 라벨링/autoresearch
slug: pose-classifier-fall-demo
type: spec
status: active
date: 2026-06-09
author: gobeumsu (deep-interview)
related: [fall-detection-methods, fall-detection-datasets, streaming-windowing, fall-state-taxonomy, vlm-assisted-dataset-construction]
---

# Spec — Pose→Classifier 낙상 데모 + 라벨링/autoresearch

> deep-interview 산출물(WHAT). HOW(단계/파일/순서)는 후속 plan(ralph/autoresearch)에서.
> research는 옵션 제시, 결정은 사용자. 이 spec은 사용자가 인터뷰에서 내린 선택을 고정한다.

## 0. 용어 (사용자 질문 정리)
- **frame**: 영상에서 디코딩된 단일 이미지 1장(`Frame{index, time_sec, image:RGB ndarray}`).
  per-frame 분류 = 1장만 보고 판정(→ 붕괴 원인). 시계열 모델은 **frame window**(연속 N장)를 본다.
- **conf (confidence threshold)**: 추론 후 결과를 거르는 후처리 임계값. 낮으면 더 많이 검출(과탐↑),
  높으면 적게(놓침↑). 현 pose 모듈 기본 0.05, YOLO 기본 0.25.

## 1. 미션
요양원 천장 탑다운 CCTV에서 **낙상을 탐지·분류**한다. 기존 per-frame pretrained 3종의 붕괴
(fall/non-fall 양쪽 발화)를 **pose→classifier 시계열 경로**로 대체하고, Streamlit 데모에서
**분류 모델을 드롭다운으로 선택**해 탑다운 상태를 눈으로 검증한다.

## 2. 확정 사실 (붕괴 원인 / 미스와이어 — 검증됨)
- **붕괴 원인 = 도메인 갭(H1).** per-frame + 탑다운 원근압축 → "압축 실루엣=낙상" 오학습.
  미스와이어(아래)는 사실이나 붕괴를 설명하진 못함(대칭적·부차적).
- 미스와이어 팩트: (a) `frame_source.py:57` BGR→RGB 변환(대칭, 무해 수준), (b) pose 모듈 conf=0.05,
  (c) serving `/predict` = placeholder `min(1.0, len(window)/100)` — 어떤 모델과도 미연결.
- pretrained 3종 통합 코드는 이미 삭제됨(`ml/artifacts/pretrained/` 부재).

## 3. 아키텍처 (고정)
```
FrameSource → YOLO26-pose (keypoints + bbox) → feature 추출 → [선택된 classifier] → fall/no-fall
                                                                 (DetectionResult 계약 유지)
```
- pose estimation은 지금처럼 **YOLO26-pose** 유지. 그 출력값을 classifier가 소비.
- **feature = pose keypoints(COCO-17, x/y/conf) + bbox 기하**(aspect ratio, 수직중심, 속도, 지속-down).
- 현재 keypoints는 오버레이(`yolo_overlay.py:55`)만 소비 → classifier 소비자 신설(이 작업의 핵심 시임).

## 4. Streamlit 데모 변경 (ralph 담당)
1. **분류 모델 드롭다운**을 영상 선택창 **하단**(app.py:43–50 사이)에 추가.
2. **공통 조절 파라미터 노출 버튼/패널** 추가 — 모델 공통으로 조절하는 값을 사용자가 직접 보고 조절:
   - 최소: `conf`(임계값), window 길이, stride, sustained-down N초.
   - 탑다운 상태 확인 의도에 맞춰 즉시 반영(슬라이더/입력).
3. 기존 YOLO26-pose size 셀렉터·boxes/pose 체크박스 유지.

## 5. 드롭다운 모델 목록 + 필터링 규칙 (확정)
**적용 기준: pose→classifier(keypoints+bbox 입력) 아키텍처에 얹히는 모델만. 드롭다운 = 우리 모델만.**

| 모델 | 입력 | 라벨 | 데이터 필요 | 상태 |
|------|------|------|-------------|------|
| **Rule-based(규칙기반)** | keypoints+bbox | binary | 불필요(즉시) | v1 기본, evaluator 한 축 |
| **Random Forest** | feature 벡터 | binary | 필요(라벨) | autoresearch 학습 |
| **LSTM** | frame window 시퀀스 | binary | 필요 | autoresearch, "dataset 가능하면" |
| **Transformer** | frame window 시퀀스 | binary | 필요 | autoresearch, "dataset 가능하면" |
| ~~per-frame pretrained 3종~~ | RGB 이미지 | 타 라벨 | — | **완전 제외**(아키텍처 불일치+붕괴) |

- **드롭다운 = 우리 모델만**(전부 binary fall/no-fall). 사용자 결정: "다른 연구자 라벨 모델" 요구는 폐기 —
  유일한 타 연구자 모델(per-frame 3종)이 pose→classifier 시임에 불일치하고 붕괴하므로 제외.
  baseline 병존/문헌 모델 확보도 하지 않음(검증 목표와 정렬).
- v1 진입 시 즉시 가용 = 규칙기반. RF/LSTM/Transformer는 **라벨 확보 후**(§6) 점진 추가(게이트 조건부).

## 6. 라벨링 파이프라인 (autoresearch 담당, 사용자 핵심 아이디어)
- **문제**: 사전 라벨 없음. **해법**: Claude(VLM/멀티모달)가 프레임을 보고 낙상 타이밍을 식별 +
  규칙기반 라벨러 병행 → **불일치(disagreement) 기반 라벨링**.
  - 규칙기반 ∧ Claude **일치** → pseudo-label 자동 채택.
  - **불일치** → 사람(사용자) 검수 → gold anchor로 승격.
- **gold anchor(사람 검수, 이미 확보)**: `./gold-labels.md`의 **8개 클립 onset**.
- **라벨 스키마(확정)**: **onset + 지속**. onset 초부터 "클립 끝 또는 일어난 시점"까지 fall=1,
  이전은 0. 레코드 `{clip, onset_sec, end_sec?}`. 근사 onset("즈음")은 evaluator 매칭에 tolerance(±초).
- 방법론 상세는 `docs/research/vlm-assisted-dataset-construction.md`(작성 중)로 분리.

## 7. autoresearch (자율 dynamic workflow)
- **프롬프트 없이 자율 실행** — dynamic workflow로 subagent fan-out.
- 역할: §6 라벨링 부트스트랩 → RF/LSTM/Transformer 학습·튜닝 루프 → 윈도우 sweep({15,30,60,90}f).
- pose 백본 freeze + 시계열/분류 헤드 학습(R2 경로).

## 8. Evaluator (확정)
- **규칙기반 vs Claude 교차검증.** 두 판정이 일치하면 통과, **불일치만 사람이 검수**.
- gold 8개 클립은 truth source — 규칙기반/Claude가 onset±tolerance에서 맞히는지 1차 검증.

## 9. 범위 밖 (사용자 확인)
- **serving `/predict`는 건드리지 않음.** 검증은 데모 경로로 수행. placeholder 유지.
- 공개 데이터셋 학습(보조), 다중클래스 taxonomy 확장(binary 과탐 관측 시에만).

## 10. 실행 분담
- **ralph**: §4 UI(드롭다운+공통 파라미터 패널), §3 pose→classifier 시임/feature 추출,
  규칙기반 분류기 배선.
- **autoresearch**: §6 라벨링, §7 RF/LSTM/Transformer 학습 루프.

## 11. ADR 후보 (사용자가 직접 결정 — 실행과 별개)
- T1 라벨셋(binary 확정?), W1 윈도우 정책, D1 자체데이터 1차화, D2 라벨링 프로토콜,
  D3 프라이버시(골격화), M1 pose→시계열 채택, 신규: VLM-라벨러 채택/evaluator 교차/gold 거버넌스.

## 12. 인수 기준
- 데모에서 영상 하단 드롭다운으로 모델 선택 가능, 공통 파라미터 조절 패널 동작.
- 규칙기반 모델이 gold 8개에서 onset±tolerance 발화(1차 sanity).
- pose keypoints가 classifier로 실제 흐름(오버레이 전용 아님).
- per-frame pretrained는 드롭다운에서 제외(필터링 근거 명시).

## 13. 모호도 평가 (≤ 5% 달성)
해소된 cross-cutting 선택: 라벨 스키마(onset+지속), 드롭다운 구성(우리 모델만), evaluator(규칙 vs Claude 교차),
실행 분담(ralph+autoresearch), serving 제외, gold anchor(8 클립).
설계상 의도된 미정(실행 중 데이터로 해소 — 차단 아님):
- LSTM/Transformer 실현은 라벨 규모 의존 → autoresearch가 "dataset 가능" 판정 후 게이트 통과 시 포함.
- 윈도우 최적값 → 자체 데이터 sweep({15,30,60,90}f)로 확정.
- end_sec 미기재 클립 → 클립 끝까지 fall=1 (요양원 특성 가정, 사용자 묵시 동의).
→ **추정 잔여 모호도 ≤ 5%. Phase 5 실행 브리지 게이트 충족(승인 대기).**
