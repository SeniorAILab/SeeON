# 야간 침상 이탈 엣지 추론 E2E — 최종 계획 v2 (consensus APPROVED)

## Status
Consensus 도달: Architect WATCH/COMMENT(BLOCK 전건 resolved), Critic OKAY/APPROVE (stage-17). 사용자 사전 실행 승인("합의되면 진행하자") 충족 → 실행 handoff(ultragoal).

## Consensus 합의 본문 (full)
`.gjc/_session-019efd68-a1e2-7000-9d1d-fb85d43a677d/plans/ralplan/019efd68-a1e2-7000-9d1d-fb85d43a677d/stage-15-revision.md` (sha 2f28418a) — 컴포넌트/파일변경/시퀀싱/AC/pre-mortem/리스크 전체. run_id=019efc7f.

## 4개 PR 슬라이스
- **G1 (docs-only)**: ADR 거버넌스 = self-complete·MECE + `## Changelog` 한 줄 + `References`/`Refines` 링크(supersede 체인/coverage matrix/retired-source 제거, 상태 Proposed|Accepted|Deprecated). `AGENTS.md` 한 줄 + `docs/decisions/README.md` 정리.
- **C1 (egress gateway)**: `ml-api`가 backend와 통신하는 **유일 프로세스**(alert+heartbeat 둘 다). worker→loopback relay(`/relay/alerts`+`X-Edge-Relay-Token`+camera identity binding), HMAC·outbox·secret은 api 소유, worker는 backend 자격증명 0.
  - **2-ADR 응집**: ADR① worker↔ml-api(ADR-067 제자리 갱신), ADR② ml-api↔backend(ADR-029 제자리 갱신, ADR-023 References). ADR-068은 경로 한 줄. 
  - **레포 전역 정합**: root `AGENTS.md`, `docs/api`, `docs/rules`, `docs/runbooks`, `ml/README`, `ml/*/AGENTS.md`, `compose.edge.yaml`에서 worker→backend 직접 egress 표현 제거(권위는 ADR, 나머지 링크). repo-wide search AC.
- **C2 (도메인)**: per-domain 계약맵(`domains:{fall,bed_exit:{night_window}}`) + bed_exit **야간 SUPPRESS** 게이트(주입 벽시계, `frame.time_sec` 금지). **bed_exit 입력 = YOLO26 person bbox(detect) + bed-seg, pose 아님.** pose/LSTM-fall은 fall 도메인 전용(slice-1 제외).
- **C3 (E2E, 2-tier)**: worker→ml-api→backend `/ingest/alerts` 야간 도달/주간 suppress.
  - Tier-1(지금 실행): 실제 worker/perception/domain/transport/backend ingest + **모델 runner만 ADR-057 경계 stub**(가중치 부재). night→DB row, day→미발생. `scripts/ml-worker-*-e2e.sh`, no-stub 규칙 예외 명시.
  - Tier-2(하드웨어 게이트): real YOLO26 weights, 가중치 동기화 시.

## ADR (distilled)
- Decision: (1) edge 단일 backend-facing = ml-api(alert+heartbeat egress gateway); worker backend 연결 없음. (2) bed_exit 야간 SUPPRESS, edge 도메인 주입 벽시계. (3) bed_exit 사람 입력 = YOLO26 person bbox. (4) 도메인 계약 = YAML per-domain 맵. (5) ADR 거버넌스 = self-complete + Changelog + References/Refines.
- Drivers: 공격표면 최소, 권위 일관성, monotonic time_sec 정확성, 단순성.
- Rejected: T1(worker 직접 egress), D2(NightGate decorator), G-A(supersede chain+matrix), pose-for-bed-exit(과함).
- Consequences: ml-api가 ingest key/HMAC/outbox 소유; worker=RTSP/추론/도메인; ADR 번호=안정 토픽 앵커; backend/front/DB/Kakao 코드 0.
- Follow-ups: Phase2(backend SSOT 영속+boot fetch), Phase3(front 시간창 UI+주기 reconcile pull), C7(방/카메라별 계약), C3 Tier-2(real weights).

## Intent Reconciliation (대부분 사용자 직접 확정)
- egress=worker→ml-api→backend(spec의 worker 직접 egress supersede) ✓ 사용자 결정.
- G1 별도 docs-only PR ✓. 2-ADR 응집 ✓. person-bbox ✓. C3 Tier-1 stub(가중치 부재) ✓ 사용자 "진행".
- 설계 기본값: HMAC key per-camera(저장만 api 이동)/identity worker payload+api 검증/loopback relay token; night_window 21:00–05:00 Asia/Seoul.
- 외부 craft-skills PR #16(같은 ADR 모델) — 이 레포 diff 아님.

## 실행 전략 (subagent 풀가동, 파일 겹침 고려)
- 병렬 가능(disjoint): C2 domain(`ml/domains/*`) ∥ C1 api(`ml/api/*`,`ml/events/*`).
- 직렬 필요(공유 파일): `ml/runtime/edge_worker_config.py`·`ml/worker/edge_worker.py`·`ml/config/ml-worker.example.yaml`(C1+C2), `AGENTS.md`(G1+C1) → 한 작업자가 묶어서.
- C3는 C1+C2 후. docs(G1+C1)는 코드와 분리 가능.
- 검증: 작업자는 게이트/포맷 실행 안 함; 통합 후 caller가 `uv run --directory ml pytest` + repo search 1회.

## Approval
사용자 실행 승인 충족 → `/skill:ultragoal`로 goal-tracked 실행. 미세 조정 필요시 형이 중단/수정 지시.
