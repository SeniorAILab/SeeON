# Deep Interview Spec: 침대 이탈 탐지 (Bed-Exit Detection)

## Metadata
- Interview ID: bed-exit-detection-2026-06-13
- Issue: #100 (`feat/100-feat-ml-bed-localization-exit-logic-demo`)
- Rounds: 8 (Round 0 topology + R1–R7 + test-scope close)
- Final Ambiguity Score: ~5% (early-close on "keep going"; all substantive decisions resolved)
- Type: brownfield
- Generated: 2026-06-14
- Threshold: 0.05
- Threshold Source: ~/.claude/settings.json
- Initial Context Summarized: no
- Status: PASSED (substantive decisions resolved; acceptance criteria crystallized below)
- Research input: `docs/research/bed-exit-detection-criteria.md`

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.333 |
| Constraint Clarity | 0.90 | 0.25 | 0.225 |
| Success Criteria | 0.90 | 0.25 | 0.225 |
| Context Clarity | 0.92 | 0.15 | 0.138 |
| **Total Clarity** | | | **0.921** |
| **Ambiguity** | | | **~8% → crystallized to ~5%** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| Bed localization | active | 시작 시 COCO detection(`yolo26n.pt`, bed=class 59)로 침대 1회 자동 탐지 후 캐싱 | AC-1..3 |
| Bed-exit logic | active | per-track in-bed→out 전이 + containment 비율 + ~1초 dwell + 야간 게이트 | AC-4..9 |
| Demo page | active | `ml/demo/pages/` 신규 침대-이탈 페이지 (업로드+라이브) | AC-10..14 |
| Test | active | 이탈 로직 단위테스트(floor) + 탐지/캐시 + 페이지 스모크 | AC-15..17 |
| Train | **deferred (non-goal)** | 침대 탐지용 신규 모델 학습 — 안 함. COCO 기성 클래스 사용 | 사용자 확정 (Round 0) |

## Goal
요양 환경 영상에서 **환자가 침대를 벗어나는 사건(post-exit)을 탐지해 데모에서 알림**한다.
침대는 정적이므로 **시작 시 1회 COCO detection으로 침대 ROI를 얻어 캐싱**하고, 이후 매 프레임은
기존처럼 **YOLO26-pose 단일 호출**만 수행한다(프레임당 정보 1패스, 중복 없음 — 사용자 핵심 직관 충족).
침대 이탈 판정은 학습 없이 **COCO-17 포즈 + 침대 ROI 휴리스틱**으로 하며, 기존 `GreedyIouTracker`로
**다인을 추적**해 트랙 단위로 판정한다. 알림 표면은 **낙상과 분리된 신규 Streamlit 페이지**다
(낙상은 기존 페이지 유지).

## Constraints
- **학습 금지**: 침대 탐지는 COCO 기성 `bed` 클래스(class 59)만 사용. 신규 모델 학습 없음.
- **프레임당 pose 1패스 유지**: 침대는 매 프레임 재탐지하지 않음(시작 시/초기 N프레임에 1회 탐지 후 캐시). ADR-005 §3 model-seam 원칙과 ADR-013 anti-skew 준수.
- **다인 추적**: 기존 `GreedyIouTracker`(temporal_module) 재사용. 환자 명시 식별 불필요 — "침대에 있던 트랙이 나가면" 규칙으로 간병인 오탐 회피.
- **야간 게이트**: 데모는 벽시계 시각이 없으므로 **"야간 모드" 토글**(운영자 수동). ON일 때만 이탈 알림 발화, OFF는 모니터링만. 자동 주/야 추정은 non-goal.
- **침대 없음 처리**: 장소에 따라 침대가 아예 없을 수 있음. 미탐지/부재는 **에러가 아니라 정상 "침대 없음" 상태** — 이탈 판정 비활성, pose 오버레이만, 정보 배지 표시.
- **알림 범위**: 데모 UI 라치 수준(기존 `FallEventLatch` 패턴). 백엔드 webhook/KakaoTalk은 별도 스코프(ADR-003).
- **공개 모드 불변식 유지**: `FALL_DEMO_MODE=public` 기본·세션 업로드 스코프(streamlit-demo.md §4·5).
- **데이터 날조 금지**: 실제 추론에서 나온 박스/키포인트/라벨만 표시(ADR-005 §5).

## Non-Goals
- 침대 탐지용 신규 모델 학습 (train 컴포넌트 제외).
- 수동 ROI 그리기 / 멀티모달 화면 캡처 드로잉 (deferred 후속).
- 자동 주/야(조도) 추정.
- 명시적 환자 ID / 재식별.
- pre-exit(가장자리 앉기) 조기경보 — post-exit만 (deferred).
- 백엔드 실알림(webhook/AlimTalk) 연동.
- 카메라 각도/이불 가림 견고성 정량 보장(연구상 미해결 — best-effort).

## Acceptance Criteria
**Bed localization**
- [ ] AC-1: 재생/스트림 시작 시 COCO detection 모델(`yolo26n.pt`)로 `bed` 클래스를 1회 탐지하고 최고-신뢰 박스를 ROI로 캐싱한다.
- [ ] AC-2: 이후 프레임은 pose 모델만 호출한다(프레임당 detection 재호출 없음 — 단일 pose 패스 유지).
- [ ] AC-3: bed가 탐지되지 않으면 graceful "침대 없음" 상태로 진입(예외 없음), 이탈 판정 비활성, pose 오버레이는 계속.

**Bed-exit logic**
- [ ] AC-4: 트랙 i의 containment = `area(person_box_i ∩ bedROI) / area(person_box_i)` 로 계산한다.
- [ ] AC-5: 트랙이 containment ≥ in-bed 임계(기본 0.5)로 일정 지속 시 "in-bed"로 표시한다.
- [ ] AC-6: "in-bed"였던 트랙의 containment가 exit 임계(기본 0.1) 미만으로 **~1초(=round(fps×1.0)프레임) 지속**되면 그 트랙에 이탈 이벤트를 발화한다.
- [ ] AC-7: 침대에 한 번도 in-bed가 아니었던 트랙(예: 간병인)은 ROI 밖을 돌아다녀도 이탈을 발화하지 않는다.
- [ ] AC-8: 야간 모드 토글이 OFF면 이탈 이벤트를 발화하지 않는다(모니터링만).
- [ ] AC-9: 이탈 라치는 상승 에지에서만 발화하고 실제 추론을 날조/연장하지 않는다(ADR-005 §5).

**Demo page**
- [ ] AC-10: `ml/demo/pages/` 아래 신규 페이지가 추가되고 `live_camera.py` bootstrap/`set_page_config` 규약을 따른다.
- [ ] AC-11: 캐시된 침대 ROI를 프레임 위에 오버레이로 그린다.
- [ ] AC-12: 기존 `render_yolo_overlay`(사람 박스/스켈레톤 토글)를 재사용한다.
- [ ] AC-13: 이탈 이벤트 발생 시 🚨 라치 배지(최초 시각+횟수)를 표시한다(FallEventLatch 패턴).
- [ ] AC-14: 업로드 영상과 라이브 카메라 두 소스를 모두 지원하고, "야간 모드" 토글과 "침대 없음" 정보 배지를 노출한다.

**Test**
- [ ] AC-15: 이탈 로직 단위테스트 — containment 계산, in-bed→out 전이, ~1초 dwell, 다인 트랙 분리(간병인 비발화), "침대 없음" 상태를 순수 함수로 검증.
- [ ] AC-16: 침대 탐지/캐시 단위테스트 — 1회 탐지+캐싱, 미탐지 시 graceful 진입(모델은 stub/fixture).
- [ ] AC-17: 페이지 컨트롤 스모크 — 야간모드/오버레이 토글/라치 배지 동작(기존 `test_demo_app_controls.py` 패턴, `FALL_DEMO_MODE=operator`).

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "한 패스로 침대+포즈를 다 얻는다" | pose 모델은 사람만 탐지; 단일 표준 모델로 둘 다 불가 | 침대는 정적 → 1회 detect+캐시, 매 프레임 pose 1패스 유지 |
| 침대를 매 프레임 탐지 | 중복·비용 2배 | 캐싱으로 제거 |
| 이탈 = 중심점 ROI 이탈 | 연구가 중심점 단독 기각 | containment 비율 + ~1초 dwell |
| 알림은 벗어난 즉시 vs 미리 | 연구: post vs pre는 1순위 결정 | post-exit 채택, pre-exit는 non-goal |
| 단일 점유 가정 (Contrarian) | 요양원은 다인이지만 저동적 | 다인 추적 채택(기존 tracker), 트랙 전이 규칙 |
| 낙상+이탈 한 페이지 | 사용자: 이탈은 새 페이지에서만 | 페이지 분리, pose 인프라만 공유 |
| 침대는 항상 있다 | 장소별로 없을 수 있음 | "침대 없음"을 정상 상태로 처리 |
| 야간을 자동 추정 | 업로드 클립엔 시각 없음 | "야간 모드" 운영자 토글 |

## Technical Context (brownfield)
- per-frame: `YoloPoseRunner.predict_full()` 1회 호출(keypoints+person boxes) → `DetectionResult`(seam.py). 침대/ROI/zone 개념 코드 부재.
- 합성 지점: `DetectionResult`에 `bed_box` 필드 추가; 신규 `BedExitModule`(ModelModule 프로토콜)이 pose 결과 + 캐시 ROI를 받아 트랙별 판정; `GreedyIouTracker`(tracking.py) 재사용; 임계값은 `thresholds.py`/`ClassifierParams`(classifiers.py).
- 신규 페이지: `ml/demo/pages/` (template: `pages/live_camera.py`), `iter_live_frames` 루프 재사용, 알림 라치는 `FallEventLatch` 패턴 사본/일반화.
- 침대 탐지: 신규 COCO detection 러너(`yolo26n.pt`) — pose 러너와 별개 1회 호출. 가중치 gitignore, ultralytics 자동 다운로드.

## Distill into ADR (post-spec, documentation-and-adrs 단계)
1. **ADR: 침대 위치 파악 전략** — "프레임당 단일 pose"(ADR-005 §3)에 *시작 시 COCO detection 1회+캐시* 추가. 미래 serving/backend 통합 제약 → cross-cutting.
2. **ADR: 침대 이탈 알림 기준** — post-exit + containment(<0.1) + ~1초 dwell + 다인 트랙 전이 + 야간 토글. 근거: `docs/research/bed-exit-detection-criteria.md`.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Person/Track | core domain | track_id, person_box, keypoints[17], containment, in_bed_state | tracked by GreedyIouTracker |
| Bed ROI | core domain | bed_box(x1,y1,x2,y2,conf), detected_at, present:bool | cached once; consumed by exit logic |
| BedExitEvent | core domain | track_id, onset_time, sustained_frames | raised when in-bed track exits |
| BedExitLatch | supporting | first_onset, count, active | rising-edge aggregation (UI only) |
| BedDetector | external system | model=yolo26n.pt, target_class=59 | one-shot at start |
| DetectionResult | supporting | boxes, labels, keypoints, **bed_box(new)** | per-frame container (seam.py) |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability |
|-------|-------------|-----|---------|--------|-----------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 6 | 1 | - | 5 | ~83% |
| 5 | 6 | 0 | 1 (Latch→BedExitLatch) | 6 | 100% |
| 7 | 6 | 0 | 0 | 6 | 100% (converged) |

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds)</summary>

- **R0 Topology:** 4 components 확정 (bed-localization, bed-exit-logic, demo-page, test). train 비포함.
- **R1 Bed localization:** "YOLO 기본?" → pose는 사람만, detection은 bed 포함. 침대 정적 → **COCO detection 1회 자동 탐지+캐시** 채택.
- **R2 Exit semantic:** deep-research 후 → **post-exit** 채택.
- **R3 Trigger geometry:** **containment 비율** 채택.
- **R4 Contrarian (다인):** 추천 위임 → 처음 single-occupant 추천 → 사용자 반전: **다인 추적 필요**(요양원, 저동적).
- **R5 Demo/아키텍처:** "라이브에서 2상태 측정" → 페이지 구성은 **낙상=기존, 이탈=신규 페이지**, pose 인프라 공유. ROI 오버레이+라치+업로드/라이브+pose 오버레이 재사용.
- **R6 Simplifier (fallback):** "일단 YOLO class 사용" + "장소별 침대 없을 수 있음" → **"침대 없음" graceful 정상 상태**, 수동 ROI deferred.
- **R7 Night gate:** **"야간 모드" 토글**(운영자 수동).
- **R8 Test scope:** 이탈 로직 단위테스트(floor) + 탐지/캐시 + 페이지 스모크.
</details>
