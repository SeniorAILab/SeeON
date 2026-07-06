# ADR: 엣지 증거 클립 스토어 계약 (P-CLIP-0)

Scope: P-CLIP/P-CLIP-API 구현 전에 고정하는 엣지 로컬 증거 클립 저장·재생·라벨 계약이다. 이 ADR은 계약 선행 문서이며 제품 동작을 아직 구현하지 않는다. 구현은 후속 P-CLIP 및 P-CLIP-API 슬라이스에서만 수행한다.

## Decision

- **스토리지 경계.** 엣지 Compose는 `clip-store` named volume 1개를 둔다. `ml-worker`는 read/write 권한으로 마운트하고, `ml-api`는 read-only 권한으로 마운트한다. 클립 바이트는 엣지 로컬 볼륨에만 존재하며 backend/cloud로 업로드하지 않는다.
- **레코딩 방식.** worker는 추론 루프와 분리된 별도 스레드 또는 프로세스에서 디스크 세그먼트 레코더를 상시 구동한다. 메모리 링 버퍼 기반 클립 저장은 금지한다. 탐지 시 해당 이벤트의 `clip_id`로 전 10초 + 후 20초 범위를 finalize한다.
- **매니페스트.** 각 클립은 finalize 완료 시 매니페스트를 남긴다. 매니페스트 쓰기는 임시 파일 작성 후 같은 파일시스템 내 `rename`으로 교체하는 원자적 finalize여야 한다. 스키마는 다음 필드를 고정한다: `{clip_id, camera_id, event_ref, started_at, duration_s, codec, path, finalized}`. `started_at`은 UTC이고 `finalized`는 boolean이다.
- **소유권 분리.** worker는 클립 바이트 생성, 매니페스트 finalize, 보존 30일 + 디스크 80% 기준 로테이션을 소유한다. `ml-api`는 인증 뒤 재생, 진위 라벨(`null|TP|FP` + reviewer/time), 열람 접속기록, 라벨/감사로그의 backend 백업 동기화를 소유한다. backend 백업에는 라벨과 감사 메타데이터만 포함하고 클립 바이트는 포함하지 않는다.
- **비간섭 요구.** 레코더 장애, 디스크 지연, 로테이션 실패, finalize 실패는 추론 루프를 막지 않는다. 레코더는 추론과 별도 실행 단위 및 별도 백프레셜 경계를 가져야 하며, 실패는 관측 가능하게 기록하되 탐지는 계속된다.
- **구현 상태.** 이 결정은 미구현 계약이다. 현 코드가 이 동작을 제공한다고 주장하지 않으며, 구현과 검증은 P-CLIP/P-CLIP-API에서 수행한다.

## Drivers

- CCTV/돌봄 증거의 법적 경계: 클립 바이트는 현장 엣지에 머물러야 하며 cloud/backend 업로드는 별도 계약 전까지 금지된다.
- 탐지 안정성: 증거 저장 실패가 베드 이탈/낙상 추론과 이벤트 전송을 중단해서는 안 된다.
- 운영 검토성: 대시보드에서 인증된 사용자만 클립을 재생하고 라벨·접속기록·감사 백업을 남겨야 한다.
- 병렬 구현 안전성: worker 저장 계약(P-CLIP)과 `ml-api` 재생/라벨 계약(P-CLIP-API)이 같은 매니페스트와 볼륨 경계를 공유해야 한다.

## Alternatives considered

- **메모리 링 버퍼 기반 클립 저장:** 추론 프로세스 메모리 압력과 장애 전파를 만들고 재시작 시 증거를 잃으므로 거부한다.
- **worker가 클립 재생 API까지 소유:** worker에 두 번째 HTTP 제어면을 만들고 단방향 `worker→ml-api→backend` 불변식을 흐리므로 거부한다.
- **backend/cloud로 클립 바이트 업로드:** 법적 경계와 현장 로컬 보관 결정을 위반하므로 거부한다. 라벨·감사 메타데이터 백업만 허용한다.
- **탐지 시점에만 파일 녹화 시작:** 전 10초 증거를 보장할 수 없으므로 거부한다. 디스크 세그먼트 상시 기록을 사용한다.

## Why chosen

이 계약은 클립 바이트의 법적 보관 경계를 엣지 로컬로 고정하면서도 운영자는 인증된 `ml-api` 화면을 통해 재생·라벨·감사를 수행할 수 있게 한다. 디스크 세그먼트 레코더와 원자적 매니페스트 finalize는 전/후 증거 범위를 재현 가능하게 만들고, worker와 `ml-api`의 권한을 volume RW/RO로 나눠 병렬 구현 충돌을 줄인다.

## Consequences

- `compose.edge.yaml` 구현 시 `clip-store` named volume을 추가하고 worker는 RW, `ml-api`는 RO로 마운트해야 한다.
- P-CLIP은 세그먼트 레코더, 전10/후20 finalize, UTC timestamp, 보존 30일 + 디스크 80% 로테이션, 추론 비간섭 검증을 제공해야 한다.
- P-CLIP-API는 매니페스트 기반 인증 재생, `null|TP|FP` 라벨과 reviewer/time 기록, 열람 접속기록, 라벨/감사 backend 백업을 제공해야 한다.
- 클립 바이트 업로드, 미인증 재생 엔드포인트, LAN 신뢰 기반 공개 URL은 이 ADR 위반이다.

## Follow-ups

- P-CLIP: worker 디스크 세그먼트 레코더, 매니페스트 원자성, 로테이션, 비간섭 테스트 구현.
- P-CLIP-API: `ml-api` read-only 재생, 인증/접속기록, 라벨 저장, backend 라벨/감사 백업 구현.
- 별도 정책 결정 전까지 클립 바이트의 backend/cloud 업로드 및 dataset export는 보류한다.
