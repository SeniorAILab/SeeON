---
slug: streamlit-demo-director-showcase
title: Streamlit 데모 전문 디자인 정돈 + 원장 시연 녹화본
status: pending approval
author: gobeumsu
created: 2026-06-13
mode: direct (interview-scoped)
---

# Streamlit 데모 전문화 + 원장 시연 녹화본

## Requirements Summary

병원 원장님들(= 베타테스터)에게 보여줄 시연 영상을 만든다. 두 결과물:

1. **전문 디자인으로 정돈된 Streamlit 데모** — 한국어 통일, 양주 행복한요양원 사이트
   톤(차분한 의료 블루)의 테마, repo 이름 브랜딩, **대시보드형 아님**. 모든 컨트롤/버튼이
   실제로 동작함을 앱 구동 후 클릭으로 검증.
2. **지정 요양원 클립의 mp4 화면녹화본** — 각 클립이 재생되며 **실제 낙상 구간에서 빨간
   "🔴 낙상" 표시가 확실히 점등**되는 장면을, 외부 화면녹화로 `~/Downloads`에 mp4 저장.
   필요 시 분류기/판정 임계값을 조정해 점등을 보장(단, 실제 추론만 — ADR-005 §5).

대상 클립 (operator 모드 — nursing-home 내부 영상, ADR-012). 낙상 구간은
`ml/data/eval/nursing-home-gold.csv` 골드 라벨 기준 — 녹화 트리밍에 그대로 사용:

확정 (사용자 지정):
- `2021-10-27 베스트요양원1 505호.mp4` — 급격한 후방 붕괴 (frame 3205–3240 @24fps)
- `2026-05-29 4층휴게실 미상.mp4` — 보행기, 무릎 꺾여 바닥 주저앉음 ~0.93s (frame 128–152 @25.9fps)

추천 (확정 대기 — 검출기 부정 메모 없는 극적·치명 낙상만 선별):
- `2026-04-19 베스트요양원2 405호.mp4` — 변기의자 옆 ~0.72s 급격히 엎어짐(prone),
  간병인 출동 (frame 786–813 @37.59fps)
- `2026-02-25 베스트요양원1 502호.mp4` — 침대 모서리서 굴러떨어져 못 일어남, 팔 들어
  도움 요청; 2026-06-11 사람 재검수 확정 (frame 170–250 @41.34fps)
- 대안: `2026-03-13 베스트요양원1 3층휴게실.mp4` (뒤로 ~0.39s 급붕괴, frame 644–658) /
  `2026-03-13 베스트요양원2 506호.mp4` (급붕괴 후 못 일어남, frame 1082–1102)
- 제외(검출기 실패 메모): 2025-12-17 301호, 2026-02-23 베2 203호, 2026-05-24 502호, 2026-05-15 206호

### 결정 사항 (인터뷰 확정)
- 디자인 깊이: **테마 + 레이아웃 정돈** (풀 리디자인 아님, 대시보드 아님)
- 브랜드명: **repo 이름 그대로** (`eldercare-fall-ai`)
- 색 톤: 양주 행복한요양원 — accent `#4A90E2`, bg `#FFFFFF`, secondary bg `#F5F5F5`,
  text `#333333`, tint `#E8F4F8`
- 언어: **한국어 통일**
- 검증: **실제 앱 구동 + 클릭 검증** (qa-tester + 브라우저 자동화)
- 녹화: **외부 화면녹화 → mp4 → ~/Downloads** (앱은 mp4를 쓰지 않음 — streamlit-demo §2)
- 튜닝: 지정 클립에서 빨간 낙상이 안 뜨면 **분류기/임계값 조정 포함**

## Constraints (반드시 준수)
- `docs/rules/streamlit-demo.md` §1 — 정당한 operator 컨트롤은 **제거 금지**, 모델-심 내부
  중복 노브 **추가 금지**.
- §2 — 라이브 루프에서 **mp4 파일 작성/`st.video()` 금지**. (녹화는 외부 화면녹화로만.)
- §3 — bounding box / pose skeleton 독립 토글 4조합 모두 정상 렌더 유지.
- ADR-005 §5 — 실제 추론하지 않은 keypoint/box/label/낙상상태 **조작 금지**. 튜닝은
  분류기·임계값 선택(정당한 operator 컨트롤)으로만.
- ADR-012 — nursing-home 영상은 **operator 모드에서만**. public 기본값 절대 변경 금지.
- 한 줄 import 계약(app.py sys.path 부트스트랩) 유지, try/except 이중 import 금지.
- 작업은 `git wt <issue#>` 워크트리에서 (worktree-workflow). main 직접 작업 금지.

## Acceptance Criteria (testable)

### A. 디자인/언어
- [ ] `ml/.streamlit/config.toml`에 `[theme]` 블록 추가: `primaryColor="#4A90E2"`,
  `backgroundColor="#FFFFFF"`, `secondaryBackgroundColor="#F5F5F5"`, `textColor="#333333"`,
  `font="sans serif"`. 기존 `[server] maxUploadSize=10240` 라인은 보존.
- [ ] `app.py:58` 제목이 `eldercare-fall-ai`로 변경(repo 브랜딩). 캡션은 데모 면책 문구 유지.
- [ ] 라이브 뷰 한국어 라벨 통일: `app.py:71` `"Video"`→`"영상"`;
  `demo_ui.py:55` `"YOLO26-pose size"`→`"YOLO26-pose 크기"`;
  `demo_ui.py:60` `"Bounding boxes"`→`"바운딩 박스"`;
  `demo_ui.py:61` `"Pose skeleton"`→`"포즈 스켈레톤"`;
  `app_assets.py:11` `"Upload additional video"`→`"영상 추가 업로드"` + 성공 메시지 한국어화.
- [ ] 잔여 영문 라벨 0건 (grep `selectbox\|checkbox\|button\|text_input\|file_uploader`로 확인).
- [ ] 레이아웃 정돈: 보조 컨트롤(분류 모델/임계값/탐지 파라미터/YOLO 크기/토글)을 시각적으로
  그룹화(섹션 캡션 또는 sidebar). **메트릭 카드/히어로 배너 등 대시보드 요소는 추가하지 않음.**
- [ ] 두 페이지(`app.py`, `pages/live_camera.py`) 모두 동일 테마/언어 적용·정상 렌더.

### B. 버튼/컨트롤 동작 검증 (실구동)
검증 대상 (각각 클릭 → 기대 동작 확인, 스크린샷 첨부):
- [ ] 영상 추가 업로드 → 업로드 시 등록 성공 메시지
- [ ] 영상 selectbox → 선택 시 경로 캡션 갱신
- [ ] 도메인/종류 segmented control (operator) → 목록 갱신
- [ ] 분류 모델 selectbox → 준비중 모델 안내 / 사용가능 모델 선택
- [ ] 판정 임계값 slider (temporal 모델 선택 시 노출) → 값 변경 반영
- [ ] 탐지 파라미터 expander 4개 입력(conf/window/stride/지속시간) → 값 반영
- [ ] YOLO26-pose 크기 selectbox → 선택 반영
- [ ] 바운딩 박스 / 포즈 스켈레톤 체크박스 → 4조합 모두 렌더(둘 다 끄면 클린 프레임)
- [ ] 재생 → 추론 시작·프레임 렌더; 정지 → 다음 rerun에서 멈춤
- [ ] live_camera: 다시 검색 / 카메라 selectbox / 시작·중지
- [ ] 회귀 리포트(컨트롤 × 동작 × 결과 표 + 스크린샷)를 `.omc/plans/` 또는 산출물 폴더에 기록

### C. 클립별 낙상 점등 + 녹화본
- [ ] 각 지정 클립에서 낙상 구간에 `🔴` 상태 + `🚨 낙상 감지` 래치 배지가 점등하는
  (분류기, 임계값) 운영점을 **문서화** (클립별 1줄).
- [ ] 점등 보장 불가한 클립이 있으면 **조작 없이** 사실대로 보고(ADR-005 §5) + 사용자 에스컬레이션.
- [ ] 각 클립 재생 화면을 외부 화면녹화로 mp4 저장: `~/Downloads/<클립식별>_fall.mp4`.
  녹화에 빨간 낙상 점등 순간이 포함됨.
- [ ] 녹화본 mp4가 재생 가능(코덱 정상)하고 빨간 표시가 육안으로 식별됨.

## Implementation Steps

### Phase 0 — 준비 (워크트리)
1. `git wt <issue#>` 로 `feat/<issue#>-streamlit-demo-director-showcase` 워크트리 생성.
2. 이 plan을 `docs/exec-plan/active/streamlit-demo-director-showcase/plan.md`로 이동(승인 후),
   첫 커밋으로 finalize.

### Phase 1 — 디자인/언어 (workstream A)
3. `ml/.streamlit/config.toml`에 `[theme]` 블록 추가(위 팔레트). `[server]` 보존.
4. `app.py` 제목→repo명, `"Video"`→`"영상"`. 보조 컨트롤 그룹화(섹션 캡션 또는
   `st.sidebar`; 대시보드 요소 없음). 라이브 루프 패턴(`st.empty().image`)·페이싱 불변.
5. `demo_ui.py` 라벨 한국어화(YOLO 크기/바운딩 박스/포즈 스켈레톤). help 문구 유지.
6. `app_assets.py` 업로드 라벨/메시지 한국어화.
7. `pages/live_camera.py` 동일 테마/언어 일관성 확인(이미 대부분 한국어).
8. 선택: 가벼운 브랜드 헤더 CSS(`st.markdown(unsafe_allow_html=True)`) — 최소한으로,
   §1 컨트롤 규칙·§2 mp4 금지와 무관.

### Phase 2 — 클립 낙상 점등 튜닝 (workstream C 전반, A 의존)
9. `FALL_DEMO_MODE=operator`로 구동, nursing-home/processed에서 각 지정 클립 선택.
10. 분류기(`분류 모델`)와 `판정 임계값`을 조정해 낙상 구간 `🔴`+`🚨` 점등 운영점 탐색.
    temporal 모델 우선, 임계값 하향 시도. 운영점을 클립별로 기록.
11. 점등 실패 클립은 사실대로 기록·에스컬레이션(조작 금지).
12. (선택) `fall-video-crop-rename` 스킬로 낙상 순간 위주로 클립 트리밍해 녹화 길이 단축.

### Phase 3 — 버튼 검증 (workstream B, A 이후)
13. qa-tester가 operator 모드로 streamlit 구동(tmux), 브라우저 자동화(`/gstack-browse`;
    `mcp__claude-in-chrome__*` 금지)로 B 체크리스트 위젯을 하나씩 클릭·스크린샷.
14. 회귀 리포트 작성(컨트롤×동작×결과 표).

### Phase 4 — 녹화본 생산 (workstream C 후반)
15. 각 클립을 튜닝된 운영점으로 재생하면서 외부 화면녹화(예: macOS
    `ffmpeg -f avfoundation` 또는 QuickTime/`screencapture -v`)로 mp4 캡처.
16. `~/Downloads/<클립식별>_fall.mp4`로 저장, 빨간 점등 순간 포함 확인.

### Phase 5 — 마무리
17. 두 페이지 스모크 + 회귀 리포트 첨부. plan frontmatter `status: done` 후 archive 이동.
18. 디자인 톤/언어 통일은 구현 디테일 → ADR 불필요(반복 변경 가능, 교차 영향 없음).

## Risks & Mitigations
- **R1: 모델이 특정 클립에서 낙상을 못 잡음.** → temporal 모델+임계값 하향 탐색;
  그래도 안 되면 조작 없이 보고·에스컬레이션(ADR-005 §5). 대체 클립 제안.
- **R2: Streamlit 위젯 브라우저 클릭 자동화 불안정.** → `/gstack-browse` + 스크린샷,
  실패 시 수동 체크리스트로 폴백. (claude-in-chrome 금지 — AGENTS.md.)
- **R3: nursing-home 실영상 프라이버시.** → operator 모드 로컬 전용; 녹화본은 데이터
  주체(요양원/원장)에게만. ml-dataset-custody 규칙 준수, 공개 배포 금지.
- **R4: config.toml 테마 키 오타로 테마 미적용.** → 구동 후 색상 육안 확인, 유효 키만 사용.
- **R5: 레이아웃 변경이 공유 컨트롤(render_live_controls) 통해 live_camera 깨뜨림.** →
  두 페이지 모두 렌더 검증.
- **R6: "대시보드 없이" 위반.** → 메트릭 카드/히어로 배너 추가 금지, 단일 영상중심 레이아웃 유지.

## Verification Steps
- 디자인: 두 페이지 구동 → 팔레트 육안 확인, 영문 라벨 grep 0건.
- 버튼: B 체크리스트 전 항목 클릭·스크린샷, 회귀 리포트.
- 녹화: `~/Downloads/*_fall.mp4` 재생 → 빨간 낙상 점등 육안 식별.
- 코드: `cd ml && uv run pytest`(데모 관련) 통과, import 계약 불변 확인.

## Open Questions — 해소됨 (2026-06-13 사용자 승인)
1. ✅ 추천 클립 확정: **405호(변기의자 급엎어짐) + 502호(침대서 굴러떨어져 못 일어남)** 로 진행.
   최종 4개 = 505호 / 4층휴게실 / 405호 / 502호.
2. ✅ 녹화 트리밍: 골드 프레임 기준 **낙상 ±3초**.
3. 녹화 해상도/프레임 영역 — 실행 중 결정(기본: 라이브 프레임 영역 중심 캡처).

**실행 승인:** team 위임 (`team원들 불러 호출`).

## Notes
- 본 plan은 `pending approval`. 승인 시 실행은 `/team` 또는 `/ralph`로 위임(직접 구현 아님).
- 승인 시 plan을 `docs/exec-plan/active/streamlit-demo-director-showcase/`로 이동·finalize.
