# Plan: ml-data-domain-layout-and-decision-docs

```yaml
slug: ml-data-domain-layout-and-decision-docs
date: 2026-06-10
author: omc-plan (consensus: Planner → Architect → Critic — APPROVE)
spec: ./spec.md
approved: 2026-06-10 (user) — 수정 1건 반영: le2i 데이터는 main 체크아웃으로 mv가 아닌 cp(복사), 원본 보존
issue: "#45"
status: done
```

---

## RALPLAN-DR Summary

### Principles (이 계획을 지배하는 원칙)
1. **도메인(출처)이 1차 축, 역할(role)은 도메인 내부 강제 어휘** — `ml/data/{domain}/{raw,processed,poses,annotated}`. 임의 명명 금지.
2. **개인정보 경계는 구조로 표현된다** — 요양원(nursing-home) 데이터는 배포 모드 코드 경로에서 도달 불가능해야 한다. `uploads/`만이 외부 테스터가 닿을 수 있는 유일한 입력면.
3. **ADR은 되돌리기 비싼 결정만, 운영 세부는 rules 한 장** — 기존 ADR-003/005/009와 MECE, ADR-004/007은 supersede 관계만 명시(본문 수정·삭제 금지).
4. **코드가 규약을 따른다, 역은 금지** — 경로의 single source of truth는 `training/config.py` + `demo/video_registry.py` 상수. 이동 후 ruff + pytest 전체 그린이 완료 조건.
5. **진행 중 작업과 직렬화** — feat/40-2b 워크트리의 review-fix 배치가 `config.py`/`evaluate.py`/`video_registry.py`를 공유하므로, 그 PR 머지 **후** 새 워크트리에서 시작.

### Decision Drivers (top-3)
1. **재발 방지**: ADR-004/007의 역할 축만으로는 `le2i_raw`/`le2i_poses` 같은 파티션 밖 폴더가 계속 생긴다 — 도메인 축 공백이 근본 원인.
2. **배포 전제의 프라이버시**: 외부 테스터 공개가 확정 방향 — 요양원 영상 비노출은 협상 불가 제약.
3. **데이터 단일화 UX**: 학습·평가·데모가 같은 클립 저장소를 봐야 한다 — 현재 main/워크트리 두 체크아웃에 분산(gitignore라 git이 동기화하지 않음).

### Viable Options

**O1 — 워크트리 데이터 공유 방식** (gitignore된 `ml/data/`는 체크아웃마다 따로 존재)
| | A. 심볼릭 링크 (채택) | B. 환경변수 `FALL_DATA_ROOT` | C. 체크아웃별 복사 유지 |
|---|---|---|---|
| 방법 | 워크트리 `ml/data` → main 체크아웃 `ml/data` symlink. `git wt` 스크립트가 생성 | config.py가 env var로 데이터 루트 해석 | 현상 유지 |
| 장점 | 코드 변경 0, 모든 도구가 즉시 단일 저장소를 봄 | 명시적, CI/배포에 유연 | 작업 없음 |
| 단점 | macOS/로컬 전제(현 단계 OK), wt 스크립트 1줄 수정 | 모든 경로 상수에 env 분기 — 코드 침습, 미설정 시 동작 모호 | 분산 문제 지속(이번 작업의 발단) |
| 판정 | **채택** — 가장 가벼운 경로. env var는 배포 사이클에 후속(ADR Follow-up) | 기각(과설계) | 기각(문제 방치) |

**O2 — 배포 모드 분리 메커니즘**
| | A. 환경변수 `FALL_DEMO_MODE`, **기본 `public`** (채택) | B. 별도 엔트리포인트 (app_public.py) | C. 설정 파일 |
|---|---|---|---|
| 방법 | **기본 `public`(fail-safe)** / 로컬은 `operator` 명시 설정. public이면 내부 드롭다운 비노출 + **본인 세션 업로드만** 추론 | 공개용 앱 파일 분리 | demo.toml 등 |
| 장점 | 코드 1곳 분기, **env 미설정·배포 실수 시에도 안전 측으로 실패** (개인정보 경계가 사람 기억에 의존하지 않음) | 코드 경로 물리 분리(실수 차단력 최강) | 구조화 |
| 단점 | 로컬 실행마다 `operator` 필요 → 데모 실행 커맨드/Makefile 타깃에 1회 고정으로 마찰 제거 | 파일 중복, live_view 공유로 이득 반감 | 과함, 또 하나의 상태 |
| 판정 | **채택 (A, public 기본)** — Architect 합의: fail-open(operator 기본) 기각. 로컬 마찰은 실행 스크립트에 `FALL_DEMO_MODE=operator` 고정으로 해소 | 기각 (단, 배포 시점에 물리 분리 재평가 — ADR-011 Access Boundary follow-up) | 기각 |

**O3 — 레이아웃 rules 문서 위치**
- A. 기존 `docs/rules/ml-filesystem-layout.md` **갱신** (채택) — 레이아웃 규약 문서가 두 장이 되는 것을 방지(MECE).
- B. 새 `ml-data-layout.md` 신설 + 구문서 삭제 — 기각: 링크 단절, 이력 분산.

---

## Scope & Sequencing

**선행 조건(하드):** feat/40-2b review-fix 배치 커밋 → PR → main 머지 완료.
이 작업은 **새 GitHub 이슈 + `git wt <issue#>`** 워크트리(`feat/<issue#>-ml-data-domain-layout`)에서 수행.

> **⚠ 데이터 보존 (BLOCKER 방지):** `ml/data/le2i_raw/`·`le2i_poses/`는 gitignore 대상이라 **feat/40-2b 워크트리 체크아웃에만 물리 존재**한다.
> 머지 후 통상적인 `git worktree remove`를 하면 **영구 손실** — Step 2 물리 이동이 끝나기 전까지 feat/40-2b 워크트리 삭제 금지.
> 이동 완료 후에만 워크트리 정리.

**타깃 레이아웃:**
```
ml/data/
├── nursing-home/            # 도메인: 요양원 수집 (개인정보 — 외부 비노출)
│   ├── raw/                 # ← 기존 ml/data/raw (main)
│   ├── processed/           # ← 기존 ml/data/processed (main, gold-8 클립 포함)
│   ├── poses/               # (현재 비어있음 — 강제 어휘로 생성)
│   └── annotated/           # ← 기존 ml/data/annotated (main)
├── le2i/                    # 도메인: 외부 학습 데이터셋
│   ├── raw/                 # ← 기존 ml/data/le2i_raw (feat/40-2b 워크트리)
│   ├── processed/           # (비어있음)
│   ├── poses/               # ← 기존 ml/data/le2i_poses (워크트리)
│   └── annotated/           # (비어있음)
├── eval/                    # 도메인 교차 출력 (le2i-poc-results.csv, gold8-poc-results.csv)
└── uploads/                 # 임시 업로드 — 배포 모드의 유일한 외부 입력면
```
캐노니컬 물리 저장소 = **main 체크아웃** `ml/data/`. 워크트리는 symlink (O1-A).

## Steps

### Step 0 — 문서 골격 (워크트리, 코드 변경 전)
1. spec 이동: `.omc/specs/deep-interview-....md` → `docs/exec-plan/active/{slug}/spec.md` (원본 삭제), 본 plan → 같은 폴더 `plan.md`.
2. **ADR-011 — domain-first ml/data layout** (`docs/decisions/ADR-011-ml-data-domain-first-layout.md`):
   도메인 우선 2계층 파티션 정의(강제 role 어휘 표 포함), 교차 출력 `eval/`·`uploads/` 최상위 예외,
   **ADR-004 부분 supersede**(입력 위치 규칙 → 도메인 내부로 재정의; **gitignore 불변식과 "raw is sacred"(원본 무수정) 불변식은 계승** — 계승 목록에 둘 다 명시),
   **ADR-007 부분 supersede**(role 축 파티션 → 도메인 내부 2차 축으로 강등; **`ml/data/annotated/` → `ml/data/{domain}/annotated/` 위치 변경을 ADR-007 파티션 표 row 6 대체 항목으로 명시 기록** — 구표가 형식적으로 모순된 채 남지 않도록),
   별도 라벨링된 `## Access Boundary` 섹션: *uploads/만 외부 도달 가능, nursing-home/은 operator 모드 전용,
   기본 모드는 public(fail-safe)* — "배포 시점에 독립 ADR로 추출 가능" 주석 명시(레이아웃과 접근 경계는 변경 속도가 다름).
3. **ADR-012 — training pipeline decisions** (`docs/decisions/ADR-012-le2i-training-pipeline-decisions.md`):
   ① Le2i 선택 — **구현 수준 데이터셋 선택 세부**로 한정: "전략 결정(공개 데이터셋 우선, Track 2b)은 ADR-009가 이미 내림"을 서두에 명시, 본 ADR은 *어느* 공개 데이터셋인지와 UP-Fall 기각 사유(Activity-11 Lying 충돌, 다운로드 게이트)만 기록, ② 윈도우 라벨링(T=30/stride=5, overlap≥0.5, 1-based inclusive → 0-based half-open), ③ recall-first 운영 임계값 정책(Recall≥0.90 지점을 metadata.json에 영속), ④ gold-8 2차 평가법(pos_window_frac≥0.5, ADR-009 rule-based floor 비교). 각각 기각 대안 명시. ADR-003/005/009와 경계 문단.
4. `docs/rules/ml-filesystem-layout.md` 갱신: 도메인 우선 표로 교체, 강제 subfolder 어휘 표, "새 도메인 추가 절차" 1단락. **Invariants 섹션의 구 role-축 서술("`ml/data/` subdirs are role-named…")도 함께 재작성** — 표만 바꾸고 옛 불변식 문장이 남는 일 금지.
5. **신규 `docs/rules/ml-training.md`**: T/stride/overlap 파라미터 표, threshold 산출 절차(evaluate → metadata.json), metadata.json 계약(skew-tolerant 로더 규칙 포함), 전처리 규칙(normalize_person_keypoints, CONF_THRESHOLD=0.2, npz 캐시), 재학습 커맨드.
6. `docs/rules/streamlit-demo.md` 갱신: `FALL_DEMO_MODE` 메커니즘(**기본 public — fail-safe**), public 모드 불변식(내부 소스 비노출·세션 업로드만), 로컬 표준 실행 커맨드에 `FALL_DEMO_MODE=operator` 고정.

### Step 1 — 코드 경로 갱신 (데이터 이동 전, 워크트리)
1. `training/config.py`: `DATA_ROOT = _ML_ROOT/"data"`, `RAW_DATA_DIR = DATA_ROOT/"le2i"/"raw"`, `POSE_CACHE_DIR = DATA_ROOT/"le2i"/"poses"`, `EVAL_DIR` 유지, 신규 `GOLD_CLIPS_DIR = DATA_ROOT/"nursing-home"/"processed"`.
2. `training/extract_poses.py`: 클립 글롭 `*.avi` → `*.avi` + `*.mp4` (discover_clips + docstring). 근거: Le2i 자체는 avi-only지만 nursing-home 등 신규 도메인 인제스트가 mp4 — 도메인 일반화 대비(스펙 AC "avi 외 mp4 지원"의 extract 측).
3. `training/evaluate.py`: `--gold-clips-dir` default를 `config.GOLD_CLIPS_DIR`로 (현행 None → 자동 실행되, 디렉터리 부재 시 기존 skip 로직 그대로).
4. `demo/video_registry.py`: 도메인 인식 리스팅 —
   `RegisteredVideo`에 `domain` 추가, `list_registered_videos`가 `data_root/{domain}/{raw,processed}` 스캔(도메인 디렉터리 자동 발견, `eval`/`uploads` 제외) + `uploads/`,
   `display_name = "{domain} / {role} / {filename}"`, `VideoSource`는 도메인 내 role + `UPLOAD`로 재정의.
   **video_id 계약**: `f"{domain}/{role}/{path.name}"` (예: `"nursing-home/processed/fall.mp4"`) —
   현행 `f"{source}:{name}"`은 도메인 간 동명 파일에서 충돌(`nursing-home/processed/fall.mp4` vs `le2i/processed/fall.mp4`); domain+role+filename은 단일 data_root 안에서 유일.
5. `demo/app.py`: `FALL_DEMO_MODE` 읽기 — **기본 `public`(fail-safe)**, 로컬 운영자는 `FALL_DEMO_MODE=operator` 명시. **세션 필터 계약**: `st.session_state["session_upload_ids"]: set[str]`에 `persist_uploaded_video` 반환 `RegisteredVideo.video_id`를 추가; public 모드에서는 registry를 변경하지 않고 **app.py 레이어에서** 목록을 `session_upload_ids`로 필터(내부 소스 드롭다운 섹션 자체 숨김, uploads/ 디렉터리 전체 리스팅 결과도 세션 집합 밖이면 비노출). 업로드 위젯은 양 모드 공통(mp4/avi — `SUPPORTED_VIDEO_EXTENSIONS` 이미 충족). 로컬 마찰 제거: 데모 실행 커맨드(README/rules의 표준 커맨드)에 `FALL_DEMO_MODE=operator` 고정.
6. 테스트: `tests/test_demo_video_registry.py` — 기존 4개 테스트 모두 flat 구조 전제라 도메인 구조로 전면 교체 + **세션 필터 계약 테스트**(session_upload_ids 밖의 uploads 파일은 public 목록에 비노출), `tests/test_training_windowing.py` 경로 참조 갱신, extract_poses mp4 글롭 테스트.

### Step 2 — 물리 이동 + 공유 링크 (실행 승인 후, 코드 머지 직전 단계에서)
1. Streamlit 데모 중지(bhcop6xsz). **사전 확인: `git worktree list`로 feat/40-2b 워크트리 존재 확인** (le2i 데이터 원본 보유 체크아웃 — 부재 시 중단). main 체크아웃에서: `mkdir` 도메인 골격 → `mv raw processed annotated → nursing-home/`, 워크트리의 le2i 데이터는 **`cp -a`로 복사**(사용자 지시 2026-06-10: "데이터는 소중하니까" — main이 사본을 보유, 워크트리 원본은 정리 시점까지 보존): `le2i_raw → main:le2i/raw`(Annotation_files 하위 폴더 포함 — Le2i 라벨 파일이 시나리오 폴더 안에 동거), `le2i_poses → main:le2i/poses`, `eval/*.csv → main:eval/`. 복사 후 **무결성 확인**(파일 수·총 바이트 일치) — 확인 전 워크트리 정리 금지.
2. 워크트리(들) `ml/data` 제거 후 symlink → main `ml/data`. `scripts/git-guard/wt`에 symlink 생성 1줄 추가(신규 워크트리 자동화).
3. gitignore 경계 확인: `git status --porcelain`에 data 파일 0건 (main + 워크트리 양쪽).

### Step 3 — 검증 & 마감
1. `cd ml && uv run ruff check . && uv run --group training --group test pytest -q` 그린.
2. 재학습 불필요(아티팩트는 `ml/artifacts/` — 이동 대상 아님). `evaluate`를 새 경로로 1회 실행해 gold-8 자동 경로 확인.
3. Streamlit 재기동 → AC 수동 확인: 도메인 드롭다운(nursing-home/le2i), mp4 재생, 업로드, `FALL_DEMO_MODE=public`로 재기동 시 내부 소스 비노출.
4. PR → 머지 → plan frontmatter `status: done` → 폴더 archive 이동.

## Acceptance Criteria 매핑
| Spec AC | Step |
|---|---|
| 레이아웃 ADR (004/007 supersede) | 0-2 |
| 학습 파이프라인 ADR | 0-3 |
| rules: 레이아웃 표 | 0-4 |
| rules: ml-training.md | 0-5 |
| ml/data 물리 이동 | 2 |
| 코드 경로 + ruff/pytest 그린 | 1, 3-1 |
| 드롭다운 즉시 추론 | 1-4/5, 3-3 |
| avi+mp4 + 업로드 유지 | 1-2/4/5, 3-3 |
| 배포 모드 비노출 | 1-5, 3-3 |
| gitignore 경계 | 2-3 |

## Risks
- **R1 데이터 이동 ↔ 코드 순서**: 이동은 코드 준비 후 한 번에(Step 2가 Step 1 뒤). 구경로 fallback은 만들지 않음(이중 경로가 또 다른 표류 원인) — 대신 이동 체크리스트로 원자성 확보.
- **R2 feat/40-2b 충돌**: evaluate.py/config.py 공유 — 선행 머지 강제(Sequencing).
- **R3 한글/공백 파일명**(gold-8 클립): pathlib 기반이라 안전하나 Step 2 후 `evaluate` 1회 실행으로 실증.
- **R4 symlink와 git**: `ml/data`는 gitignore라 symlink 자체도 추적 안 됨 — 안전. 단 `wt` 스크립트 수정은 코드리뷰 대상. **dangling symlink 비대칭 실패**: main 체크아웃 `ml/data/` 미존재 시 데모는 조용히 빈 목록(`directory.exists()` 가드), 학습 스크립트는 FileNotFoundError로 하드 크래시 — `wt`에 "main `ml/data/` 부재 시 경고" 사전 체크 1줄 추가.
- **R5 public 모드의 세션 격리 한계**: st.session_state는 브라우저 세션 단위 — 동일 서버의 업로드 파일이 디스크에는 공존. 파일 시스템 격리/만료는 배포 사이클 follow-up으로 명시(이번엔 리스팅 차단까지).

## ADR Section (계획이 내포한 결정 — distill 대상)
- **Decision 1**: `ml/data/` 도메인 우선 2계층 + 강제 role 어휘 + uploads-only 외부 입력면 → **ADR-011** (Step 0-2에서 작성; Drivers/대안 위 O-표 참조).
- **Decision 2**: Le2i·라벨링·recall-first 임계값·gold-8 평가법 → **ADR-012** (Step 0-3).
- **plan-내부로 남는 결정**(ADR 불요): symlink 공유 방식(O1 — 로컬 운영 세부, env var 전환 시 재논의), FALL_DEMO_MODE env 이름/기본값(rules 문서 수준), video_registry 스캔 구현.
- **Follow-ups**: 배포 사이클에서 ① `FALL_DATA_ROOT` env 승격 검토 ② uploads 파일 만료/격리 ③ 레이아웃 훅 검증(이번 Non-Goal).

## Consensus Log (Planner → Architect → Critic)
- **Iteration 1 — Architect: REVISE** (MAJOR 2, MINOR 3) → 반영: ① `FALL_DEMO_MODE` 기본값을 `public`으로 반전(fail-safe — 개인정보 경계가 배포자 기억에 의존 금지), ② `video_id` 계약 `{domain}/{role}/{name}` 명시(도메인 간 동명 파일 충돌 제거), ③ ADR-012의 Le2i 절을 ADR-009 전략 결정의 구현 세부로 한정, ④ ADR-011 Access Boundary 별도 섹션(추후 독립 ADR 추출 가능 주석), ⑤ dangling symlink 비대칭 실패 R4 추가.
- **Iteration 2 — Critic: REVISE** (BLOCKER 1, MAJOR 2, MINOR 3) → 반영: ① **feat/40-2b 워크트리 삭제 금지 경고**(le2i 데이터는 gitignore라 워크트리에만 물리 존재 — Step 2 완료 전 제거 시 영구 손실) + Step 2 사전 체크, ② ADR-007 row 6(`annotated/`) 대체 명시, ③ 세션 필터 계약(`session_upload_ids` set, app.py 레이어 필터링) + 계약 테스트, ④ rules Invariants 산문 재작성 의무, ⑤ mp4 글롭 근거, ⑥ "raw is sacred" 계승 명시.
- **Iteration 2 재검토 — Critic: APPROVE** (잔여 지적 없음). Architect 지적 사항 전건 반영을 Critic이 재확인.

## Verification
`cd ml && uv run ruff check . && uv run python -c "import training.train, training.evaluate, demo.temporal_module, demo.classifiers, demo.video_registry" && uv run --group training --group test pytest -q` + Streamlit 수동 AC 3종(드롭다운/업로드/public 모드).
