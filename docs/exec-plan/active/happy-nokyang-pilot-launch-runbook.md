# 행복한요양원 녹양역점 파일럿 — 아침 실행 런북

**모든 단계는 사람이 직접 실행한다.** 각 단계에 "다음으로 넘어가도 되는 조건"을
적었다. 조건이 안 맞으면 멈춘다.

명령은 저장소의 실제 스크립트에서 확인했다:
`package.json:33`(`release:prod`), `scripts/deploy/iwinv-deploy.sh:22`(usage),
`iwinv-deploy.sh:342`(`verify_services` = 정확 SHA + DB health).

---

## 0. 시작 전 확인

```bash
git status --short          # compose.yaml 외 dirty 없어야 함
gh pr checks 657 --repo SeniorAILab/eldercare-fall-ai
gh pr checks 658 --repo SeniorAILab/eldercare-fall-ai
gh pr checks 142 --repo SeniorAILab/eldercare-fall-ml-v2
```

**진행 조건:** 세 PR 모두 전 항목 pass.

---

## 1. 스크린샷 승인

```
.gjc/_session-019fc81a-.../ultragoal/artifacts/
  monitor-mixed.png      위험 1 + 확인됨 1 + 연결 끊김 5
  monitor-all-live.png   전 카메라 연결, 위험/확인필요/주의/안정 혼재
```

**볼 것**

- 끊긴 방: 회색 해칭 + "연결 끊김" + 카메라-꺼짐 아이콘 (체크 표시가 아님)
- 위험한 방이 끊긴 방들 사이에서 **맨 앞**에 오는가
- "확인됨" 배지가 붙은 방과 안 붙은 방이 구분되는가
- 4m 떨어져서 읽히는가

**진행 조건:** 이 화면을 요양보호사에게 보여줘도 되겠다는 판단.

---

## 2. PR 병합 — 순서 고정

```bash
gh pr merge 657 --repo SeniorAILab/eldercare-fall-ai --squash
# main CI 통과 확인 후
gh pr merge 658 --repo SeniorAILab/eldercare-fall-ai --squash
gh pr merge 142 --repo SeniorAILab/eldercare-fall-ml-v2 --squash
```

**순서를 지켜야 하는 이유:** #658은 `SpaceStatus.connection` 타입을 쓴다.
#657 없이 병합하면 빌드가 깨진다.

**진행 조건:** `main` CI green.

---

## 3. 릴리스 발행

```bash
pnpm release:prod -- vX.Y.Z
```

> **태그 push로는 배포가 안 나간다.** `release: published` 트리거만 동작한다.

배포 경로: Actions → Jenkins webhook(30초, 재시도 없음) → SHA resolve →
`iwinv-deploy.sh --sha <sha>`

**진행 조건:** Jenkins 잡이 실제로 시작됐는지 확인. 30초 안에 안 잡히면
webhook을 놓친 것이므로 수동 트리거.

---

## 4. Smoke — **엣지부터**

### 4-1. 엣지 대시보드 (제일 먼저)

엣지 대시보드 → 연결 설정 화면

| 항목 | 정상 | 비정상일 때 |
|---|---|---|
| **클라우드 전송** | `정상 · 마지막 전송 …` | 문구에 다음 확인 대상이 적혀 있다 |
| 카메라 카드 → 클라우드 연동 | `연동 완료` | `연동 대기` = 방 미지정 |
| 카메라 카드 → 연결 이력 | `마지막 연결 …` | `한 번도 연결된 적 없음` = 주소·계정 오류 |

**여기가 실패면 클라우드 현황판은 볼 것도 없이 전부 회색이다.**
heartbeat URL의 `/api` prefix 수정이 실제로 통하는지는 여기서만 확인된다.

### 4-2. 클라우드

```bash
ssh iwinv 'docker ps --format "{{.Names}}\t{{.Status}}"'
```

- 로그인 → 현황판 진입 (무한 로딩이 아님)
- 카메라 2대 방이 초록, 나머지 회색 해칭
- 알림 하나에 **확인** → 배지 뜨는지 → 메모 → **해결 완료**

**진행 조건:** 위 흐름이 끊김 없이 완료.

---

## 5. 배포 실패 시 (자동 복구 없음)

`verify_services` 실패 시 `activate_manifest`가 실행되지 않아
**`current.json`은 구버전인데 깨진 신버전 컨테이너가 떠 있을 수 있다.**

```bash
ssh iwinv '<app_root>/scripts/deploy/iwinv-deploy.sh --rollback'
# 특정 SHA로: --rollback <sha>
```

롤백 후 **4번 smoke를 처음부터 다시** 실행한다.

---

## 6. Space 47행 정리 — 파괴적, 되돌릴 수 없음

**반드시 덤프 먼저.**

```bash
# 1) 덤프
ssh iwinv 'docker exec eldercare-fall-db pg_dump -U <user> -d <db> \
  -t spaces -t floors --data-only' > spaces-floors-$(date +%Y%m%d-%H%M).sql
```

```sql
-- 0) 시설 id 확인 — 이후 모든 쿼리에 이 값을 넣는다
SELECT id, name FROM facilities;
-- 행복한요양원 녹양역점 = cmrkv2mqd0000nz5t44td921i

-- 2) 삭제 대상 수 확인 — 47이어야 한다
--    카메라·이벤트·알림이 전무한 방만 해당
--    spaces/cameras/events/alerts는 모두 facility_id를 갖고 FK가
--    (facility_id, space_id) 복합키다. 시설 스코프를 빼면 다른 시설의
--    행까지 대상이 되므로 반드시 넣는다.
SELECT count(*) FROM spaces s
WHERE s.facility_id = 'cmrkv2mqd0000nz5t44td921i'
  AND NOT EXISTS (
    SELECT 1 FROM cameras c
    WHERE c.facility_id = s.facility_id AND c.space_id = s.id)
  AND NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.facility_id = s.facility_id AND e.space_id = s.id)
  AND NOT EXISTS (
    SELECT 1 FROM alerts a
    WHERE a.facility_id = s.facility_id AND a.space_id = s.id);

-- 3) 47이 확인된 뒤에만 DELETE — 위 WHERE를 그대로 옮긴다
-- DELETE FROM spaces s WHERE s.facility_id = '...' AND NOT EXISTS (...);

-- 4) 삭제 후 같은 count 쿼리 → 0
-- 5) 남은 방 수 확인 → 7 (카메라가 붙은 방)
SELECT count(*) FROM spaces WHERE facility_id = 'cmrkv2mqd0000nz5t44td921i';
```

**중단 조건:** 2번 결과가 47이 아니면 **멈춘다.** 시드 이후 데이터가 붙었다는
뜻이므로 대상을 다시 산정해야 한다.

`Space`에는 `onDelete: Cascade`가 없어 FK 충돌 없이 지워진다.

---

## 7. 2녹색 / 5회색 오라클

맥북 + rtsp-generator로 카메라 2대 구동. GPU 도착 전이므로 2대만.

### 7-1. 합성 스트림 2개 띄우기

`rtsp-generator` 저장소 (`README.md:39-59`, `pyproject.toml:17`):

```bash
cd "rtsp-generator"
uv sync --group dev

# 한 스택에서 2개 경로를 서빙한다 — --video와 --path를 쌍으로 반복
uv run rtsp-generator start ./fall-sample.mp4 --path cam_sp_205 \
                            ./fall-sample.mp4 --path cam_sp_2f_prog \
                            --name nursing-home --detach

uv run rtsp-generator list        # 생성된 RTSP URL 확인
```

정리:

```bash
uv run rtsp-generator stop --name nursing-home
```

> **카메라 id 주의.** 프로덕션에 이미 있는 카메라는 `cam_sp_205`(205호)와
> `cam_sp_2f_prog`(프로그램실)이다. 엣지 등록 시 이 두 방에 매핑해야
> 오라클이 성립한다. 새 id로 등록하면 클라우드에 카메라가 추가돼
> 7대가 아니라 9대가 된다.

### 7-2. 판정

**기계 판정(육안 아님)** — 현황판에서 개발자도구 콘솔:

```js
[...document.querySelectorAll('[data-connection]')]
  .reduce((a, n) => (a[n.dataset.connection] = (a[n.dataset.connection] || 0) + 1, a), {})
// 기대: { LIVE: 2, STALE: 5 }
```

타일마다 `data-space-id` / `data-status` / `data-connection`이 붙어 있다.

**완료 조건:** `LIVE: 2, STALE: 5`.

---

## 오늘 범위 밖 (합의된 이월)

- **I2 감지 근거 영상** — 코드는 완비. `EVENT_CLIPS_ENABLED`(클라우드)와
  `ML_WORKER_EVENT_CLIP_EXPORT_ENABLED`(엣지) env만 꺼져 있다. 꺼진 동안
  화면은 "근거 영상 저장이 아직 켜져 있지 않습니다"로 사실대로 말한다
  ("이 알림에 영상이 없다"고 거짓말하지 않는다).

- **멀티테넌시** — `EdgeFacilityTokenGuard`가 `x-facility-id`를 검증 없이
  신뢰한다. 단일 시설에서는 노출되지 않지만 **2번째 요양원 온보딩 전 필수**.
  (`EdgeIngestTokenGuard`는 서버에서 소유권을 해석하므로 이벤트 주입은 불가)
