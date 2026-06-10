---
slug: fall-autoresearch-loop
title: "Fall-Detector Autoresearch Loop on m1-pro — Execution Plan"
type: plan
date: 2026-06-10
owner: gobeumsu
issue: 74
created-from-spec: fall-autoresearch-loop/spec.md
status: active
---
<!-- NOTE: plan body is immutable after finalize.
     Finalize = the first git commit that includes this plan.md in docs/exec-plan/active/.
     Scope change -> create a new slug, then set the old plan's frontmatter:
       status: superseded-by
       superseded-by: {new-slug}
     Critic-APPROVED rev3 (consensus complete). -->

# Plan: Fall-Detector Autoresearch Loop on m1-pro

- slug: fall-autoresearch-loop
- spec: spec.md (ambiguity 6.7%)
- status: active (finalized on first commit)
- date: 2026-06-10

## Requirements Summary

LE2I fall-detector 모델군을 m1-pro에서 무인으로 도는 autoresearch 루프(제안→실행→평가→기록)로 지속 개선한다.
- 모델: RF(기존)·SVM(신규)·LSTM·Transformer(기존)·경량 ST-GCN scratch(신규) — 계열별 파일 1:1
- Evaluator: window-level `precision @ fall-recall ≥ 0.90` on LE2I held-out split (단일 채택 지표)
- 2차 차단 게이트: nursing home gold에서 기존 채택 모델이 잡던 낙상 누락 시 채택 거부 (zero-tolerance)
- Gold 라벨링: Claude가 fall start/end 프레임 제안(두 프레임 캡처 공유) → 사용자 확정. 기존 gold8은 폐기
- 인프라: ssh `m1-pro`(-o RemoteCommand=none) → tmux `eldercare-fall` → `~/Documents/01_Project/eldercare-fall-ai`(로컬과 동일 경로) → `git wt` worktree → Claude Code 실행(사전 `claude update`). 접근 규약은 프로젝트 skill로 고정
- 1회 무인 런 예산: 8시간 또는 실험 20개 중 선도달

## RALPLAN-DR Summary

### Principles
1. **단일 숫자가 결정한다** — 모든 채택/기각은 evaluator + NH 게이트의 자동 판정. 사람은 저널만 리뷰.
2. **결정(LLM)과 실행(결정적 하네스)의 분리** — Claude는 실험을 제안·해석하고, 학습/평가는 seed 고정 결정적 CLI가 수행.
3. **개념이 다르면 파일이 다르다** — 모델 계열별 `models/{family}.py`, 실험별 `ml/experiments/runs/{id}.md`.
4. **평가 데이터는 신성하다** — LE2I held-out과 NH gold는 어떤 실험도 학습에 사용 금지. gold 라벨은 사람 확정본만 유효.
5. **기존 규약 준수** — seed 42·window 30·metadata.json(ADR-013, docs/rules/ml-training.md), worktree-workflow, skill 미러 규칙(AGENTS.md).

### Decision Drivers
1. 무인 8h 런이 사람 개입 없이 완주하고 결과가 신뢰 가능해야 함 (재현성·게이트 자동화)
2. 13클립 NH gold는 통계적으로 약함 → LE2I 1차 + NH 회귀 차단의 2단 구조가 필수
3. 기존 파이프라인(train.py/evaluate.py/FallClassifier Protocol)을 깨지 않고 모델·하네스를 증분 추가

### Viable Options — 루프 드라이버 설계
- **A. Claude Code 주도 + 결정적 하네스**
  - Claude(m1-pro tmux)가 저널을 읽고 다음 실험 config 제안 → `harness.py`가 학습·평가·게이트 판정 → Claude가 결과를 md로 해석·기록
  - 장점: karpathy/autoresearch 본질(가설 기반 탐색) 구현, 정성적 통찰 반영, 실패 시 자가 복구
  - 단점: 8h 무감독 LLM의 해석 오류 위험, 토큰 비용, 무인 권한 설정 필요. HP 그리드 탐색에서는 LLM이 부가가치 없음 (Architect 반론)
- **B. 순수 Python 스윕 (grid/random/optuna)**
  - 장점: 저비용, 결정적·감사 가능, Bayesian 효율
  - 단점: 가설·저널 기반 탐색 불가 — 아키텍처 변형 제안 불가능
- **A+B 합성 (채택, Architect synthesis)**
  - Claude는 **아키텍처/피처 수준 가설**만 제안(예: "ST-GCN에 temporal attention 추가", "RF에 isotonic calibration") → 각 가설의 **계열 내 하이퍼파라미터 탐색은 harness 내 Optuna**(`n_trials≈5`)가 수행
  - 가설 탐색의 가치는 보존하고, LLM이 부가가치 없는 파라미터 결정에서는 배제 — 해석 오류 표면적 최소화
- **C. 로컬 Workflow 오케스트레이션 (원격은 ssh 실행만)**
  - 장점: 로컬 세션에서 통제
  - 단점: 8h 장기 런에 로컬 머신 상시 구속, ssh 단절에 취약. 기각

## Implementation Steps

### Phase 0 — 거버넌스 (worktree 첫 커밋)
1. `git wt <issue#>`로 `feat/<issue#>-fall-autoresearch-loop` worktree 생성 (main 직접 작업 금지 — assert-not-main 훅 활성)
2. spec을 `.omc/specs/` → `docs/exec-plan/active/fall-autoresearch-loop/spec.md`로 이동(이동 시 gold-review 파일명을 plan과 일치시킴 — `start-f{N}-strip.jpg`/`end-f{N}-strip.jpg`, rev2에서 contact strip으로 변경됨), 본 plan을 `plan.md`로 커밋 (커밋 시 finalize — AGENTS.md)

### Phase 1 — m1-pro-lab skill (component: remote-infra)
3. `.claude/skills/m1-pro-lab/SKILL.md` 작성, `.agents/skills/`에 미러 (`.codex`는 symlink — AGENTS.md 미러 규칙). 내용:
   - 접근: `ssh -o RemoteCommand=none m1-pro` (ssh config의 RemoteCommand 실측 확인됨)
   - 세션: `tmux new -As eldercare-fall` — 기존 `main` 세션 사용 금지
   - 경로: `~/Documents/01_Project/eldercare-fall-ai` (로컬과 동일)
   - 절차: `git pull` → `git wt`로 worktree → **asset symlink**(`ml/data`, `ml/models`, `ml/artifacts`를 메인 클론에서 worktree로 ln -s — git-ignored라 worktree에 없음. `ml/artifacts`는 첫 학습 전엔 부재 — 메인 클론에 `mkdir -p ml/artifacts` 후 symlink하면 artifacts가 worktree 전환에도 살아남음) → `ls -la ml/data`로 링크 해석 검증(dangling symlink 방지) → `claude update` → tmux 안에서 Claude Code 기동
   - asset rsync 레시피 — 실존 디렉토리 전부 명시("등" 금지, 누락 시 스모크가 공허 통과). 실측: 가중치·아티팩트는 `ml/weights`가 아닌 **`ml/models`**(pose YOLO + fall 모델, 204M)에 있음:
     ```sh
     rsync -a --ignore-existing -e 'ssh -o RemoteCommand=none' ml/data/   m1-pro:~/Documents/01_Project/eldercare-fall-ai/ml/data/
     rsync -a --ignore-existing -e 'ssh -o RemoteCommand=none' ml/models/ m1-pro:~/Documents/01_Project/eldercare-fall-ai/ml/models/
     ```
     (로컬→원격 단방향, `--delete` 금지 — raw 보호. `-e 'ssh -o RemoteCommand=none'` 필수 — ssh config의 RemoteCommand가 rsync 채널을 깨뜨림)
### Phase 2 — 원격 부트스트랩
4. m1-pro에 repo 클론(동일 경로) → **클론 직후 1회 `sh scripts/git-guard/setup-hooks.sh`**(`git wt` alias 등록 + `.githooks` 활성 — 이 단계 없이는 worktree 워크플로우 전체가 불가) → asset rsync(Step 3 레시피) → `cd ml && uv sync` → tmux 세션 생성
5. 스모크 테스트: `uv run python -m training.train --smoke-n 4` 완주(데이터 파이프라인 end-to-end 검증 — `training.evaluate` 단독은 artifacts 부재 시 빈 테이블로 exit 0 하는 공허 통과라 스모크로 부적합) + `uv run pytest tests/` 통과 (arm64 torch 동작 검증)

### Phase 3 — NH gold 재라벨링 (component: evaluation)
6. `ml/training/data/nursing_home.py`: processed 영상 열거 + `nursing-home-gold.csv` 파서 (le2i.py:94 `parse_fall_interval` 패턴 준용)
7. NH 추론 경로 확정: `evaluate_nh.py`는 **배포 스택과 동일한 multi-person 경로**(PR #62) 사용 — 단, `TemporalFallClassifierModule` 통째 재사용 금지(live `demo.seam.Frame` 기반 stateful 예측기라 npz 배치 캐시와 구조적으로 비호환). 구성요소를 직접 조립: YOLO per-frame → `demo.tracking.GreedyIouTracker`로 추적 → `training.extract_poses.normalize_person_keypoints`로 정규화(학습 파이프라인과 anti-skew 보장) → per-track 시퀀스를 `ml/data/nursing-home/poses/` npz 캐시(1회 추출, 전 실험 재사용) → 배치 추론. LE2I용 단일인물 경로 재사용 금지(다인 NH 영상에서 포즈 품질 저하 → 게이트 신뢰도 붕괴). 인터페이스 계약: `evaluate_nh(model_key: str, artifact_base: Path) -> {"missed_fall_ids": [...], "gate_passed": bool}` — `fall_id` 체계는 Step 13b와 동일(`video` stem)
8. 라벨 제안 세션(agent 작업): 영상별 Claude가 fall start/end 프레임 판정 → ffmpeg로 각 경계 주변 ±2프레임을 가로로 이어붙인 **contact strip 2장**(`ml/data/eval/gold-review/{slug}/start-f{N}-strip.jpg`, `end-f{N}-strip.jpg`) 캡처 — 정적 1프레임은 "앉음 vs 넘어짐"이 구분 불가(Gemini 지적), 사용자에게 공유되는 이미지는 여전히 영상당 2장 → CSV에 `status=proposed` 기록. `nursing_home.py` 파서에 라벨 정합성 검증 내장(`start_frame < end_frame`, 최소 낙상 길이 ≥ 5프레임, 프레임 범위 ≤ 영상 길이)
9. 사용자 확정 라운드: 캡처 이미지 검토 → `status=confirmed`(수정 포함). `.gitignore`는 **완결된 체인으로 교체** (Critic CRITICAL — 단순 `!ml/data/` 재포함은 디렉토리 전체를 un-ignore해 CCTV 유래 gold-review 이미지가 커밋 가능 상태가 됨):
   ```gitignore
   # replace line 71 `ml/data` with:
   ml/data/**
   !ml/data/eval/
   ml/data/eval/**
   !ml/data/eval/nursing-home-gold.csv
   ml/data/eval/gold-review/
   ```
   (`ml/data/` 디렉토리 자체를 ignore하면 git이 하위로 내려가지 않아 어떤 negation도 무효 — 반드시 `/**` 콘텐츠 패턴 사용.) 검증: `git check-ignore -v ml/data/eval/gold-review/x/start-f1-strip.jpg`가 **ignored**를 반환하고, `git status`에 CSV만 추적 후보로 떠야 함. 기존 `gold8-poc-results.csv`는 사용 중단 명시
### Phase 4 — 모델 파일 추가 (components: classical/deep-track)
10. 레지스트리+디스패치 통합 리팩토링: 등록 지점은 실제로 **5곳** — `_ALL_MODEL_KEYS`(train.py:52, evaluate.py:70) + train.py:218-289 `if key=="rf"` 학습 분기 + evaluate.py:142-156 `_load_model` 분기 + **evaluate.py:232·:402의 artifact 파일명 분기**(`"model.pkl" if key == "rf" else "model.pt"` — 미이관 시 sklearn 신규 모델 SVM이 model.pt를 찾다 조용히 평가 누락). `models/__init__.py`에 `REGISTRY = {key: {"factory": cls, "mode": "features"|"sequence", "artifact_filename": "model.pkl"|"model.pt"}}`를 두고 **5곳 전부 REGISTRY 구동으로 전환** → 신규 모델 등록 1곳. 이관 규칙: (a) evaluate.py:241의 `meta.framework=="sklearn"` 분기는 `REGISTRY[key]["mode"]=="features"`로 대체 — 이후 `meta.framework`는 dispatch에 비관여; (b) train.py:256-272의 smoke-mode `train_torch_module` monkey-patch는 `mode=="sequence"`인 모든 REGISTRY 항목에 동일 적용(누락 시 신규 GCN 스모크가 50 epoch 풀 학습). 리팩토링 직후 `uv run pytest ml/tests/`로 기존 3계열 회귀 검증 통과 후에만 신규 모델 추가
11. `ml/training/models/svm.py`: sklearn SVC(probability) — rf.py와 동일하게 feature 45차원 파이프라인 재사용(`mode: "features"`), `FallClassifier` Protocol(base.py:23) 구현
12. `ml/training/models/gcn.py`: 경량 ST-GCN scratch — COCO-17 인접행렬, `mode: "sequence"`. **(N,T,51)→(N,3,T,17) 변환은 gcn.py의 nn.Module forward 내부에서 수행** — Protocol 계약([N,T,51] 입력, base.py:79)을 외부에서 깨지 않음. `TorchFallClassifier`(base.py:66) 재사용 — **제약: `load()`가 `cls()`를 호출(base.py:101)하므로 `GcnFallClassifier.__init__()`는 무인자 생성 가능해야 함**(기본 아키텍처 하드코딩, HP 변형은 인스턴스 속성으로). 사전학습 가중치 사용 금지(누수·라이선스)
13. `ml/tests/test_training_models.py`에 svm/gcn 케이스 추가 — fit/predict_proba/save/load 왕복
### Phase 4.5 — NH 기준 마스크 동결 (Critic CRITICAL: 5계열 baseline 완성 *후*에만 동결 가능)
13b. **5계열 전체** baseline(기존 3 + 신규 svm/gcn) 학습 완료 직후, NH gold에 1회 평가해 `ml/experiments/nh_reference_mask.json` 기록. 스키마: `{model_family: [fall_id...]}`, **`fall_id` = gold CSV의 `video` 필드 값**(stem, 클립당 낙상 1건 전제 — 생산자 13b와 소비자 harness가 동일 ID 체계 사용해야 게이트가 동작). **루프 전체 기간 동결** — 게이트 기준이 champion 교체로 표류하는 것을 차단. 재동결은 사람이 명시 승인한 re-baseline 시점에만 허용(별도 커밋으로 기록). `evaluate_nh.py`는 이 정적 파일만 기준으로 사용. Phase 3 시점(gold 확정 직후)에 동결하면 svm/gcn 항목이 없어 두 계열의 첫 실험이 무게이트로 통과 — 반드시 Step 13 이후 실행
### Phase 5 — 실험 하네스 + 저널 (component: autoresearch-loop)
14. `ml/experiments/harness.py`: 단일 가설 실행 CLI — 입력: 가설 config(JSON: `model_family`, 아키텍처/피처 변형 플래그, 선택적 HP override), 내부에서 **Optuna `n_trials≈5`로 계열 내 HP 탐색** → best trial을 train→evaluate→**NH 게이트**(`evaluate_nh.py`, Step 7 계약) 순차 수행. 출력: `runs/{id}.json`.
   - **HP search space는 harness.py에 계열별 하드코딩이 기본**(Claude 가설 JSON은 부분 override만 가능 — Claude가 Optuna 파라미터 스펙을 생성해야 하는 의존성 제거). 기본 공간:
     | family | search space (Optuna suggest) |
     |---|---|
     | rf | n_estimators 100-500, max_depth 5-30, min_samples_leaf 1-10 |
     | svm | C 0.1-100 (log), gamma 1e-4-1e-1 (log), kernel {rbf, linear} |
     | lstm | hidden 32-256, layers 1-3, lr 1e-4-1e-2 (log), dropout 0-0.5 |
     | transformer | d_model {32,64,128}, heads {2,4}, layers 1-3, lr 1e-4-1e-2 (log) |
     | gcn | hidden 16-128, blocks 1-3, lr 1e-4-1e-2 (log), dropout 0-0.5 |
   - per-trial `timeout`: `subprocess.run(..., timeout=...)`로 trial을 자식 프로세스 격리(행 걸린 trial이 run 전체를 죽이지 않음 — 크래시 복구 단위 = run)
   - SVM 비용 주의: `probability=True`는 내부 5-fold Platt — trial당 5회 fit. LE2I ~6k 윈도우에선 수용 가능하나 run JSON에 `train_seconds` 기록해 예산 추적
14b. **Evaluator 계약 경화**: recall ≥ 0.90 미달 모델(evaluate.py:113의 optimal_f1 폴백 발동)은 **점수 0.0 강제 탈락** — 폴백은 운영점을 몰래 바꿔 leaderboard 비교를 무효화하므로 순위에 절대 진입 불가. `runs/{id}.json` 필수 필드:
   - `recall_90_achieved: bool`
   - `params_count`
   - `inference_latency_ms` — 측정 규약 고정(계열 간 비교 가능성): 단일 윈도우(batch=1), warmup 10회 후 100회 측정의 **median**, m1-pro CPU 기준. 게이트 임계값: **> 167ms 시 `latency_gate_failed: true`로 점수 무관 탈락**(30fps 스트림에서 stride 5프레임마다 추론 → 허용 한도 (5/30)×1000ms)
   - `eval_split_hash` — 계산식 고정: `SHA-256(json.dumps(sorted(test_clip_ids)))`(held-out split의 클립 ID 정렬 리스트 — 구현 간 불일치 방지)
   - `weights_path`(채택 모델 복구 보장), `train_seconds`
14c. **무인 런 관측성 + fail-fast**: 실험마다 `ml/experiments/loop_status.json` 갱신(`experiments_completed`, `success_rate`, `elapsed_h`, `disk_free_gb`) — 사람이 중간 점검 가능한 단일 하트비트 파일. **연속 3회**(성공 시 카운터 리셋) recall_90 미달 또는 harness 에러 시 루프 일시정지 + 상태 보고서 작성(깨진 탐색 공간에 8h 토큰 소진 방지). `disk_free_gb < 10` 시에도 일시정지. 크래시 후 재시작 시 기존 `runs/*.json`을 읽고 **이미 수행한 가설은 재실행 금지**(저널 기반 재개)
15. 저널 규약: `ml/experiments/runs/{id}.md`(가설/변경/결과/채택여부 — 실험당 1파일, **기각 실험은 Failure Analysis 절 의무** — "왜 실패했나"가 다음 루프의 가설 생성 컨텍스트가 됨), `ml/experiments/leaderboard.md`(계열별 best + baseline, weights_path 링크 포함), 템플릿 동봉
16. 루프 프롬프트: m1-pro-lab skill에 "무인 런 프로토콜" 절 추가 — Claude가 leaderboard·저널을 읽고 다음 실험 제안→harness 실행→기록, 예산(8h or 20실험) 도달 시 `ml/experiments/summary_report.md` 작성(단일 best 모델 + Lessons Learned 블록: 일관되게 실패한 변형 계열 요약). 권한: m1-pro 클론의 `.claude/settings.local.json`에 harness/uv/pytest allowlist
### Phase 6 — 첫 무인 런 + 정산
17. **ADR 선행 작성** (Architect 지적 — 무인 런의 계약은 런 전에 확정): `docs/decisions/ADR-015-fall-model-adoption-criteria.md`(현재 최신 ADR-014 — 작성 시 `ls docs/decisions/`로 번호 재확인) — evaluator + NH 게이트 + recall_90/latency 미달 시 0.0 탈락 규칙. **스텁 커밋으로는 게이트 불충족** — Decision·Consequences·Alternatives-considered 3개 절은 본문 완성 필수, Status/Date 프론트매터 포함(ADR-013 형식 준용). 첫 무인 런 시작 전 커밋
18. 5계열 baseline 재학습·평가로 leaderboard 초기화 → **리허설 mini-run(예산 2실험)** → 이상 없으면 첫 8h 무인 런 실행
19. 런 종료 후: 저널 리뷰, 채택 모델 artifacts rsync 회수(원격→로컬), PR 생성

## Acceptance Criteria
- [ ] m1-pro-lab skill이 3개 미러에 존재하고, skill 절차만 따라 m1-pro 신규 세션에서 스모크 테스트가 재현됨
- [ ] m1-pro `eldercare-fall` tmux 세션에서 `uv run python -m training.train --smoke-n 4` 완주 (스모크)
- [ ] NH processed 13개+ 전 영상에 confirmed gold 라벨 존재, CSV가 git 추적됨; gold-review strip 이미지는 `git check-ignore`로 ignored 확인
- [ ] `nh_reference_mask.json`이 존재하고 **5계열 전부** 항목 보유, fall_id가 gold CSV `video` 값과 일치
- [ ] `uv run pytest ml/tests/` 통과 (svm/gcn 포함 5계열)
- [ ] `harness.py` 단독 1실험 실행이 메트릭 JSON + 게이트 판정을 산출
- [ ] 첫 무인 런이 예산 내 완주, 실험별 md ≥ 산출 실험 수, leaderboard에 5계열 baseline+best 기록
- [ ] 채택 판정 로그에 evaluator 점수와 NH 게이트 결과가 모두 남음

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| worktree에 git-ignored asset 부재 → 원격 실험 즉시 실패 | skill의 worktree 절차에 asset symlink 단계 명문화 (Phase 1) |
| rsync 방향 실수로 raw 영상 손상 | 단방향 + `--ignore-existing`, `--delete` 금지, raw는 read-only 취급 |
| NH 13클립 게이트의 과민/과소 차단 (binomial SE ±11.6% — 통계적 게이트가 아님) | 게이트는 "회귀 방지 표면"으로만 사용 — 기준은 동결된 `nh_reference_mask.json`. 클립 확충을 follow-up으로 명시 |
| 8h 무감독 LLM의 해석 오류(예: 분포 붕괴를 "개선 임박"으로 오독) | HP 결정은 Optuna로 이관(A+B 합성), Claude는 아키텍처 가설만. recall_90_achieved=false는 기계적 0.0 탈락 — 해석 여지 제거 |
| 무인 Claude 권한 부족으로 런 중단 | m1-pro 클론에 settings.local.json allowlist + 첫 런은 짧은 예산(2실험)으로 리허설 |
| LSTM threshold 0.011 같은 분포 붕괴 모델의 leaderboard 왜곡 | evaluator가 threshold-무관 순위(P@R≥0.90 곡선 기반)로 산출 — evaluate.py recall_90 로직 재사용 |
| 8h 런 중 ssh/tmux 단절 | tmux detach-안전 구조 자체가 대비책, harness는 run-단위 원자적 기록(부분 결과 보존) |
| LE2I held-out 오염(실험 반복으로 인한 overfitting-by-selection) | held-out split 고정 + 저널에 split hash 기록, NH 게이트가 최종 방어선 |

## Verification Steps
1. `sh` 절차 검증: skill 문서의 명령만으로 제3자(새 세션)가 m1-pro 접속→tmux→worktree→스모크까지 도달
2. `uv run pytest ml/tests/` (로컬·원격 양쪽)
3. harness 리허설: 예산 2실험 mini-run → 저널/leaderboard 산출물 검사
4. gold CSV: `git ls-files ml/data/eval/nursing-home-gold.csv`로 추적 확인, 전 행 status=confirmed
5. 첫 무인 런 종료 보고서를 사람이 리뷰 (acceptance criteria 대조)

## ADR (consensus 확정 후 본문 보강)
- **Decision**: 모델 채택 기준 = LE2I window-level precision@fall-recall≥0.90 (1차) + NH gold zero-tolerance miss 회귀 게이트 (2차)
- **Drivers**: 낙상 미탐(false negative)이 최대 위험인 도메인 / NH 데이터 13클립의 통계적 한계 / 무인 루프의 자동 판정 요구
- **Alternatives considered**: optimal-F1 단일 지표(안전 제약 비명시), PR-AUC(운영점 미정의), event-level 지표(평가 코드 부재), NH 주평가(표본 부족)
- **Why chosen**: 기존 evaluate.py recall_90 설계와 연속성, 안전 제약의 명시적 고정
- **Consequences**: recall 90% 미달 모델은 precision 무관 탈락; NH gold 품질이 게이트 신뢰도를 결정(사람 확정 필수)
- **Follow-ups**: event-level 지표 전환 검토(별도 작업), gold 클립 수 확충(13클립 게이트의 통계적 한계 해소), Streamlit gold reviewer(클립 수 확충 시 — 13클립 규모에선 이미지 공유로 충분), `ml/experiments/runs/` 누적 증가에 대한 보존 정책(세션 수십 회 누적 시 아카이브 규칙)

## Changelog (consensus iterations)
- **rev1 (Architect SOUND-WITH-CHANGES 반영)**:
  1. Step 10 — REGISTRY 단독 → train.py:218-289·evaluate.py:142-156 dispatch까지 factory-REGISTRY로 통합 (등록 지점 4→1)
  2. Step 14b 신설 — recall_90 폴백(evaluate.py:113) 발동 시 점수 0.0 강제 탈락, `recall_90_achieved` 필드
  3. Phase 3.5 신설 — `nh_reference_mask.json` 루프 전 동결 (게이트 기준 표류 차단)
  4. Step 7 — NH 추론을 multi-person 경로(PR #62)로 확정, 단일인물 extract_poses 재사용 금지
  5. Step 9 — .gitignore negation 순서 명시 (`!ml/data/` → `!ml/data/eval/` → 파일 예외)
  6. 루프 드라이버 A → A+B 합성 채택 (Claude=아키텍처 가설, Optuna=계열 내 HP)
  7. ADR 작성을 Phase 6 런 전(Step 17)으로 이동, 리허설 mini-run(2실험) 추가
  8. GCN 입력 변환을 gcn.py forward 내부로 확정 — Protocol 계약 보존
- **rev2 (ccg 외부 자문 반영 — Gemini 단독; Codex는 config 충돌 + 행으로 2회 실패)**:
  1. Step 14c 신설 — `loop_status.json` 하트비트, 연속 3회 실패 fail-fast, 저널 기반 크래시 재개(중복 가설 금지)
  2. Step 8 — 정적 2프레임 → 경계 주변 contact strip 2장 (정적 프레임의 앉음/넘어짐 모호성 해소), 파서 라벨 정합성 검증 내장
  3. Step 14b 확장 — run JSON에 `params_count`/`inference_latency_ms`/`eval_split_hash`/`weights_path` 필수화
  4. Step 15 — 기각 실험 Failure Analysis 절 의무화 (다음 루프의 가설 컨텍스트)
  5. Step 16 — 종료 시 `summary_report.md` (best 모델 + Lessons Learned)
  6. 기각: Streamlit gold reviewer(13클립 과투자 → follow-up), batch.yaml 사전 스케줄 대안(사용자 선택한 autoresearch 방향 유지 — drift 위험은 14c fail-fast로 완화)
  7. Gemini 동의 확인: 마스크 동결·14b recall_90 게이트·Phase 1 asset symlink 모두 "critical/excellent" 평가
- **rev3 (Critic REVISE 반영 — CRITICAL 2 + MAJOR 4 전부 수정)**:
  1. [CRITICAL] Phase 3.5 → **Phase 4.5(Step 13b)로 이동** — 마스크 동결은 svm/gcn 포함 5계열 baseline 완성 후에만 가능(기존 순서면 신규 2계열의 첫 실험이 NH 게이트 무방비). fall_id = gold CSV `video` stem으로 정의, 재동결은 사람 승인 시에만
  2. [CRITICAL] Step 9 .gitignore를 완결 체인으로 교체(`ml/data/**` 콘텐츠 패턴 + `gold-review/` 명시 재차단) — CCTV 유래 strip 이미지가 `git add .`로 스테이징되는 경로 봉쇄. 검증을 strip 경로 대상으로 확대
  3. [MAJOR] Step 10 등록 지점 4→**5곳**(evaluate.py:232·:402 artifact 파일명 분기), REGISTRY에 `artifact_filename` 추가, `meta.framework` dispatch 은퇴, smoke monkey-patch의 sequence 전 계열 적용
  4. [MAJOR] Step 14b `eval_split_hash` 계산식 고정(SHA-256 of sorted clip IDs), latency 측정 규약 + 167ms 게이트 명시
  5. [MAJOR] Step 14 HP search space 계열별 기본 테이블 내장(harness 하드코딩, Claude는 부분 override만), per-trial subprocess 격리 timeout
  6. [MAJOR] Step 3 rsync 3개 디렉토리 verbatim 명시("등" 제거), symlink 검증 추가; Step 4 `setup-hooks.sh` 단계 추가; Step 5 스모크를 `train --smoke-n 4`로 교체(evaluate 단독은 공허 통과)
  7. [MINOR] Step 7 evaluate_nh 인터페이스 계약 + TemporalFallClassifierModule 재사용 금지(Frame 기반 비호환), Step 12 GCN 무인자 생성자 제약, Step 17 ADR-015 번호 + 스텁 금지, acceptance criteria에 마스크 검증 추가, spec 파일명 동기화, fail-fast 카운터 리셋·disk 임계값 정의
