# Deep Interview Spec: 야간 침상 이탈 엣지 추론 E2E (night-bed-exit-edge-e2e)

## Metadata
- Interview ID: b16c35c8-fe74-4e5b-be7c-9fef16e2cd22
- Rounds: 6 (R0 토폴로지 → R5 종결)
- Final Ambiguity Score: 5%
- Type: brownfield
- Generated: 2026-06-25
- Threshold: 0.05
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED
- Auto-Researched Rounds: none
- Auto-Answered Rounds: none
- Architect Failures: 0
- Lateral Reviews: 3 (R2 initial→progress, R3 progress→refined, R4 refined-stay)
- Lateral Panel Failures: 0
- Refined Rounds: [1]
- Closure Overrides: none
- Restated Goal: (아래 ## Goal)
- Codebase baseline: git main 4a192cd (ADR-067 serving→api rename, YAML-only worker config 반영 후)

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.3325 |
| Constraint Clarity | 0.95 | 0.25 | 0.2375 |
| Success Criteria | 0.95 | 0.25 | 0.2375 |
| Context Clarity | 0.95 | 0.15 | 0.1425 |
| **Total Clarity** | | | **0.95** |
| **Ambiguity** | | | **0.05** |

## Topology
4개 최상위 컴포넌트 모두 active. 첫 E2E 슬라이스 기준 커버리지.

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| layer-routing (레이어 경계 & 이벤트 전송 경로) | active | 스트림→runners→perception→domains→incident→sink 스택. worker→`/ingest/alerts` 직접(HMAC), edge-api(serving) 미경유 | F12로 '엣지-api 경유' 오해 해소. AC: E2E가 worker→backend ingest 직접 경로를 증명 |
| parallel-domains (도메인 병렬 확장성) | active | 한 카메라에서 N개 도메인이 각자 독립 계약으로 공존하는 '초석' | F18 계약형 채택. AC: fall(항상)+bed_exit(night_window) 공존이 per-domain 계약을 실증 |
| temporal-judgment (시간 축 이벤트 판정) | active | 야간 게이팅을 어디서/어떻게 | F14(벽시계 주입)+F19(suppress) 확정. AC: 야간→emit/낮→suppress |
| web-time-config (웹 시간 설정) | active | 시간창 편집→영속→소비 계층 | F17: backend SSOT, 첫 E2E 정적 시드. 라이브 전파는 Phase 2/3 deferral |

## Established Facts
| ID | Source | Fact | Disputed |
|----|--------|------|----------|
| F1 | codebase | 프로덕션 경로 = ml --HMAC--> POST `/ingest/alerts`(NestJS 단일 ingress). FastAPI 서빙은 main 4a192cd에서 `ml/serving`→`ml/api` rename(ADR-067), 데모/디버그·status 전용 별개 경로 | — |
| F2 | codebase | (의도) AlertRule 평가·DetectionEvent/SpaceStatus 기록·Kakao fan-out은 backend 정책 소유; ml 직접쓰기/신규 ingress 금지 | disputed: ADR 의도이나 미착륙(alert-rules 501, ingest는 persist+fanout만) |
| F3 | codebase | backend `alert-rules` 컨트롤러는 가드+501(NotImplemented), read-model 미착륙 | — |
| F4 | codebase | prisma에 rule/time-window/night/schedule/threshold/setting 모델 부재 → 시간윈도우 영속 모델 없음 | — |
| F5 | codebase | front 설정 UI 존재하나 `monitorSettingsStore`는 localStorage 전용(서버 미영속); `MonitorSettings`에 시간창 필드 없음(nightMode boolean만) | — |
| F6 | codebase | ml worker config는 YAML 전용(main 4a192cd, `ml/config/ml-worker.example.yaml`); `.json` 거부; 시작 시 정적 로드, 런타임 fetch 없음 | — |
| F7 | user+codebase | 엣지 카메라·스트림은 facility 단위로 전체에 뿌려짐 → 시간 설정은 facility 범위 적용·분배가 자연스러움 | — |
| F8 | user | 여러 도메인 병렬 시 ml은 24/7 프레임 수신·추론 → 시간 게이트는 '캡처 절약'이 아니라 '판정/emit 필터' | — |
| F9 | codebase | ml 2인스턴스 분리(ADR-067): ml-edge-api(FastAPI control/status/debug, emit 안함) + ml-edge-worker(카메라 루프·추론·도메인·heartbeat·alert). 프로덕션 신호는 worker만 | — |
| F10 | codebase | backend ingest는 freshness(5분)+tenant+idempotency+Alert 영속+outbox(fanout)만. 시간윈도우/AlertRule 평가 없음 | — |
| F11 | user | ml은 신호를 backend로 계속 emit | disputed: F15로 정밀화 — '게이트는 backend측'은 사용자 최종 방향과 상충(계약을 edge로 전파해 도메인별 게이팅) |
| F12 | codebase | egress = worker가 `events/EdgeIngestClient`로 `/ingest/alerts`에 HMAC 직접 POST; edge-api 미경유; worker는 serving import 금지. 사용자 '엣지-api 경유' 멘탈모델은 demo→serving `/debug/predict`와 혼동 | — |
| F13 | codebase | 멀티-도메인-한-카메라는 이미 구조적 존재(`CameraWorker.domain_detectors` 루프 + `DomainsConfig.enabled`). 단 `_domain_detectors`가 `factory()`를 인자 없이 호출 → 도메인별 계약 표면 없음(이름 on/off만). `KNOWN_DOMAIN_NAMES` 검증 | — |
| F14 | codebase | `frame.time_sec = round(time.monotonic()-t0,3)` 단조시간(벽시계 아님). 야간 시각 게이팅은 frame.time_sec 불가 → 게이팅 지점에 벽시계(datetime.now(tz)) 주입 필요. bed_exit detector는 현재 시각 게이트 전무(모든 이탈 emit) | — |
| F15 | user | [해소] front 설정→backend 전파·영속(SSOT+default fallback)→계약을 edge로 전파; worker는 계속 emit하되 계약-aware로 도메인별 게이팅; 한 카메라 다중 도메인 독립 계약 허용; 첫 E2E=야간 침상이탈 단일 카메라 | — |
| F16 | research | best practice: 선언적 desired-state+reconciliation(Azure device twin), backend 소유·edge 적용·로컬 fallback. '거의 안 바뀌고 지연 비민감' 설정=pull+fallback 정답, push는 과설계. 런타임 config는 릴리스와 분리·히스토리/롤백 | — |
| F17 | user | [결정 A] backend→edge 전파는 pull 성숙도 단계. 첫 E2E=정적 YAML 시드(`domains.bed_exit.night_window` 계약 모양 확정·값 시드). B(boot fetch)→C(주기 reconcile+fallback)는 값 출처만 바뀌는 가산 슬라이스(계약 불변). push 미채택 | — |
| F18 | assumption | [채택·veto가능] `domains:`를 `도메인명→{enabled,...params}` 맵으로 확장(+legacy `enabled:[...]` 호환). `DomainRegistration.factory`가 도메인 config 수용→`_domain_detectors`가 주입. fall=시간게이트 없음, bed_exit=night_window. 도메인마다 계약이 다른 것이 '초석' | — |
| F19 | user | [결정] bed_exit 야간 게이트=SUPPRESS. 21:00–05:00 밖 침상이탈은 alert 미emit(낮 이탈=정상). fall은 항상 emit. E2E success='야간 도달/낮 미도달' | — |
| F20 | assumption | [채택·veto가능] 기본 창 21:00–05:00 Asia/Seoul(인터뷰 '밤 9~5시 타이트'). 첫 E2E 범위=단일 카메라, enabled=[fall,bed_exit], 기존 `scripts/ml-edge-single-mock-rtsp-bedexit.sh` 확장; 게이팅은 주입 clock(`Callable[[],datetime]`)로 테스트 | — |

## Trigger Metadata
- R2(재개): D(scope/decision) 해소 — 판정위치·설정소유 확정. 100% → 37%. F1/F6 stale 갱신, F13/F14/F15 추가.
- R3: web-time-config constraints 상향(전파 채널 결정 A). 37% → 21%. F16(research)/F17.
- R4: temporal-judgment criteria 상향(suppress). 21% → 15.5%. F19.
- R5(종결): 채택 기본값(F20) 확정 + 목표 restate. 15.5% → 5%. 모순/미해결 트리거 없음.

## Lateral Review Panel
- R2 (initial→progress): researcher/contrarian/simplifier — simplifier "첫 E2E에 라이브 채널 필요한가?" → R3 전파채널 질문으로 fold.
- R3 (progress→refined): contrarian "낮 침상이탈은 애초 알림인가?" → R4 게이트 의미론으로 fold.
- R4: contrarian/simplifier — suppress가 도메인 의미론 정합·더 단순 확인.

## Goal
요양원 단일 카메라에서 `ml-edge-worker`가, 한 카메라에 여러 도메인이 각자 독립 계약(`fall`=항상 emit, `bed_exit`=`night_window`)으로 공존하는 구조 위에서, 야간(기본 21:00–05:00 Asia/Seoul; backend가 SSOT, 첫 슬라이스는 edge YAML 정적 시드) 침상 이탈만 suppress 게이트로 판정해 backend `/ingest/alerts`로 실제 추론 이벤트를 보내는 것을, 가장 단순한 1개 E2E(기존 mock-RTSP 하네스 확장; 야간→도달/낮→미도달 증명)로 완성한다.

## Constraints
- 게이팅은 엣지 `bed_exit` 도메인에서 수행하되 **주입된 벽시계**(`Callable[[], datetime]`, 기본 `datetime.now(ZoneInfo)`)를 사용한다. `frame.time_sec`(단조시간) 사용 금지(F14).
- `domains:` 스키마는 도메인별 계약 맵으로 확장하되 기존 `enabled:[...]` 리스트를 계속 수용(호환). `extra="forbid"`·`KNOWN_DOMAIN_NAMES` 검증 유지(F13/F18).
- `fall` 경로는 시간게이트 없이 기존대로 항상 emit. 게이팅은 `bed_exit`의 `night_window` 계약에만 적용(F19).
- backend가 야간창의 SSOT(기본값 소유). 첫 슬라이스는 그 기본값을 edge YAML `domains.bed_exit.night_window`에 정적 시드(F17).
- worker egress는 기존 `EdgeIngestClient` → `/ingest/alerts` 직접 경로 유지. edge-api(serving) 경유/serving import 금지(F9/F12, `ml/worker/AGENTS.md`).
- 최소 변경: 첫 E2E에 필요한 가장 작은 diff. backend/front/DB/Kakao 변경 없음(Phase 2/3로 분리).
- ADR-023/047 ingress 규칙 존중: ML이 DetectionEvent/SpaceStatus 직접쓰기·신규 ingress namespace 추가 금지.

## Non-Goals
- backend 야간창 영속 모델·API(prisma model, alert-rules 활성화) — Phase 2.
- front 시간창 편집 UI(`MonitorSettings` 확장·서버 영속) — Phase 3.
- backend→edge 라이브 전파(B: boot fetch, C: 주기 reconcile+fallback) — Phase 2/3, pull only(no push).
- 방/카메라별 도메인 계약 오버라이드("방 지정 엄격 모니터링") — 후속(C7).
- 다른 도메인(휠체어 기립, 워커 고속, 장시간 서있음 등) 구현 — 본 슬라이스는 bed_exit만, fall은 기존 유지.
- backend severity 차등·Kakao 정책 변경.

## Acceptance Criteria
- [ ] YAML `domains:`가 도메인별 맵 형식 `{bed_exit:{enabled:true, night_window:{start,end,tz}}, fall:{enabled:true}}`을 수용하고, 기존 `enabled:[...]` 리스트도 계속 수용한다. 미지 도메인명은 검증 실패(`KNOWN_DOMAIN_NAMES`). (`ml/tests/test_ml_worker_yaml_config.py` 확장)
- [ ] `DomainRegistration.factory`가 도메인별 config를 받고 `_domain_detectors`가 주입한다. `bed_exit`는 `night_window`를 받고 `fall`은 시간게이트 없이 생성된다. (`ml/tests/test_ml_worker_yaml_runtime.py` 또는 도메인 레지스트리 테스트)
- [ ] `bed_exit`는 주입된 벽시계가 `night_window` 안일 때만 침상이탈 이벤트를 emit하고, 창 밖이면 suppress한다. 경계값(21:00, 05:00)·자정 횡단·tz를 커버한다. `frame.time_sec`를 쓰지 않는다. (`ml/tests/test_domains_bed_exit.py` 야간 케이스 추가)
- [ ] `fall` 경로는 영향 없음(항상 emit). 기존 fall 테스트 green.
- [ ] E2E: 단일 카메라 mock RTSP(`scripts/ml-edge-single-mock-rtsp-bedexit.sh` 확장)에서 clock을 야간으로 강제하면 bed-exit가 backend `/ingest/alerts`(HMAC)에 도달하고, 주간으로 강제하면 도달하지 않는다.
- [ ] `ml/config/ml-worker.example.yaml`의 `domains.bed_exit.night_window`에 기본값 21:00–05:00 Asia/Seoul 시드.
- [ ] import 사다리·토폴로지 테스트 green(`ml/tests/test_import_dependency_ladder.py`, `tests/test_edge_topology_contract.py`).
- [ ] 본 슬라이스에서 backend/front/prisma 변경 0(scope fidelity).

## Deferrals
- Phase 2 (backend SSOT): 야간창 영속 모델(prisma) + GET/PUT(현 `alert-rules` 501 활성화 또는 소형 monitoring-config 모듈). F3/F4.
- Phase 3 (front + 라이브 전파): `MonitorSettings` 시간창 UI·서버 영속(F5); backend→edge B(boot fetch)→C(주기 reconcile + 로컬 default fallback), **pull only, push 금지**(F16/F17).
- C7: per-camera/per-room 도메인 계약 오버라이드.
- Convergence Pacing: min-round floor/score-drop cap/dampening 미도입 — 양방향 스코어링이 pacing 메커니즘.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 시간 게이팅은 backend 정책에서(ADR-023/047/044) | 사용자: ADR stale, alert-rules 501·시간엔진 미구현(F2/F3) | 게이트는 엣지 `bed_exit` 도메인(계약-aware), backend는 설정 SSOT(F15/F17) |
| worker는 edge-api 경유해 backend로 | 코드: worker→`/ingest/alerts` 직접, serving import 금지(F12) | 직접 egress 확정; demo→serving `/debug/predict`와 혼동 해소 |
| 야간 게이트로 ml 자원 절약 | 다중 도메인 시 24/7 프레임 수신 불가피(F8) | 게이트는 emit 필터(탐지 끄기 아님) |
| 낮 침상이탈도 alert | 도메인 의미론: 낮 침대 이탈=정상 | bed_exit suppress(야간만 alert), fall은 항상(F19) |
| 첫 E2E에 backend→edge 채널 신설 필요 | best practice: infrequent config=pull+fallback, 정적 시드가 가산 시작점(F16) | 정적 YAML 시드로 시작, B→C는 값 출처만 변경(F17) |
| `domains:`는 이름 on/off만 | 한 카메라 다중 도메인 독립 계약 요구(F13/F15) | 도메인별 맵 계약 + legacy 호환(F18) |

## Technical Context (brownfield, cited)
- `ml/runtime/camera_worker.py:43,101-112` — `CameraWorker.domain_detectors: tuple[...]`가 프레임마다 다중 도메인 루프; 각 이벤트 → `_with_camera_identity` → `IncidentManager.admit` → `event_sink`.
- `ml/worker/edge_worker.py` `_domain_detectors()` — `DOMAIN_REGISTRY`를 `enabled`로 필터, `registration.factory()`를 인자 없이 호출(계약 주입 지점).
- `ml/runtime/edge_worker_config.py` — `DomainsConfig.enabled: tuple[str,...]|None`, `KNOWN_DOMAIN_NAMES`, `EdgeWorkerConfig.domains`, 모든 모델 `extra="forbid"`; `load_edge_worker_config`는 `.json` 거부(YAML 전용).
- `ml/domains/__init__.py` — `DOMAIN_REGISTRY`, `DomainRegistration(name, factory, enabled)`.
- `ml/domains/bed_exit/detector.py:19-138,164-173` — `BedExitMonitor.update(observation, time_sec)`가 모든 이탈에 이벤트; `_event_dict`는 `{domain:"bed_exit", event_type:"bed-exit", ...}`. 시각 게이트 없음.
- `ml/sources/rtsp.py:46-50` — `Frame.time_sec = round(time.monotonic()-t0,3)` 단조시간.
- `ml/contracts/event.py` — `DetectionEventType.BED_EXIT`, registry `"bed-exit"`; `ml/events/schemas.py:15` `AlertEventType` Literal에 `"bed-exit"` 포함.
- `ml/events/edge_ingest_client.py` — `EdgeIngestClient` → `/ingest/alerts` HMAC POST.
- `backend/src/ingest/ingest-alert.service.ts` — `type:"bed-exit"` 수용, freshness 5분, idempotency, Alert+outbox. 시간윈도우 평가 없음.
- `backend/src/alert-rules/controllers/alert-rules.controller.ts` — 501 stub(Phase 2 거점).
- `front/src/stores/monitorSettingsStore.ts`, `front/src/types/index.ts:342` — `MonitorSettings`(localStorage, 시간창 필드 없음; Phase 3 거점).
- `scripts/ml-edge-single-mock-rtsp-bedexit.sh` — 단일 카메라 bed-exit RTSP E2E 하네스(미추적); 모델 레이어만 스크립트 지오메트리 스텁, 나머지는 실 런타임. 첫 E2E 기반.
- `ml/config/ml-worker.example.yaml` — `domains.enabled:[fall,bed_exit]` 현행; 여기에 per-domain 맵 + `night_window` 시드.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| NightWindow | 계약(config) | start, end, tz | DomainContract(bed_exit)가 보유; backend SSOT 소유, edge YAML 시드 |
| DomainContract | 계약(config) | enabled, params(domain별) | DomainsConfig가 N개 보유; factory에 주입 |
| BedExitEvent | 이벤트 | person_id, bed_id, domain, event_type, evidence | NightWindow 게이트 통과 시에만 생성 → EdgeIngestClient |
| Clock | 런타임 포트 | now()->datetime(tz) | bed_exit에 주입; 테스트에서 고정 |
| EdgeWorkerConfig | config 루트 | version, ingest, runtime, models, domains, cameras | domains(DomainContract 맵) 보유 |

## Ontology Convergence
아키텍처 인터뷰(엔티티=계약/컴포넌트)로 도메인 엔티티 추출은 부수적. 최종 라운드 기준 엔티티 안정(NightWindow/DomainContract/Clock 동일 명명 유지). Stability: N/A(round별 엔티티 스냅샷 미수집).

## Interview Transcript
<details>
<summary>Full Q&A (R0–R5, dedup 적용)</summary>

### Round 0 — 토폴로지 확정
**A:** 맞다 — 4개로 진행(layer-routing, parallel-domains, temporal-judgment, web-time-config)

### Round 1 — 게이팅 판정 위치 (탐색)
**A(누적):** "mvp지만 production급으로… B가 맞는 것 같다, 설정은 백엔드에서 받아 저장, 미설정이면 default" → "하나의 요양원 facility로 뿌려짐, 다른 도메인 쌓으면 프레임 계속 받는 구조" → "ADR stale, ml 2인스턴스 분리, ml은 신호 계속 보내야" → "엥 우리 edge-api 거쳐서 백엔드 가는 흐름이잖아"

### Round 2 — 재개·사실 갱신 후 해소
**A:** front 설정→backend 전파·영속(SSOT+default)→계약을 edge로 전파; 한 카메라 다중 도메인 독립 계약; 첫 E2E=야간 침상이탈. (F12로 edge-api 오해 해소) — Ambiguity 100%→37%

### Round 3 — backend→edge 전파 채널
**Q:** best practice? → 조사(F16): infrequent config=pull+fallback, push 과설계, A→B→C 가산
**A:** A) 정적 YAML 시드로 시작 — Ambiguity 37%→21%

### Round 4 — 야간 게이트 의미론
**A:** 1) 억제(suppress) — 야간창 밖 침상이탈 미emit; success=야간 도달/낮 미도달 — Ambiguity 21%→15.5%

### Round 5 — 종결(Closure+Restate)
**A:** 그대로 crystallize — 목표 문장·기본값(21:00–05:00 Asia/Seoul; fall+bed_exit 실증; Phase2/3 분리) OK → spec 쓰고 ralplan으로 — Ambiguity →5%

</details>
