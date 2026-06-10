---
slug: fall-autoresearch-loop
title: "Fall-Detector Autoresearch Loop on m1-pro"
type: spec
date: 2026-06-10
interview-id: di-fall-autoresearch-loop
issue: 74
ambiguity: 6.7%      # threshold 5% — PASSED via all-dimensions-0.9+ rule (4 rounds + Round 0)
---

> Crystallized from a deep-interview (`--quick`, 4 rounds + Round 0, ambiguity 6.7%). The
> original `.omc/specs/` scratch source was consumed on promotion (scratch is not
> git-canonical); this file is the canonical, self-contained spec.

# Deep Interview Spec: Fall-Detector Autoresearch Loop on m1-pro

## Metadata
- Interview ID: di-fall-autoresearch-loop
- Rounds: 4 (+Round 0 topology, --quick mode, 사용자 실시간 보강 3회 반영)
- Final Ambiguity Score: ~6.7% (전 차원 0.9+ → 조기 crystallize 규칙 적용)
- Type: brownfield
- Generated: 2026-06-10
- Threshold: 0.05
- Threshold Source: ~/.claude/settings.json
- Initial Context Summarized: no
- Status: PASSED (all-dimensions-0.9+ rule)

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.33 |
| Constraint Clarity | 0.92 | 0.25 | 0.23 |
| Success Criteria | 0.93 | 0.25 | 0.23 |
| Context Clarity | 0.92 | 0.15 | 0.14 |
| **Total Clarity** | | | **0.93** |
| **Ambiguity** | | | **~6.7%** |

## Topology
| Component | Status | Description | Coverage |
|-----------|--------|-------------|----------|
| autoresearch-loop | active | 실험 제안→실행→평가→기록 무인 반복 (karpathy/autoresearch 개념) | 완전 무인, 1회 런 예산: 8시간 또는 실험 20개 중 선도달 |
| classical-track | active | SVM(신규 svm.py) + RF(기존) 정확도 개선 | 기존 rf.py 패턴(feature 45차원) 공유 |
| deep-track | active | LSTM/Transformer 개선 + 경량 ST-GCN scratch 신규(gcn.py) | COCO-17·window30 기존 입력 호환, 누수 없음(사전학습 미사용) |
| remote-infra | active | tailscale ssh `m1-pro` + 전용 tmux 세션에서 Claude Code 실행 | 접근 규약을 프로젝트 skill로 고정 |
| evaluation | active | LE2I 1차 evaluator + nursing home gold 2차 차단 게이트 + Claude 프레임 캡처 라벨링 | gold8은 임의본 → 전량 재라벨링 |

## Goal
LE2I 기반 fall-detector 모델군의 정확도를 m1-pro에서 무인으로 도는 autoresearch 스타일 실험 루프로 지속 개선한다. classical(SVM 신규, RF 기존)과 deep(LSTM, Transformer 기존 + 경량 ST-GCN scratch 신규) 두 트랙을 병행하고, 모든 실험은 LE2I `precision @ fall-recall≥90%`로 순위를 매기며, nursing home gold 라벨 회귀 시 채택을 차단한다. 루프 실행 전 Claude가 nursing home 영상의 낙상 시작/끝 프레임을 캡처·제안하고 사용자가 확정하는 gold 라벨링을 선행한다.

## Constraints
- **Evaluator (단일 채택 지표)**: window-level `precision @ fall-recall ≥ 0.90` on LE2I held-out split — 기존 `ml/training/evaluate.py`의 recall_90 운영점 설계와 일치.
- **2차 차단 게이트**: nursing home gold 클립에서 기존 채택 모델이 잡던 낙상을 하나라도 놓치면 (zero-tolerance miss regression) evaluator 점수와 무관하게 채택 거부.
- **무인 예산**: 1회 런 = 최대 8시간 또는 실험 20개 중 먼저 도달. 사람은 저널만 리뷰.
- **파일 단위 분리**: 모델 계열별로 `ml/training/models/{lstm,transformer,rf,svm,gcn}.py` — 개념적으로 다른 모델은 파일을 공유하지 않음. 실험 기록도 실험 1개당 md 1개.
- **원격 접근 규약 (skill로 고정)**:
  - `ssh m1-pro` (스크립트에서는 `-o RemoteCommand=none` 필수 — ssh config에 RemoteCommand 설정 확인됨)
  - 전용 tmux 세션: `eldercare-fall` (기존 `main` 세션 사용 금지)
  - repo 경로: 로컬과 동일한 `~/Documents/01_Project/eldercare-fall-ai` 클론
  - 작업은 `git wt`로 worktree 분기 (worktree-workflow 규칙 준수, main 직접 작업 금지)
  - worktree 안에서 Claude Code 실행, 실행 전 `claude update`
- **Asset 동기화**: git-ignored 자산(`ml/data/`, `ml/weights/`, `ml/artifacts/`)은 rsync로 m1-pro에 복사 — 코드만 클론해서는 실험 불가.
- **Gold 라벨링 프로토콜**: Claude가 영상별 fall start/end 프레임 판정 → 그 두 프레임만 캡처해 사용자에게 공유 → 사용자가 최종 승인/수정. 기존 gold8-poc-results.csv는 임의 작성본으로 신뢰하지 않음.
- **저장 규약**:
  - gold 라벨 CSV: `ml/data/eval/nursing-home-gold.csv` — .gitignore 예외 추가해 **git 커밋** (schema: video, fall_start_frame, fall_end_frame, fps, status proposed|confirmed, notes)
  - 리뷰용 캡처 프레임: `ml/data/eval/gold-review/{video-slug}/start-f{N}-strip.jpg`, `end-f{N}-strip.jpg` — 경계 ±2프레임 contact strip(plan rev2). CCTV 파생물(프라이버시)이므로 **git 제외**, rsync 동기화
  - 실험 저널: `ml/experiments/` — 실험 1개당 md 1개(가설/변경/결과/채택여부) + 누적 `leaderboard.md`
- **재현성**: 기존 규약 유지 — seed 42, window 30/stride 5, metadata.json 기록 (docs/rules/ml-training.md, ADR-013 준수).

## Non-Goals
- 사전학습 ST-GCN 가중치 사용 (GajuuzZ: 라이선스 부재 + LE2I 누수 / pyskl 전이학습: 이번 사이클 제외)
- nursing home 영상으로 학습 (gold는 평가 전용 — 13클립은 학습에 부족)
- KakaoTalk 알림 등 서빙/알림 파이프라인 변경
- 평가 지표를 event-level로 전환 (window-level 유지, 추후 별도 작업)

## Acceptance Criteria
- [ ] 프로젝트 skill 존재: m1-pro 접근(ssh+RemoteCommand=none), tmux 세션 `eldercare-fall`, repo 경로, worktree·claude 실행·asset rsync 절차가 문서화·자동화됨
- [ ] m1-pro에 repo 클론 + asset rsync 완료, `eldercare-fall` tmux 세션에서 학습/평가가 실제로 1회 이상 실행됨
- [ ] nursing home 전 영상(processed 13개+)에 대해 Claude 제안 → 사용자 확정된 gold 라벨이 `nursing-home-gold.csv`(git 추적)로 존재
- [ ] `ml/training/models/svm.py`, `gcn.py`(경량 ST-GCN)가 기존 파일 패턴으로 추가되고 train.py/evaluate.py에 등록됨
- [ ] autoresearch 루프 1회 런(≤8h, ≤20실험)이 무인 완주하고, 실험별 md + leaderboard.md가 생성됨
- [ ] 채택 결정이 evaluator(LE2I precision@recall≥90) + NH 회귀 게이트 둘 다로 자동 판정됨
- [ ] 5개 모델 계열(RF/SVM/LSTM/Transformer/GCN) 각각 baseline 대비 점수가 leaderboard에 기록됨

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "정확도"가 자명하다 | 어떤 단일 지표로 채택/기각? | precision @ recall≥90 (기존 recall_90 설계와 일치) |
| 루프 자율성 수준 미정 | 무인 vs 승인형? | 완전 무인 + 8h/20실험 예산, 저널 리뷰만 |
| GCN = 사전학습 재사용? | 누수·라이선스 문제 제기 | 경량 ST-GCN scratch (gcn.py, 기존 입력 호환) |
| LE2I만으로 충분 | 도메인 오절 위험 | NH gold 2차 차단 게이트 (낙상 누락 zero-tolerance) |
| gold8 라벨 신뢰 가능 | 사용자: "임의로 만든 것" | Claude 프레임 캡처 제안 → 사용자 확정 재라벨링 |
| 코드 클론이면 실행 가능 | ml/data·weights·artifacts는 git-ignored | rsync asset 동기화 명시 |
| m1-pro 환경 미지 | ssh 실측 | tmux/git/claude/uv 설치 확인, repo 부재, RemoteCommand 설정 발견 |

## Technical Context
- `ml/training/`: train.py/evaluate.py/config.py + models/{lstm,rf,transformer}.py + data/{le2i,features,windowing}.py — main 머지됨
- 학습 아티팩트: `ml/artifacts/fall-detector/{lstm,transformer,rf}/` (LE2I poc, window30/stride5, COCO-17 51차원, seed42) — **로컬 전용, git 미추적**
- evaluate.py: 3 운영점(0.5/optimal_f1/recall_90), recall_90 임계값을 metadata.json에 기록
- nursing home 데이터: `ml/data/nursing-home/{raw,processed,annotated}/` — processed 13개+, pose 렌더링본 존재, 전체 git-ignored
- m1-pro (ssh 실측): arm64, tmux/git/claude/uv/python3 설치, tmux 세션 `main`만 존재, eldercare repo 없음
- 관련 문서: docs/rules/ml-training.md, ADR-013(le2i-training-pipeline), ADR-009(fall-classification-strategy), docs/rules/worktree-workflow.md

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Experiment | core domain | hypothesis, change, model_family, score, adopted | Loop이 생성, Journal에 1:1 기록 |
| Evaluator | core domain | metric=precision@recall≥0.90, split=LE2I held-out | Experiment를 순위화 |
| NH Gold Label | core domain | video, fall_start/end_frame, status | Regression Gate의 기준; Claude 제안→사용자 확정 |
| Regression Gate | core domain | zero-tolerance miss rule | Evaluator 통과 후 2차 차단 |
| Model Family | core domain | rf, svm, lstm, transformer, gcn | 파일 1:1 (models/{family}.py) |
| Remote Runner | supporting | host=m1-pro, tmux=eldercare-fall, path=~/Documents/01_Project/eldercare-fall-ai | Loop을 호스팅; skill로 접근 규약 고정 |
| Asset Sync | supporting | rsync: ml/data, ml/weights, ml/artifacts | Remote Runner 전제조건 |
| Experiment Journal | supporting | ml/experiments/*.md + leaderboard.md | Experiment 기록, 사람 리뷰 인터페이스 |
| Gold Review Frame | supporting | start/end jpg, git-ignored | NH Gold Label 확정 입력물 |
| LE2I Split | external | train/held-out, seed 42 | Evaluator 입력 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 8 | 8 | - | - | N/A |
| 2 | 8 | 0 | 0 | 8 | 100% |
| 3 | 10 | 2 (Asset Sync, Gold Review Frame) | 0 | 8 | 80% |
| 4 | 10 | 0 | 0 | 10 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (Round 0 + 4 rounds + 실시간 보강 3회)</summary>

### Round 0 (토폴로지)
**Q:** 5개 컴포넌트(루프/classical/deep/인프라/평가) 토폴로지 확인
**A:** 맞아요, 5개 그대로

### Round 1
**Q:** 실험 채택/기각의 단일 evaluator는?
**A:** recall≥90%에서 precision
**Ambiguity:** 38%

### Round 2
**Q:** 루프 자율성 수준과 예산은?
**A:** 완전 무인 + 예산 상한
**Ambiguity:** ~30%

### 실시간 보강 1
**A:** NH 영상 낙상 구간을 프레임 캡처로 미리 기록(gold), m1-pro에 repo 클론+worktree+Claude Code 실행, claude update 필요

### Round 3 (배치)
**Q:** NH 검증 역할? / GCN 범위? / 무인 예산+접근 규약 기본값?
**A:** 2차 차단 게이트 / 경량 ST-GCN scratch / 밤새 8시간 + 기본값 OK
**Ambiguity:** 12.5%

### 실시간 보강 2
**A:** skill로 만들 것 = m1-pro 어디로 접근, tmux 어디로 접근 / asset도 복사 필요 / 프로젝트 폴더 위치는 m1 로컬과 동일

### Round 4
**Q:** 산출물 위치 규약(gold CSV git 추적 / ml/experiments/ 저널 / zero-tolerance 회귀 규칙)?
**A:** 세 가지 모두 OK
**Ambiguity:** ~8.8%

### 실시간 보강 3 (최종)
**A:** gold8은 임의 작성본. 낙상 판단은 Claude에게 위임 — 시작/끝 프레임만 캡처해 공유하면 사용자가 최종 판단. 저장 위치 질문 → CSV는 git 추적, 캡처 프레임은 git 제외로 확정
**Ambiguity:** ~6.7% (전 차원 0.9+)
</details>
