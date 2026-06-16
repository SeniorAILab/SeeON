---
title: 적대적 리뷰 — "내가 처음부터 이 repo에서 낙상 탐지를 설계한다면" (red-team + counterproposal)
slug: adversarial-fall-detection-redesign
type: research
status: active
date: 2026-06-12
author: gobeumsu (autoresearch mission adversarial-fall-detection-redesign)
grounds_on:
  - repo-state 매핑 에이전트 (47개 소스 파일: ml/experiments, ml/training, ml/demo, ml/serving, docs/decisions, docs/research)
  - red-team 에이전트 (12개 공격, 전부 repo 증거 기반 file:line 인용)
  - SOTA 웹 리서치 에이전트 (18 검색 + 14 원문 fetch, 2024–2026)
  - NotebookLM "요양원 낙상 보호 AI" 기존 78소스 적대 질의 + deep research 73소스(68개 임포트) 종합 리포트
related: [fall-detection-methods, fall-detection-datasets, fall-state-taxonomy, per-frame-vs-temporal-fall-judgment, streaming-windowing]
---

# 적대적 리뷰 — 현재 낙상 탐지 파이프라인 공격 + 처음부터 설계한다면의 선택지

> research 문서. 현재 파이프라인(YOLO26n-pose → COCO-17 정규화 키포인트 → T=30/stride=5 윈도우 →
> 6개 패밀리 분류기, LE2I P@R90 게이트 + NH 19클립 회귀 게이트)을 **적대적 관점**에서 공격하고,
> 독립 설계자가 같은 제약(천장 CCTV, M1급 하드웨어, 프라이버시) 아래 처음부터 설계할 때의
> 선택지를 사실 수집 형태로 정리한다. **결정은 하지 않는다** — 옵션과 근거만 제시한다.

## 0. 한 줄 요약 (적대 리뷰의 핵심 발견)

**가장 큰 미탐(missed-fall) 리스크는 분류기가 아니라 그 위아래에 있다.** 위로는 pose detector가
낙상 직후의 "바닥에 누운 사람"을 구조적으로 놓치고(ADR-025: Room 502 검출률 25%, ADR-009: 낙상 후
무검출 113프레임), 그 실패가 zero-frame으로 변환되어 분류기에 **무음으로** 흘러든다. 아래로는
serving이 스텁이고 알림 경로가 미구현이라 end-to-end "낙상 → 사람에게 통지"가 한 번도 검증된 적이
없다. 분류기 leaderboard(LE2I P@R90)는 이 두 리스크를 **측정 자체를 못 한다** — repo 스스로
확인했듯 LE2I 1위(logreg 0.4483)가 NH에서 6/19, LE2I 3위(gcn 0.3291)가 18/19로 랭킹이 완전히
뒤집혔다 (`ml/experiments/analysis/phase3-step2-nh-threshold-policy.md`).

외부 문헌도 같은 방향이다: OmniFall(arXiv 2505.19889)은 staged 데이터셋에서 ~100% 정확도를 찍는
모델들이 실제(wild) 낙상에서 "massive drop"을 보임을 벤치마크로 보였고, SafelyYou의 실환경 검증
연구는 민감도 82%(50낙상 중 41검출)에 최악 케이스가 정확히 **"침대에서의 느린 미끄러짐"**이라고
보고한다 [PMC12761293].

## 1. 현재 파이프라인 실태 (공격 대상의 스냅샷)

상세 데이터 플로우·feature 정의는 repo-state 매핑 결과 기준 (2026-06-12, main@55c3bc7).

- **플로우**: Frame → `YoloPoseRunner` (yolo26n-pose, conf=0.05) → `GreedyIouTracker` (IoU-only,
  min_iou=0.3, max_misses=30) → `normalize_person_keypoints` (frame 크기로 [0,1] 정규화) →
  track별 deque(30) — **미검출 프레임은 zeros[17,3] 주입** (`ml/demo/temporal_module.py:228-233`) →
  stride 5마다 45-dim feature 또는 [30,51] 시퀀스 → `predict_proba` → `metadata.json`의
  LE2I-보정 `operating_threshold` 비교 → per-person FALL/NORMAL 라벨. 집계·알림 정책 없음.
- **Champion (LE2I P@R90)**: logreg-C1000 0.4483 (threshold 0.9827 — 마지막 스텝 knife-edge,
  svm과 bootstrap 통계적 동률) > svm 0.4407 > gcn 0.3291 > transformer 0.2574 > rf 0.1383.
- **NH 19 확정 낙상 (보정 threshold)**: gcn 18/19 @0.30, transformer 18/19 @0.133, rf 15/19
  @0.20, logreg 6/19 @LE2I op (상한 17/19 @0.10), svm 상한 ≤11/19 — 후보 제외.
- **미구현**: event-level 평가(ADR-017 follow-up 1), NH reference mask(게이트 un-armed),
  serving 실모델(`serving/model.py:41` = `min(1.0, len(window)/100)` 스텁), 알림 경로(KakaoTalk
  research-only), 멀티인 집계 정책, bed/floor 구분(fall-state-taxonomy §3).

## 2. 적대적 공격 12선 (전부 repo 증거 기반)

각 공격의 전체 시나리오·인용은 red-team 에이전트 산출 기준. 심각도순.

| # | 공격 | 심각도 | 근거 |
|---|------|--------|------|
| 1 | **낙상 직후 YOLO dropout → zero-buffer 범람**: 바닥에 누운 사람을 detector가 놓치면 버퍼가 zeros로 차고, LE2I에서 zero-프레임이 희소했던 분류기는 OOD 입력을 non-fall로 처리. 미탐이 **무신호**로 발생 | 미탐·체계적 | ADR-009 (305호 113·506호 53 무검출 프레임), ADR-025 (Room 502 25%), `temporal_module.py:228-233` |
| 2 | **와상(bedridden) 환자는 낙상 전부터 구조적으로 비가시**: track 자체가 없으면 빈 `DetectionResult()` 반환 — "고위험자 track 소실"이라는 개념이 없음 | 미탐·체계적 | ADR-025 (Room 301 51.3%, 502 25%), `temporal_module.py:277` |
| 3 | **LE2I threshold가 NH로 전이 안 됨**: 출하 기본값 = LE2I 보정값. logreg 0.983 → NH 6/19. NH 재보정 메커니즘이 아키텍처에 없음 | 미탐·운영 | `evaluate.py:287`, phase3-step2 |
| 4 | **알림 체인이 스텁**: serving dummy + backend 알림 미구현 — 실배포 시 알림 0건. Streamlit 데모는 사람이 화면을 봐야 하는 경로 | 미탐·배포 | `serving/model.py:32-41` |
| 5 | **LE2I P@R90이 NH catch와 역상관**: 40회 실험의 최적화 압력 전부가 "side-view 배우 영상의 FP 윈도우 수 줄이기"에 소비 (top-3 모두 LE2I 8/8 이벤트 검출 — 순위차는 FP 수 차이일 뿐) | 모델 선택 오류 | phase3-step1, HUMAN_QUEUE ("LE2I-only adoption would have picked the wrong model") |
| 6 | **NH 19클립 통계 착시**: ±11pp SE + BORDERLINE 3건 + no-fall 4편뿐인 FP 측정 — gcn@0.30 vs rf@0.20 비교는 현재 코퍼스로 분해능 부족 | 거버넌스 | ADR-017, ADR-019 |
| 7 | **느린 낙상·경계 낙상의 지연**: overlap≥0.5 계약상 최초 양성 윈도우는 onset +15프레임 이후, stride 격자까지 더하면 ~1.1s. 느린 bed-slide는 학습된 시그니처 자체가 아님 ("Misses cluster on slow bed-slides") | 미탐·시간축 | ADR-013, HUMAN_QUEUE; SafelyYou도 동일 최악 케이스 [PMC12761293] |
| 8 | **IoU-only 트래커 identity switch**: 간호사 박스가 입주자 track을 탈취하면 pre-fall 버퍼 오염 + 상대 track 오경보. track 소실→재생성 시 30프레임 warm-up 동안 하드코딩 non-fall (`_last_probs` 0.0) | 미탐+오탐 | `tracking.py:74`, `temporal_module.py:282` |
| 9 | **Autoresearch 루프의 Goodhart 함정**: 루프는 28개 LE2I 양성 윈도우만 보므로 blanket occlusion·threshold 전이·야간 IR 실패를 **구조상 발견 불가** | 시스템적 | ADR-020, ADR-017 |
| 10 | **카메라 기하 고정**: frame-크기 정규화는 카메라 높이·각도 차이를 흡수 못 함 — 새 시설/새 방에서 feature 분포가 무음으로 이동 | 미탐·무음 열화 | `extract_poses.py:111`, `features.py:97-150` |
| 11 | **`propose_nh_gold.py` min-len 절단 버그**: 모든 track을 최단 track 길이로 절단 → 영상 후반 낙상이 제안 단계에서 비가시 → 오염된 "확정 음성"이 gold에 유입 | 라벨 오염 | HUMAN_QUEUE ultracode ③ (미수정) |
| 12 | **overlap 0.5 계약이 경계 낙상을 학습에서 배제**: 15–20프레임짜리 빠른 낙상은 양성 학습 윈도우가 0개일 수 있음 (이벤트당 평균 ~3.5 윈도우) | 미탐·학습 데이터 | `windowing.py`, ADR-013 |

NotebookLM 기존 78소스 질의도 독립적으로 #1·#5·#7·#10을 재확인했다: top-down foreshortening이
"앉기/눕기를 낙상으로 오인"시키는 주 실패 모드라는 것, 도메인 시프트 시 민감도 100%→80% 폭락
사례(Sabatini 외부검증), skeleton-only가 "침대 위 눕기 vs 바닥 쓰러짐"의 컨텍스트를 잃는다는 것,
window-level 평가가 event-level 탐지·알람 지연을 반영하지 못한다는 것.

## 3. 외부 증거 — 2024–2026 문헌·배치 사례가 말하는 것

### 3.1 Top-down은 문헌의 공백이고, 메우는 자원이 막 나왔다

- 천장 카메라 각도에서 skeleton 기반 낙상 탐지를 벤치마크한 2024–2026 논문은 **사실상 없음**
  (전용 overhead 연구는 2018 Kinect depth+SVM, 98.6%, 천장 3m [PMC6021973] 정도).
- **NToP570K** (arXiv 2402.18196): NeRF로 생성한 **천장 fisheye 시점 57만장** + GT 키포인트.
  ViTPose를 이걸로 학습하면 overhead 키포인트 추적이 동작 — COCO-trained pose의 top-down 공백을
  직접 겨냥한 유일한 대규모 자원. 공격 #1·#2의 상류(detector) 보강 경로.
- VIRA-GCN의 회전 증강은 수평축 최대 25°까지만 — 천장각(60–90°)에 못 미침 [PMC12609388].
  repo의 기존 결론("synthetic viewpoint augmentation enables top-down transfer → 기각",
  fall-detection-methods.md)과 일치.

### 3.2 Staged→wild 갭은 벤치마크로 정량화되어 있다

- **OmniFall** (arXiv 2505.19889): 8개 staged 데이터셋(Le2i 포함)을 frame-level 단일 분류 체계로
  통합 + OOPS-Fall(실제 사고 1,300 세그먼트, test-only). staged 시험셋에서 ~100%인 I3D/VideoMAE가
  wild에서 "massive drop". **staged→wild 갭이 synthetic→wild 갭보다 넓다** — 잘 설계된 합성
  데이터가 연출 실사보다 일반화가 낫다는 주장. LE2I P@R90을 1차 축으로 쓰는 현 계약(공격 #5·#9)에
  대한 외부 정량 근거.
- OmniFall의 **16-클래스 분류 체계**는 transient action(fall/sit/lie down)과 persistent state
  (fallen/sitting/lying)를 분리 — 낙상 *순간*이 가려져도 *fallen 상태*로 탐지 가능. 공격 #1·#7의
  대응 패턴이며 repo의 fall-state-taxonomy 연구와 같은 방향.

### 3.3 실배치 시스템은 전부 "분류기 단독"이 아니다

| 시스템 | 센싱 | 접근 | 공개 수치 |
|--------|------|------|----------|
| SafelyYou | 천장 RGB | 독점 비전 AI + **원격 인간 검증팀** | 민감도 82% / 특이도 93.2% (외부 검증, n=100) [PMC12761293]; TUA 35.3→7.0분 [PMC8277400]; fleet FP ~센서당 2년에 1건 |
| Kepler Night Nurse | Hikvision **fisheye** 6/12MP | **skeleton 없음** — lying-on-floor/sitting/out-of-bed 상태 분류 (GDPR 설계) | 낙상 알림 10s; Oktober 9개월: 기존 센서 2,195건 FP vs 9건; "3개월에 FP 1건" (자사 fleet 평균); EU 의료기기 인증 |
| Nobi | 천장 조명 내장 카메라 (태생적 top-down) | person-on-floor + 음성 체크인("도움 필요하세요?") + 인간 검증 포털 | 낙상 31% 감소 (46.85→32.14/1,000일), 응답 3분56초 |
| AltumView Sentinare | 엣지 stick-figure만 전송 | 2025년 **VLM 검증 단계** 추가 | 중앙 4m 80% → fisheye 가장자리 <40% (제품 리뷰); 느린 낙상 FN·가장자리 squat FP |
| Vayyar | 60GHz 레이더 (무카메라) | presence/fall, 침대 높이로 bed-lie 구분 | 침실·욕실 프라이버시 전면 해결 |

공통 패턴 세 가지: (a) **fallen-state 탐지**가 fall-action 분류보다 우선, (b) 알람 전 **2차
검증 레이어**(인간 또는 VLM), (c) top-down을 쓰는 곳은 fisheye + 전용 학습. "pose → 윈도우 →
분류기 단독 → 즉시 알람" 구조를 그대로 쓰는 상용 배치는 발견되지 않음.

### 3.4 평가 방법론 — window-level의 대안은 표준화되어 있다

- **event-level**: 인접 양성을 "alarm event"로 묶고, 명목 스트림에서 **FAE 예산**(예: 시간당
  0.1건) 하에 missed-incident rate 측정 + duty-cycle cap (BELE). frame/window F1이 높아도
  짧은 오경보 burst가 흩뿌려지면 운영 불능.
- **mTTD** (fall onset → 알림): SafelyYou 수초, Kepler 10s, Nobi ≤90s가 현장 기준선.
- **알람 피로 정량**: 병원/요양 환경 교대당 평균 1,000 알람; 기존 모션센서·베드매트 FP율 72–99%;
  운영 가능 수준의 통용 목표는 입주자·일당 FP <2건. 현재 gcn@0.30의 NH FP-윈도우율 10.5%가
  실제 알람 정책(집계·디바운스) 통과 후 몇 건/일이 되는지는 **미측정** — 비교 자체가 불가능한 상태.

### 3.5 그 외 도구 수준의 진전

- **RTMPose-m**: COCO 75.8% AP @ 430+ FPS (GTX 1660 Ti) — pose 상류 교체 후보.
- **YOLO → SAM 2 mask → Kalman(Norfair) 궤적**: 가구·이불 occlusion 통과 추적의 현행 SOTA 조합
  (공격 #8 트래커의 대안 계열).
- **VLM 낙상 검증**: zero-shot 92.5% (contrastive prompt bank), frozen 임베딩 + 선형분류기로
  few-shot 100% (control set, U. Hertfordshire — n 미상, 주의). 단 VLM 추론 100ms–4s/frame로
  1차 탐지기로는 부적합, **2차 검증기**로만 현실적. 로컬 sub-5B 모델이 완화 전략.
- **시설-로컬 비지도 이상탐지**: ADL만으로 학습한 autoencoder, IR에서 AUC 0.94 (MUVIM) —
  라벨 없는 배포 시설 영상 2–4주로 top-down 도메인 갭을 정면 우회.

### 3.6 2-stage VLM 검증 심층 추적 (2026-06 기준, Option D 보강 증거)

후속 질문 "2차 검증은 최신 연구에서 어떤가(2026 기준)"에 대한 추가 수집. 5각도 웹 리서치
(케스케이드 논문 / 엣지 VLM 실측 / 추론·라우팅 / 반대 증거 / 상용·규제) + NotebookLM 교차질의.

**케스케이드는 2025H2–2026 학계 주류로 진입 (일반 VAD 기준)**
- **Cerberus** (arXiv:2510.16290, 2025-10): CLIP 1차가 프레임 95–99% 차단, 의심분만
  Qwen2.5-VL-7B 2차. 단일 VLM 대비 **151.79× 속도**, 4개 데이터셋 평균 AUC 97.24%.
  Ablation(ShanghaiTech): coarse-only 67.85 / VLM-only 84.24 / 케스케이드 82.73 AUC에
  VLM-only 대비 21× 처리량. 단 2차 호출 1회 = 8.48s/17.9GB (L40S 서버 GPU 기준).
- **Vad-R1** (arXiv:2505.19877): 구조화 CoT(Perception→Cognition)를 검증에 넣으면 동일
  Qwen2.5-VL-7B에서 Recall 0.431→0.696(+61.5%), F1 +22.3% — 2차가 FP 감소만이 아니라
  recall 개선도 가능하다는 가장 강한 정량 근거.
- 계보: LAVAD(CVPR'24, training-free) → VERA(CVPR'25) → ASK-Hint(arXiv:2510.02155,
  행동 중심 세밀 프롬프트로 UCF-Crime AUC 67.17→89.83) → MoniTor(NeurIPS'25, 온라인
  스트리밍) → Cascading Multi-Agent(arXiv:2601.06204, 적응형 에스컬레이션 임계) →
  VANGUARD(arXiv:2605.02912, UCF-Crime ROC-AUC 94%/F1 84%).
- **공백**: "낙상 전용 탐지기 단독 vs +VLM 검증기"의 통제 비교는 미발표. 요양원 top-down
  CCTV에서 VLM을 벤치마크한 논문도 전무. miss-amplification(2차가 진짜 낙상을 기각하는
  비율) 정량화도 peer-review 문헌에 없음 — 비공식 업계 블로그의 "FP −48% / TP −15%"가
  유일한 데이터 포인트 (신뢰도 낮음).

**엣지 VLM 실측 — M1 16GB 직접 수치는 부재**
- vllm-mlx (arXiv:2601.19139, M4 Max 128GB, Q4): Qwen3-VL-4B 10초 클립 32프레임 = 9.4s.
  Moondream 2(1.8B): Mac mini M2 24GB에서 0.79 req/s (이미지 단건). SmolVLM2-256M:
  Jetson AGX Orin에서 150ms/이미지. Qwen2.5-VL-3B: Jetson Orin Nano 8GB에서 VQA ~4s.
- M1 16GB의 비디오 추론 공식 벤치마크는 2026-06 현재 미발표. M4 Max 대비 메모리 대역폭
  ~3–4× 차이로 외삽 시 sub-5B 모델도 클립당 수~수십 초 예상 — "드물게만 호출" 전제 필수.

**라우팅(어떤 이벤트를 2차로 보낼지)**
- arXiv:2502.11021: **verbalized confidence(모델 자가보고 확신도)는 라우팅 신호로 부적합**,
  probe/perplexity 기반 불확실성이 유의하게 우월. ~25% 샘플만 상위 모델로 보내도 전체
  정확도 개선. Medical VQA 보정 연구(arXiv:2604.02543)도 동일 결론 — VLM 과신은 전 규모
  공통이고 RLHF가 보정을 악화시킴. → "VLM 확신도 >0.9면 알림" 식 설계는 근거 없음.
- ALARM(arXiv:2512.03101, NeurIPS'25 ws): 단계별(이해→분석→반성) 불확실성 분해 + 앙상블,
  스마트홈 실데이터 평가 — 검증 단계 라우팅의 최신 패턴.

**반대 증거 (2차 검증의 위험)**
- 비디오 환각 벤치마크 급성장: VidHalluc(5,002 비디오, 시간적 환각 3축), VideoHallu(물리/
  논리 위반 미감지), VERHallu(사건 간 인과·시간 관계 오추론 — "낙상 원인" 오귀속과 직결),
  DIQ-H(열화 프레임 연쇄에서 환각 지속). Qwen2.5-VL 포함 전 모델 해당.
- 소형 모델 한계: Edge Reliability Gap(arXiv:2603.26769) — SmolVLM2-500M은 부정형 질문에
  100% "Yes" (negation collapse). 단 COCO 부정형 프로브이지 실제 CCTV 벤치마크는 아님.
- "Are MLLMs Ready for Surveillance?"(arXiv:2603.04727): 실서베일런스에서 랩 벤치마크 대비
  성능 갭 보고. 다중 프레임 입력이 오류를 증폭할 수 있음(arXiv:2601.07812).

**상용·규제 (2025H2–2026)**
- AltumView가 유일한 VLM 낙상검증 상용 사례 (2025-04 Phase 1, 2025-05 beta firmware
  2.0.555 — 성능 수치는 마케팅 주장, 검증 불가). Nobi €35M Series B(2025-01), Kepler
  91개 네덜란드 시설/15,000+ 시니어 — 둘 다 VLM 비사용.
- EU AI Act: 케어 환경 환자 모니터링은 high-risk. Article 14 인간 감독 의무 — 자동 검증
  단계가 있어도 적용. 전면 시행 2027-08-02. FDA AI-SaMD lifecycle 가이던스 초안 2025-01.

**성숙도 판정 (사실 종합, 결정 아님)**: 일반 VAD에서의 케스케이드 구조는 *검증됨*에 근접.
요양원 낙상이라는 본 도메인 적용은 *유망하나 근거 얇음* — top-down CCTV 벤치마크 부재,
M1급 실측 부재, miss-amplification 미정량이 3대 공백.

**인용 수 캐비엇 (Semantic Scholar, 2026-06 확인)**: 케스케이드 *방향성*은 잘 인용된
기반(LAVAD 102회, Holmes-VAD 71회, VidHalluc 65회, VERA 19회, Vad-R1 15회) 위에 있으나,
본 절의 구체 수치 다수는 인용 5회 미만 프리프린트 출처다 — **Cerberus 0회**(151.79×/AUC
82.73 수치의 유일 출처), VANGUARD·VERHallu·Edge Reliability Gap·Cascading Multi-Agent
각 0회, vllm-mlx 2회, ALARM 2회. 2026년 1–4월 논문은 인용 누적 시간이 없어 venue가 더
나은 신호(ASK-Hint WACV'26, MoniTor NeurIPS'25는 심사 통과). 0–2회 프리프린트의 수치는
단일 미재현 보고로 취급할 것.

## 4. "처음부터 설계한다면" — counterproposal 선택지 (결정 아님)

각 옵션이 §2의 어느 공격을 무력화하는지 명시. 옵션은 상호 배타가 아니다 (특히 E는 모두와 직교).

### Option A — 현 파이프라인의 상·하류 보강 (pose 유지, 매몰비용 최소)

분류기는 그대로 두고 공격 지점만 막는다: NToP570K-학습 pose로 상류 교체(#1·#2 부분), 연속
zero-frame을 "detection-lost" 명시 신호로 분리해 별도 룰 알람(#1), `metadata.json`에
`nh_operating_threshold` 필드 추가(#3), min-len 버그 수정(#11), event-level 평가 코드(#5·#7).
- 트레이드오프: 가장 싸지만 LE2I 1차 축(#9)과 skeleton-only 컨텍스트 손실(#10, bed/floor 구분)은
  남는다. 40회 실험·결정적 하니스(ADR-020) 자산을 전부 보존.

### Option B — Fallen-state 우선 아키텍처 (OmniFall 분류 체계 / 상용 패턴)

fall *action* 분류 대신 **fallen *state*(person-on-floor) + 지속시간 게이트**를 1차 신호로,
기존 temporal 분류기를 보조 신호로 강등. track 소실 자체를 양성 신호로 취급("30초 전에 있던
사람이 사라졌고 방이 비지 않았다" → 점검 알람)하면 #1·#2가 미탐에서 **fail-safe**로 바뀐다.
- 무력화: #1, #2, #7 (느린 낙상도 결말은 같은 fallen state), #12. 상용 3사(SafelyYou·Kepler·
  Nobi)가 모두 이 형태라는 외부 증거.
- 트레이드오프: bed-lie vs floor-lie 구분에 floor ROI 또는 깊이 단서 필요 (fall-state-taxonomy
  §3의 미해결 문제를 정면으로 떠안음); "쓰러진 사람" 검출 자체가 top-down에서 학습 필요(NToP /
  fallen-person object class).

### Option C — End-to-end 경량 비디오 분류 (MoViNet/X3D + 합성 overhead 사전학습)

pose 중간 단계를 제거 — overhead에서 "바닥의 사람"은 픽셀 패턴으로는 선명하므로 pose estimator
실패 모드(#1·#2·#10)를 원천 제거. OmniFall-Synthetic/UnrealGenSyn으로 overhead 사전학습 →
시설 영상 fine-tune. MoViNet stream-buffer는 M1급에서 실시간.
- 트레이드오프: RGB 직접 처리 = 프라이버시 부담 상승(엣지 처리 필수), 설명가능성 하락, 기존
  키포인트 캐시·45-dim feature 자산 폐기. 학습 데이터 요구량이 가장 큼.

### Option D — 2-stage: 경량 1차 탐지 + 로컬 VLM 검증 (AltumView 2025 패턴)

현 파이프라인(또는 B)을 recall 전용으로 튜닝해 의심 이벤트를 양산하고, 로컬 양자화 VLM이 클립을
보고 확인/기각 후 알림. "간병인이 무릎 꿇음 vs 입주자 쓰러짐" 같은 컨텍스트 FP를 거른다.
- 무력화: #3 (1차는 hot threshold 허용), 오탐 측 전반 — FAE 예산 충족의 가장 직접적 경로.
  zero-shot 92.5% 근거. 알림 지연 +1–3s는 Kepler 10s 기준 내.
- 트레이드오프: 1차가 못 잡은 미탐(#1·#2)은 VLM도 못 본다 — 미탐 공격에는 무력. 2-stage 복잡도,
  VLM의 overhead 시점 학습 데이터 부족.

### Option E — 시설-로컬 비지도 이상탐지 (직교 보강)

배포 시설 천장 카메라의 ADL-only 영상 2–4주로 방별 autoencoder 학습, 재구성 오차로 알람.
라벨 불요, 시점 갭 원천 부재 (MUVIM IR AUC 0.94).
- 무력화: #10 (방별 보정이 정의상 내장), #9 (LE2I와 무관한 독립 신호).
- 트레이드오프: 방문객·가구 재배치 등 novel-but-not-fall FP — 단독 사용은 알람 피로 위험,
  threshold를 방별로 보정해야 함. 보조 신호로서의 가치가 큼.

### 평가·데이터 재설계 (어느 옵션을 골라도 공통으로 검토할 사실)

- LE2I window-level P@R90의 1차 축 지위는 repo 자체 데이터(#5)와 외부 벤치마크(OmniFall)가
  동시에 반박. 대안 축: **NH event-level recall @ FAE 예산 + mTTD**. NH 코퍼스 50+클립 확장
  (ADR-017 follow-up 2)이 전제.
- OOPS-Fall(1,300 wild 세그먼트, test-only)은 "staged 점수 인플레" 감사용으로 즉시 사용 가능.
- 합성 top-down(NToP570K, OmniFall-Syn, UnrealFall) → 시설 실영상 fine-tune이 문헌상
  +13.64% F1 (소규모 실데이터 단독 학습 대비, 출처 신뢰도 중간 — 재검증 필요).

### 공격 × 옵션 커버리지

| 공격 | A | B | C | D | E |
|------|---|---|---|---|---|
| #1 dropout→zeros | △(상류보강) | ◎(fail-safe) | ◎(pose 제거) | ✗ | △ |
| #2 와상 비가시 | △ | ◎(track-loss 알람) | ○ | ✗ | △ |
| #3 threshold 전이 | ◎ | ○ | ○ | ◎(hot 1차 허용) | — |
| #5/#9 LE2I Goodhart | △(event 평가) | ○ | ○ | ○ | ◎(독립 신호) |
| #7 느린 낙상 | △ | ◎(state 기반) | ○ | △ | ○ |
| #8 트래커 swap | △(ReID 추가) | ○(state는 ID 불요) | ◎(track 불요) | ○ | ○ |
| #10 카메라 기하 | ✗ | △ | ○(학습으로 흡수) | △ | ◎(방별 학습) |
| #4 알림 스텁 / #6 통계 / #11 버그 | — 옵션 무관, 별도 작업으로만 해소 — |

## 5. 한계와 미검증 사항

- VLM 92.5%/100% 수치는 control set 크기 미상 — 1차 출처 정밀 검증 전에는 참고치.
- OmniFall "massive drop"의 절대 수치는 리포트에 미기재 — 원논문 표 확인 필요.
- AltumView 가장자리 <40% 수치는 제품 리뷰(비 peer-review).
- 본 문서의 옵션 비교는 **NH 실측이 아니라 문헌 외삽** — 어떤 옵션이든 채택 결정은 NH gold
  확장 + event-level 평가 인프라 이후에만 검증 가능하다는 것 자체가 핵심 발견 중 하나.

## 6. 출처

repo 내부: ADR-025/009/013/017/019/020, `ml/experiments/leaderboard.md`,
`ml/experiments/analysis/phase3-step{1,2}*.md`, `ml/experiments/HUMAN_QUEUE.md`,
`ml/demo/temporal_module.py`, `ml/training/{evaluate.py, data/features.py, data/windowing.py}`,
`ml/serving/model.py`, docs/research/{fall-detection-methods, fall-state-taxonomy,
streaming-windowing, per-frame-vs-temporal-fall-judgment}.md

외부 (주요만; 전체는 NotebookLM "요양원 낙상 보호 AI" 노트북에 68소스 임포트됨):
- OmniFall — arXiv 2505.19889 · OOPS-Fall test-only 벤치마크
- NToP570K top-view fisheye pose — arXiv 2402.18196
- SafelyYou 외부 검증 (민감도 82%) — PMC12761293 · TUA/TOG 임상 — PMC8277400
- Kepler Night Nurse (fisheye, 상태분류, Oktober 파일럿 2,195→9 FP) — keplervision.eu, Hikvision TPP
- Nobi (31% 감소, 3분56초) — healthcare-brew.com 2026-04
- AltumView Sentinare 3 (RV1126 엣지 stick-figure, VLM 검증) — altumview.ca 2025-04/05, AgeTech Labs
- VLM zero/few-shot 낙상 — U. Hertfordshire Research Profiles
- MUVIM (IR autoencoder AUC 0.94) — arXiv 2206.12740
- 도메인 시프트 민감도 폭락 (100→80%) — Sabatini et al. 경유 PMC 종설
- BELE event-level/FAE 예산 — IEEE ICS anomaly detection
- MoViNet/X3D 엣지 — SPIE 13906 (2025) · UnrealFall — github.com/3dperceptionlab/UnrealFall
- RTMPose — MDPI smart-city CCTV 경량 낙상 프레임워크

§3.6 (2026-06 심층 추적 추가분):
- Cerberus 케스케이드 VAD — arXiv 2510.16290 · Cascading Multi-Agent — arXiv 2601.06204
- Vad-R1 P2C-CoT — arXiv 2505.19877 · VAU-R1 temporal IoU — arXiv 2505.23504 ·
  VANGUARD — arXiv 2605.02912 · ASK-Hint — arXiv 2510.02155 · MoniTor — arXiv 2510.21449
- 라우팅: uncertainty routing — arXiv 2502.11021 · ALARM — arXiv 2512.03101 ·
  Medical VQA 보정 — arXiv 2604.02543
- 환각/반대증거: VidHalluc — arXiv 2412.03735 · VideoHallu — arXiv 2505.01481 ·
  VERHallu — arXiv 2601.10010 · DIQ-H — arXiv 2512.03992 · Edge Reliability Gap —
  arXiv 2603.26769 · MLLMs-ready-for-surveillance — arXiv 2603.04727 ·
  multi-image 증폭 — arXiv 2601.07812
- 엣지 실측: vllm-mlx — arXiv 2601.19139 · Moondream Photon 1.2.0 — moondream.ai ·
  SmolVLM2 — huggingface.co/blog/smolvlm2, LiteVLA-Edge arXiv 2603.03380 ·
  Qwen2.5-VL-3B Jetson — learnopencv.com
- 규제: EU AI Act Art.14/high-risk — artificialintelligenceact.eu, mdxcro.com ·
  FDA AI-SaMD 초안 2025-01 — intuitionlabs.ai
