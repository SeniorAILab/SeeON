# Deep Interview Spec: iPhone 카메라 라이브 낙상 탐지 (autoresearch mission)

## Metadata
- Interview ID: di-autoresearch-realtime-camera-fall-2026-06-10
- Rounds: 7 (+ Round 0 topology gate)
- Final Ambiguity Score: 4.9%
- Type: brownfield
- Generated: 2026-06-10
- Threshold: 0.05
- Threshold Source: /Users/beomsu/.claude/settings.json
- Initial Context Summarized: no
- Status: PASSED
- Mode: --autoresearch (handoff → oh-my-claudecode:autoresearch)
- GitHub Issue: #47

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.96 | 0.35 | 0.336 |
| Constraint Clarity | 0.95 | 0.25 | 0.238 |
| Success Criteria | 0.94 | 0.25 | 0.235 |
| Context Clarity | 0.95 | 0.15 | 0.143 |
| **Total Clarity** | | | **0.951** |
| **Ambiguity** | | | **0.049** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| camera-intake | active | iPhone→Mac 카메라를 CameraSource로 받아 FrameSource seam에 연결, 별도 Streamlit 페이지 + 카메라 선택 UI | AC 1–4 |
| realtime-inference-visibility | active | 모델 추론 결과(포즈/박스/낙상 상태)가 실시간으로 보임 — 정확도는 명시적 논외 | AC 5–6 |
| autoresearch-evaluator | active | 매 iteration 무인 실행되는 하이브리드 evaluator (pass: 결정적 경로, 실카메라: score만) | AC 7–9 |

## Goal
iPhone을 Mac에 연결(Continuity Camera/USB)해 카메라 스트림을 받아, 기존 FrameSource
seam(ADR-006)과 라이브 추론 루프 `iter_live_frames`(ADR-010)에 연결한 **별도 Streamlit
페이지**(`ml/demo/pages/live_camera.py`)에서 실시간 낙상 추론을 가시화한다. 기존 파일 재생
페이지(app.py)는 동작·외관을 보존한다. autoresearch 루프가 이 mission을 구현·검증하며,
evaluator pass 시 조기종료한다.

## Constraints
- 별도 페이지 (Streamlit multipage, `ml/demo/pages/live_camera.py`); app.py는 그대로, 공유 로직(모델 빌드, 파라미터 expander, 상태 배지)만 공유 모듈로 추출
- 카메라 선택: 인덱스 0–4 프로브 + 1프레임 썸네일 드롭다운 — 순수 OpenCV, 추가 의존성 금지 (디바이스 이름 표시 안 함)
- CameraSource는 `ml/util/` (ADR-006 seam 위치): 무한 스트림, 벽시계 `time_sec`, 최신 프레임 우선(스테일 버퍼 드랍), 파일 페이싱(sleep) 없음
- 성능: 처리 ≥10fps, 캡처→화면 표시 지연 ≤500ms
- autoresearch: max-runtime 2h, evaluator pass 시 조기종료, 단일 mission
- 워크트리 규칙 준수: `git wt 47` (main 직접 작업 금지)
- 정확도(분류기 gold-8 0/8 문제)는 이 mission에서 다루지 않음 — #25/#26 별도 작업

## Non-Goals
- 낙상 분류 정확도 개선 (명시적 논외 — "모델이 탐지한 것이 실시간으로 보이는 것"이 목표)
- 원격 브라우저 카메라 (streamlit-webrtc) — 로컬 데모 전제
- 백엔드 알림 플로우 / 임상적 판정
- 디바이스 이름 표시 (pyobjc/AVFoundation 의존성)

## Acceptance Criteria
- [ ] 1. `CameraSource`가 `FrameSource` 프로토콜을 만족하고 단위 테스트 통과 (fake/synthetic 캡처로, 실카메라 불요)
- [ ] 2. 라이브 페이지에서 카메라 인덱스 0–4 프로브 후 열리는 카메라의 썸네일이 표시되고 선택 가능
- [ ] 3. 선택한 카메라로 시작하면 무한 라이브 루프가 돌고, 정지/페이지 이탈로 안전 종료
- [ ] 4. 기존 app.py(파일 재생)는 시각적으로 깨지거나 사라진 요소 없음 — visual-verdict로 확인
- [ ] 5. 라이브 화면에 포즈 오버레이 + 낙상/정상 배지 + confidence가 프레임 단위로 갱신
- [ ] 6. 클립 주입 벤치마크에서 처리 ≥10fps AND 프레임당 파이프라인 지연 ≤500ms
- [ ] 7. evaluator가 JSON `{pass, score, metrics}` 출력 (pytest + 벤치 결정적 경로로 pass 판정)
- [ ] 8. 카메라 연결 시 실카메라 10초 스모크가 score에 기록 (pass에 미반영)
- [ ] 9. 완료 후 `/documentation-and-adrs`로 카메라 intake 결정 ADR 증류

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 기존 페이지에 소스 분기 추가하면 됨 | 파일(유한+페이싱) vs 카메라(무한+실시간)는 루프 의미론이 다름 | 별도 페이지 + 공유 모듈 추출 (R1) |
| 낙상이 정확히 탐지되어야 함 | mission의 본질이 무엇인가 | 정확도 논외 — 실시간 가시성이 핵심 (R2) |
| 이름 있는 카메라 선택 UI 필요 (Contrarian R4) | OpenCV는 이름을 못 읽음 — 그 수준이 정말 필요한가 | 인덱스 프로브 + 썸네일로 충분 (R4) |
| evaluator가 실카메라를 전제 | iPhone 분리 시 루프가 죽음 | 하이브리드: pass는 결정적, 실카메라는 score (R5) |
| 무한 개선 루프 (Simplifier R6) | pass할 때까지만 돌면 충분하지 않나 | 2h 상한 + pass 시 조기종료 (R6) |

## Technical Context
- `FrameSource` protocol + `VideoFileSource`: `ml/util/frame_source.py` — ADR-006이 라이브 스트림 동일 seam을 명시
- `iter_live_frames(source, model)`: `ml/demo/live_view.py` — 소스 불가지, 변경 불요
- `app.py`: 단일 페이지, 파일 전용 페이싱(`read_video_playback_info` + sleep)이 루프에 내장 → 분리 근거
- 낙상 판정: per-frame `is_down` + `sustained_down_sec` temporal 게이트 2층 구조 (`docs/research/per-frame-vs-temporal-fall-judgment.md`)
- 평가 하니스: `cd ml && uv run pytest` 동작 확인됨; 벤치마크 스크립트는 mission에서 신규 작성
- Continuity Camera는 macOS에서 시스템 카메라로 등장 — cv2 인덱스 프로브로 커버

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| CameraSource | core domain | device_index, time_sec(벽시계), 최신프레임 우선 | implements FrameSource |
| LiveCameraPage | core domain | 카메라 선택, 시작/정지, 무한 루프 | uses CameraSource, iter_live_frames, 공유 UI 모듈 |
| CameraProbe | supporting | 인덱스 0–4, 썸네일 | feeds LiveCameraPage 선택 UI |
| FrameSource seam | existing | Frame(index, time_sec, image) | ADR-006; VideoFileSource와 형제 |
| FallClassifier | existing | per-frame + temporal 게이트 | 변경 없음 (정확도 논외) |
| Evaluator | core domain | pass(pytest+bench), score(+실카메라 스모크), 2h/조기종료 | gates autoresearch loop |
| Mission | core domain | live-camera-fall-detection, issue #47 | produces ADR via /documentation-and-adrs |
| VisualVerdictCheck | supporting | 기존 페이지 회귀 | part of pass 판정 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 6 | 6 | - | - | N/A |
| 2 | 9 | 3 | 0 | 6 | 67% |
| 3 | 9 | 0 | 0 | 9 | 100% |
| 4 | 10 | 1 | 0 | 9 | 90% |
| 5–7 | 10 | 0 | 0 | 10 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (7 rounds + R0)</summary>

### Round 0 — Topology
**Q:** 3개 컴포넌트(camera-intake / realtime-detection-quality / autoresearch-evaluator)가 맞는가?
**A:** 맞다, 3개 모두 active.

### Round 1 — camera-intake / Goal
**Q:** Streamlit 진입 구조 — 별도 페이지 vs 같은 페이지 소스 선택 vs 완전 교체?
**A:** 별도 페이지 (pages/live_camera.py + 공유 모듈 추출). **Ambiguity:** 68%

### Round 2 — autoresearch-evaluator / Criteria
**Q:** evaluator가 측정/개선할 대상은?
**A:** 라이브 E2E 동작 + 실시간 성능(fps/지연). 정확도는 논외 — 모델이 탐지한 것이 실시간으로 보이는 것이 핵심. (+추가: 카메라 선택 UI 필요, 완료 후 /documentation-and-adrs, /visual-verdict 회귀 검증) **Ambiguity:** 43%

### Round 3 — autoresearch-evaluator / Constraints
**Q:** pass 기준 수치는?
**A:** 중간 — 처리 ≥10fps, 지연 ≤500ms. **Ambiguity:** 32%

### Round 4 — camera-intake / Constraints (CONTRARIAN)
**Q:** 이름 있는 완전한 선택 UI가 정말 필요한가?
**A:** 인덱스 프로브 + 썸네일 (순수 OpenCV). **Ambiguity:** 27%

### Round 5 — autoresearch-evaluator / Constraints
**Q:** 카메라 연결 여부와 무관하게 도는 evaluator 전략은?
**A:** 하이브리드 — pass는 결정적 경로(pytest+벤치+visual-verdict), 실카메라 스모크는 score만. **Ambiguity:** 17%

### Round 6 — autoresearch-evaluator / Constraints (SIMPLIFIER)
**Q:** max-runtime 상한과 종료 조건은?
**A:** 2시간 + pass 시 조기종료. **Ambiguity:** 9%

### Round 7 — Context
**Q:** GitHub 이슈/워크트리는?
**A:** 새 이슈 생성 → #47. **Ambiguity:** 4.9% ✓

</details>
