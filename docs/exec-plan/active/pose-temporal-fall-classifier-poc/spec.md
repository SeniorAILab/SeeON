---
slug: pose-temporal-fall-classifier-poc
status: approved
type: brownfield
generated: 2026-06-10
threshold: 0.05
threshold_source: ~/.claude/settings.json
final_ambiguity: 0.05
rounds: 7
---

# Deep Interview Spec: Pose-Sequence Temporal Fall Classifier (PoC)

## Metadata
- Interview ID: di-pose-temporal-fall-poc
- Rounds: 7
- Final Ambiguity Score: ~5%
- Type: brownfield
- Generated: 2026-06-10
- Threshold: 0.05 (5%)
- Threshold Source: ~/.claude/settings.json
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.96 | 0.35 | 0.336 |
| Constraint Clarity | 0.95 | 0.25 | 0.238 |
| Success Criteria | 0.96 | 0.25 | 0.240 |
| Context Clarity | 0.90 | 0.15 | 0.135 |
| **Total Clarity** | | | **0.949** |
| **Ambiguity** | | | **0.051** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 데이터셋 선택 | active | 시계열 분류기 학습용 공개 낙상 데이터셋 선정 | **UP-Fall** 선정(잠정), `docs/research/`로 최종 검증 후 ADR 분리 |
| 모델 아키텍처 | active | pose 시퀀스 → 낙상/비낙상 분류 모델 | **LSTM + Transformer + RandomForest 3종 비교**, rule-based 폐기 |
| 포즈 시퀀스 추출 파이프라인 | active | 공개 영상 → COCO-17 키포인트 시퀀스 → (X, y) 학습 샘플 | 윈도우 T=30/stride=5/50%겹침 라벨링/1인/0패딩 고정; RF용 feature 추출 갈래 포함 |
| Streamlit 데모 통합 | active | 학습된 Stage 2 분류기를 기존 데모에서 실행 | 사용자 추가 요구(2026-06-10). `ml/demo/` seam(`ModelModule`) 재사용, 슬라이딩 윈도우 버퍼 → 낙상확률/알림을 스켈레톤 오버레이와 함께 표시. artifact가 training↔demo 계약 |
| 자체 요양원 데이터 활용 전략 | **deferred** | 천장각 CCTV 파인튜닝/평가 전략 | 사용자 확정 deferral (2026-06-09). PoC 이후 별도 작업. ADR-005 도메인 미스매치 이슈 연계 |

## Goal
YOLO26-pose가 추출하는 COCO-17 키포인트 `(x, y, conf)` 시퀀스를 입력으로 받아 **낙상/비낙상 이진 분류**를 하는 **시계열 분류기(Stage 2)** 를 학습한다. 1차 목표는 **PoC** — "pose 시퀀스 → 낙상" 파이프라인이 원리적으로 동작함을 공개 데이터셋(UP-Fall)에서 증명하는 것. 전략은 **2단계**: ① 공개 데이터셋으로 학습/검증해 기반 확보 → ② (deferred) 자체 천장각 요양원 CCTV로 파인튜닝/배포. 모델은 **LSTM·Transformer·RandomForest 3종을 동일 조건에서 비교**한다.

## Constraints
- **라이선스**: PoC 목적이므로 연구용 라이선스(UP-Fall/LE2I 등) 허용. 엄격한 상업 배포 라이선스는 이번 범위 아님.
- **데이터 형태**: RGB 영상 + 프레임/구간 단위 낙상 annotation → **자체 포즈 추출**(기존 `ml/demo/yolo_runtime.py` 재사용). 학습 키포인트와 배포 키포인트가 동일 COCO-17이 되도록 보장.
- **윈도우(고정)**: T = 30 프레임(≈1.5s @ ~18fps), stride = 5 프레임.
- **라벨링 규칙(고정)**: 윈도우가 낙상 구간과 **50% 이상 겹치면 y=1**, 아니면 y=0.
- **활동→라벨 매핑(고정)**: UP-Fall 낙상 5종 → 낙상(positive) / 일상활동 6종 → 비낙상(negative). 표준 이진 설정.
- **인물 수**: 단일 인물 가정(UP-Fall 1인 시나리오). 다인 처리 비범위.
- **결측 키포인트**: conf 낮으면 0 패딩, 별도 보간 없음(PoC 단순화).
- **코드 배치(ADR-003 준수)**: 학습 루프·데이터 로더·포즈 시퀀스 추출 → `ml/training/`; 학습 산출물 → `ml/artifacts/fall-detector/{version}/`; 추론 stub 교체 → `ml/serving/model.py` (`FallDetector.predict()`).
- **의존성**: `ml/pyproject.toml`의 `training` 그룹에 torch 등 추가 필요(현재 empty).

## Non-Goals
- 자체 요양원 CCTV 데이터의 라벨링/파인튜닝/평가 (deferred 컴포넌트).
- 천장각/OOD 도메인 적응 (ADR-005가 식별한 문제 — PoC 이후).
- rule-based(종횡비·하강속도 휴리스틱) 분류기 — 명시적 폐기.
- 다인(multi-person) 트래킹/분류.
- 실시간 서빙 지연시간·FPS 최적화 (배포 단계 관심사).
- 절대 metric 목표치 합의 — 3종 상대비교로 대체.

## Acceptance Criteria
- [ ] UP-Fall RGB 영상에 기존 YOLO26-pose 추출기를 돌려 프레임별 COCO-17 키포인트 시퀀스를 생성한다.
- [ ] T=30/stride=5/50%겹침 규칙으로 `(X, y)` 윈도우 학습 샘플을 생성한다 (낙상5=1, 일상6=0).
- [ ] UP-Fall의 **subject-wise 표준 split**(피험자 단위 학습/검증 분리)을 적용한다 — 같은 사람이 train/test에 섞이지 않게.
- [ ] LSTM, Transformer, RandomForest 3종을 동일 split·동일 입력에서 학습한다. (RF는 윈도우에서 고정 길이 feature 추출)
- [ ] held-out test에서 **낙상 클래스 F1과 Recall**을 주지표로 3종을 비교한 표를 산출한다.
- [ ] 코드가 ADR-003 레이아웃(`ml/training/` 학습, `ml/artifacts/` 산출물)을 따른다.
- [ ] 데이터셋 최종 선정 근거가 `docs/research/{slug}.md`에 후보 비교(구조·시점·라이선스·규모)와 함께 정리된다.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "상용 YOLO dataset"이 필요 | 상업 라이선스인가, 그냥 기성품인가? | PoC라 기성/공개로 충분, 연구용 라이선스 허용 |
| 데이터셋이 `(pose, 낙상)` 형태로 옴 | 대부분은 RGB 영상 + 구간라벨; pose는 직접 추출 | RGB→자가추출 경로 확정 (배포 키포인트와 일치) |
| 프레임 단위로 낙상 예측 | 예측 단위는 윈도우; 프레임 라벨은 윈도우 라벨로 변환 | 50%겹침 규칙으로 프레임구간→윈도우라벨 변환 |
| LSTM/Transformer가 필수 (Contrarian) | PoC엔 더 단순한 baseline이 빠를 수도 | LSTM+Transformer+**RandomForest** 3종 비교로 확장, rule-based 폐기 |
| 이미 포즈 추출 중인데 왜 데이터셋이 필요한가 | 데이터셋은 pose가 아니라 **라벨+낙상 사례 수**를 제공 | 공개 데이터셋의 가치 = 정답표, 확정 |
| 윈도우 설정 미정 (Simplifier) | 가장 단순한 동작 설정은? | T=30/stride=5/50%/1인/0패딩 고정 |

## Technical Context (brownfield)
- **Stage 1 존재**: `ml/demo/yolo_runtime.py` `YoloPoseRunner.predict_full()` → COCO-17 `(x,y,conf)` (`PoseDetections` 타입, `seam.py:43`). 가중치 `ml/weights/yolo26{n,s,m,x}-pose.pt`.
- **Serving 계약 기성형**: `ml/serving/main.py:22` `window: list[list[float]]` — 시계열 윈도우 입력을 이미 받게 설계됨. `ml/serving/model.py`의 `FallDetector.predict()`가 교체 대상 stub.
- **Stage 2 부재**: `ml/training/__init__.py` empty, torch 미설치(`pyproject.toml` training 그룹 empty).
- **관련 ADR**: ADR-003(training/serving split·artifact 버저닝), ADR-005(YOLO26-pose 채택·천장각 검출 실패 25–73% OOD 이슈·시계열 분류기 deferral), ADR-007(`ml/weights/` 캐시·`ml/data/` 파생물 레이아웃).
- **데이터셋 후보 비교는 research 산출물로**: 갱신된 AGENTS.md의 `research → ADR → plan` 파이프라인에 따라, 최종 데이터셋 선택은 `docs/research/`에서 검증 후 ADR로 distill.

## NotebookLM 근거 (모델 준비 단계 — "요양원 낙상 보호 AI" 노트북 81 소스, 2026-06-10 질의)
사용자 요구에 따라 모델 준비 단계 권장사항을 프로젝트 NotebookLM에서 수집. 학습 기본 설정으로 채택:
- **정규화**: 프레임 W/H 기준 (x,y)→[0,1]; (강화안) 어깨중심 원점 이동 + trunk 길이로 스케일 → scale/position invariance. 입력 텐서 = 51차원/프레임 `(B, T, 51)`.
- **결측 처리**: spec은 0패딩 고정. **연구 권장은 직전 2프레임 선형보간 + 속도임계 보정 + 10Hz 저역통과** → 0패딩 유지(PoC), 보간은 fast-follow 옵션.
- **윈도우**: spec은 T=30/stride=5 고정. **연구 best는 T=60(~2s)/stride=15/subsample step=2 (Transformer F1≈0.95)** → 사용자 lock 유지하되 T/stride를 config 파라미터화해 둘 다 실행 가능하게.
- **클래스 불균형**: UP-Fall 비낙상:낙상 ≈ **3.5:1**. 오버샘플링 또는 **Focal Loss(α=0.5, γ=2)/class-balanced loss**. F1+Recall 보고, 임계치 고-recall 튜닝, PR-AUC 병행.
- **하이퍼파라미터 출발값**: Transformer d=256/L=3/H=4/FFN=256/dropout=0.1/AdamW lr=5e-4 wd=1e-5/batch=64, mean-pool+MLP head. LSTM 2층(128→64) 경량 / 512-hidden@lr=1e-2 변형. RF n_estimators=10(문헌 baseline, tunable)/min_samples_split=2/leaf=1/bootstrap=true.
- **RF feature**: 상체 6점 수평속도, centroid 수직 하강율, bbox 종횡비(직립 0.4–0.6 / 낙상 >1.0), 타원 tilt |sinθ|, head y-변위+std → 윈도우당 고정길이 통계벡터.
- **UP-Fall 주의**: 낙상 종료자세 ≈ 활동11 'Lying' 혼동 → 윈도우(비-프레임) + ≥50% 겹침 라벨링이 완화책. 'Picking up object'(ADL)는 최빈 오알람 → 음성셋 필수. 17 피험자, 2 카메라@1.82m(측면+정면).

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| PoseSequence | core domain | frames[T], keypoints[17]×(x,y,conf) | YOLO26-pose가 생성; Window로 슬라이싱 |
| Window | core domain | T=30, stride=5, label(0/1) | FrameAnnotation에서 라벨 파생; FallClassifier 입력 |
| FallClassifier (Stage2) | core domain | type∈{LSTM,Transformer,RandomForest} | Window 소비 → 낙상확률 출력 |
| FeatureVector | supporting | 윈도우→고정길이 통계 | RandomForest 전용 입력 |
| PublicDataset (UP-Fall) | external system | RGB영상, 활동라벨(낙상5/일상6), subject-wise split | FrameAnnotation 제공 |
| FrameAnnotation | supporting | 낙상 구간(프레임 범위) | Window 라벨의 근거 |
| Label | supporting | fall(1)/non-fall(0) | 활동→라벨 표준 매핑 |
| NursingHomeCCTV | external system | 천장각, 자체 footage | (deferred) 배포·파인튜닝 대상 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 5 | 1 (Label) | - | 4 | 80% |
| 3 | 6 | 1 (FrameAnnotation/Window 구체화) | - | 5 | 100% |
| 4 | 8 | 2 (RandomForest, FeatureVector) | - | 6 | 100% |
| 5–7 | 8 | 0 | 0 | 8 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (7 rounds + topology gate)</summary>

**Round 0 (Topology):** 범위 확정 → 데이터셋 선택 + 모델 아키텍처 + 포즈 시퀀스 추출 파이프라인 (자체 데이터 전략 deferred).

**Round 1 (Goal):** 최종 목표? → 둘 다 (학습은 공개 UP-Fall, 배포는 자체 CCTV). 2단계 전략.

**Round 2 (Constraints/license):** "상용"의 의미? → PoC라 동작 확인 우선, 연구용 라이선스 OK.

**Round 3 (Constraints/data form):** 데이터 구조 확인 질문 → RGB영상+구간라벨 형태 이해, UP-Fall(정확한 구간라벨+다시점) 선택.

**Round 4 (Contrarian/architecture):** baseline 우회? → LSTM+Transformer+RandomForest 3종, rule-based 폐기.

**Round 5 (Success Criteria):** 판정 지표? → 낙상 F1/Recall 중심.

**Round 6 (Simplifier/pipeline):** 윈도우 기본값 제안 → 그대로 고정 (T=30/stride=5/50%/1인/0패딩).

**Round 7 (Constraints/label mapping):** 활동→라벨? → 표준 (낙상5=1, 일상6=0).

</details>
