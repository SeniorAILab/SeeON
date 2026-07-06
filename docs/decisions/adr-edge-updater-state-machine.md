# ADR: 엣지 updater 데몬 상태기계

## Decision

엣지 updater는 배포 자동화를 맡는 **결정론적 데몬**으로 둔다. LLM, 에이전트 추론, 자연어 판단, 임의 재시도 정책은 업데이트 경로에 넣지 않는다. 데몬은 로컬 설정과 backend 지시, GHCR manifest digest, compose 명령 결과, readiness 술어만으로 상태를 전이한다.

상태기계는 다음 단방향 흐름을 표준으로 한다.

```text
IDLE
  → CHECK
  → SNAPSHOT
  → PULL
  → APPLY
  → VERIFY
  → COMMIT
  → REPORT
```

실패 시 `VERIFY` 이전/도중의 적용 실패는 아래 보상 흐름으로 간다.

```text
APPLY 또는 VERIFY 실패
  → ROLLBACK
  → REPORT
  → IDLE
```

각 상태의 책임은 다음과 같다.

| 상태 | 책임 |
| --- | --- |
| `IDLE` | backend의 업데이트 지시 또는 주기적 확인 시각까지 대기한다. 중복 실행을 막는 로컬 락을 잡지 못하면 새 실행을 시작하지 않는다. |
| `CHECK` | GHCR manifest에서 대상 이미지 digest를 조회하고, 현재 실행 중 digest와 비교한다. digest가 같으면 변경 없음으로 `REPORT` 후 `IDLE`로 돌아간다. tag 문자열 비교만으로 업데이트 여부를 판단하지 않는다. |
| `SNAPSHOT` | 현재 tag, 현재 digest, env/compose 입력의 해시, 생성 시각을 로컬 스냅샷 JSON으로 저장한다. 스냅샷 쓰기 실패는 업데이트 실패로 보고 적용을 시작하지 않는다. |
| `PULL` | 대상 tag/digest 이미지를 pull한다. pull 실패는 현재 컨테이너를 건드리지 않고 실패 보고한다. |
| `APPLY` | `docker compose -f compose.edge.yaml up -d`에 해당하는 compose 재기동을 수행한다. 적용 대상은 엣지 compose 서비스로 한정한다. |
| `VERIFY` | readiness 술어가 유예시간 안에 모두 참이 되는지 확인한다. |
| `COMMIT` | 새 digest를 현재 성공 버전으로 기록하고 스냅샷을 last-known-good 기준으로 승격한다. |
| `ROLLBACK` | 스냅샷의 이전 tag/env/compose 입력을 복원하고 compose를 다시 기동한다. rollback 결과도 반드시 기록한다. |
| `REPORT` | 성공, 변경 없음, 실패, rollback 성공/실패를 backend에 보고하고 로컬 로그에 남긴다. 침묵 실패는 금지한다. |

readiness 술어는 모두 참이어야 한다.

1. `ml-api`의 `/health/ready`가 HTTP 200을 반환한다.
2. worker heartbeat 수신이 재개된다. 기준은 `ml-api`가 보유한 relay-heartbeat 기반 상태이며, 유예시간 `N`분은 배포 설정값으로 둔다.
3. 버전 엔드포인트가 기대 버전과 일치한다. 기대값은 `CHECK`에서 선택한 GHCR digest 또는 그 digest에 대응하는 build/version metadata이고, running endpoint가 반환한 값과 byte-for-byte로 비교한다.

스냅샷 JSON 스키마는 최소 다음 필드를 포함한다.

```json
{
  "prev_tag": "ghcr.io/<owner>/<image>:<tag>",
  "prev_digest": "sha256:<digest>",
  "env_hash": "sha256:<env-and-compose-input-hash>",
  "ts": "2026-07-06T00:00:00Z"
}
```

- `prev_tag`: rollback에 사용할 직전 이미지 tag.
- `prev_digest`: `CHECK`가 GHCR manifest에서 확인한 직전 digest.
- `env_hash`: updater가 적용 직전에 읽은 env와 compose 입력의 정규화 해시. 실제 env 값이나 secret 값은 저장하지 않는다.
- `ts`: 스냅샷 생성 시각의 UTC ISO-8601 문자열.

롤백 경계는 명확히 제한한다. 컨테이너 tag/digest와 env/compose 입력은 스냅샷으로 되돌릴 수 있지만, DB 마이그레이션은 되돌리지 않는다. 현재 엣지 노드는 DB를 보유하지 않으므로 엣지 자체에는 DB rollback 대상이 없다. backend DB 변경은 중앙 backend 배포의 책임이며, 엣지 updater가 개입하지 않는다. 따라서 순방향 호환 규칙은 **backend 먼저 배포, 엣지는 그 다음 배포**다. backend API/DTO/event 계약은 새 엣지와 이전 엣지가 모두 동작하는 기간을 견뎌야 한다.

실패 기록은 두 경로 모두 필수다.

- 로컬: 상태, 대상 tag/digest, 이전 digest, 실패 단계, 실패 원인, rollback 시도/결과를 append-only 로그로 남긴다. secret/env 원문은 남기지 않는다.
- backend: 성공, 변경 없음, 실패, rollback 성공, rollback 실패를 보고한다. backend가 일시적으로 unreachable이면 로컬 outbox에 적재하고 재전송한다.

canary/fleet rollout은 지금 결정하지 않는다. 엣지 2대 이상을 운영하는 시점에 재평가하며, 그때 per-edge health, staged rollout, fleet-wide rollback, backend 리포트 집계 규칙을 별도 ADR로 정한다.

## Drivers

- 현장 엣지는 원격 접속이 제한될 수 있으므로 실패 시 자동으로 last-known-good 컨테이너 조합으로 복귀해야 한다.
- tag는 mutable할 수 있으므로 배포 판단과 검증 기준은 GHCR manifest digest여야 한다.
- worker heartbeat는 실제 엣지 루프가 다시 살아났는지 보여주는 사용자 영향 지표다. `ml-api` readiness만으로는 worker 재개를 증명하지 못한다.
- 엣지에는 DB가 없고 중앙 backend가 API/DB 호환성을 책임진다. rollback을 컨테이너 경계 안에 가둬야 복구가 예측 가능하다.
- 배포 실패는 운영자가 모르면 장애가 된다. 로컬 로그와 backend 리포트를 모두 요구해 침묵 실패를 막는다.
- 업데이트 데몬은 안전 경로이므로 비결정적 LLM 판단이나 대화형 절차를 배제해야 한다.

## Alternatives considered

- **Watchtower로 컨테이너 자동 갱신:** 기각한다. Watchtower는 이미지 감지와 컨테이너 재시작에는 적합하지만 이 계약의 핵심인 GHCR digest 비교, 사전 스냅샷 스키마, `ml-api` readiness + worker heartbeat + 버전 일치의 복합 검증, backend 성공/rollback 리포트, 실패 outbox, 명시적 rollback 경계를 한 제품 상태기계로 보장하지 않는다. 특히 업데이트 후 앱 레벨 검증 실패를 backend에 구조적으로 보고하고 스냅샷 기반으로 compose 입력까지 복원하는 요구와 맞지 않는다.
- **수동 SSH 배포:** 기각한다. 현장 장비별 절차 편차와 작업자 실수가 크고, 실패/rollback 기록이 표준화되지 않는다.
- **tag 문자열만 비교:** 기각한다. 동일 tag 재푸시와 registry/cache 상태를 구분하지 못한다. 업데이트 여부와 버전 일치는 GHCR manifest digest를 기준으로 한다.
- **readiness를 `/health/ready`만으로 판단:** 기각한다. gateway process만 살아 있고 worker 루프가 heartbeat를 재개하지 못한 상태를 성공으로 오판할 수 있다.
- **DB까지 포함한 범용 rollback:** 기각한다. 엣지에는 DB가 없어 해당 없으며, 중앙 backend DB migration rollback은 엣지 updater의 권한과 관측 범위를 벗어난다.
- **LLM/agent가 배포 판단을 보조:** 기각한다. 업데이트 경로는 재현 가능하고 감사 가능한 결정론적 상태기계여야 한다.

## Why chosen

작은 전용 상태기계가 엣지 업데이트의 실제 위험 경계와 가장 잘 맞는다. GHCR digest로 변경을 판정하고, 적용 전 스냅샷을 남기며, compose 적용 후 서비스 readiness와 worker heartbeat를 함께 확인하면 "컨테이너는 떴지만 감지는 죽은" 상태를 실패로 처리할 수 있다. rollback을 컨테이너/env/compose 경계로 제한하면 중앙 backend DB와의 책임도 섞이지 않는다.

## Consequences

- updater 구현은 상태별 idempotency와 재시작 복구를 고려해야 한다. 데몬 재시작 후에도 마지막 실행 상태, 스냅샷, pending report/outbox를 읽어 중복 적용이나 침묵 실패를 피해야 한다.
- compose/env 입력의 정규화 해시 규칙이 필요하다. 해시는 secret 원문을 저장하지 않으면서도 적용 당시 입력이 무엇이었는지 감사할 수 있어야 한다.
- backend 리포트 API는 상태, target tag/digest, previous digest, failure phase, rollback result, timestamp를 받을 수 있어야 한다. secret 값은 payload에 포함하지 않는다.
- backend 배포는 엣지보다 먼저 진행되어야 하며, backend는 이전 엣지와 새 엣지가 함께 존재하는 전환 기간을 순방향 호환으로 처리해야 한다.
- `VERIFY` 유예시간 `N`분은 현장 네트워크와 모델/RTSP warm-up 시간을 반영해 운영 설정으로 둔다. 값이 너무 짧으면 정상 warm-up을 rollback으로 오판하고, 너무 길면 장애 체류 시간이 늘어난다.
- canary/fleet 제어가 필요해지는 순간 이 ADR만으로는 충분하지 않다. 엣지 2대 이상 운영 시 별도 fleet rollout 결정을 추가해야 한다.

## Follow-ups

- updater 구현 시 상태 저장 위치, 파일 락, append-only 로컬 로그, backend report outbox 경로를 확정한다.
- GHCR manifest 조회 방식과 인증 실패/네트워크 실패의 retry/backoff 상한을 구현 계약으로 고정한다.
- version endpoint의 응답 필드와 digest/build metadata 매핑을 `ml-api`와 worker 쪽 계약으로 추가한다.
- backend updater-report API의 DTO와 인증/테넌트 경계를 별도 구현 PR에서 고정한다.
- `VERIFY` 유예시간 `N`분의 기본값과 운영 override env 이름을 정한다.
- 엣지 2대 이상 운영이 시작되면 canary/fleet rollout ADR을 새로 작성한다.
