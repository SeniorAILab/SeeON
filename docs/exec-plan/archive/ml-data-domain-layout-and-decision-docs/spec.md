```yaml
slug: ml-data-domain-layout-and-decision-docs
```

# Deep Interview Spec: ML 데이터 도메인 레이아웃 규약 + ML 의사결정 문서화

## Metadata
- Interview ID: di-2026-06-10-ml-data-domain
- Rounds: 4 (+ Round 0 topology gate)
- Final Ambiguity Score: ~13%
- Type: brownfield
- Generated: 2026-06-10
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: yes (이전 세션 컨텍스트 요약 사용)
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.85 | 0.25 | 0.213 |
| Success Criteria | 0.85 | 0.25 | 0.213 |
| Context Clarity | 0.85 | 0.15 | 0.128 |
| **Total Clarity** | | | **0.87** |
| **Ambiguity** | | | **~13%** |

## Topology
| Component | Status | Description | Coverage |
|-----------|--------|-------------|----------|
| data-layout 규약 | active | `ml/data/` 도메인 우선 2계층 구조 (R1, R2, 추가입력 2건) | 분할 원칙·강제 수준·이동 범위 확정 |
| ML 의사결정 문서화 | active | ADR 소수 + ML rules 한 장 (R3) | 문서 모양 확정 |
| 데모 데이터 피커 UX | active | 드롭다운 + mp4 + 업로드 유지 (사용자 추가입력, R4) | 범위 확정 |

## Goal
`ml/data/`를 **도메인(출처) 우선 + 도메인 내부 강제 역할 subfolder** 2계층 구조로 재편하고,
그 규약과 지금까지의 ML 의사결정(라벨링, 임계값, 데이터셋 선택, gold-8 평가)을
ADR 소수 + `docs/rules/` ML rules 한 장으로 MECE하게 기록한다. Streamlit 데모는
`ml/data/` 도메인 클립을 드롭다운으로 직접 선택해 실행할 수 있어야 하며(업로드 병행 유지),
avi 외 mp4도 지원한다.

## Constraints
- **최상위 = 도메인(출처)**: `nursing-home/`(요양원 수집), `le2i/`(외부 데이터셋), 향후 `upfall/` 등.
- **도메인 내부 subfolder는 강제(mandatory)**: 표준 역할 어휘 `raw/`(원본), `processed/`(가공),
  `poses/`(포즈 추출 npz), `annotated/`(오버레이 영상). 임의 명명 금지.
- **도메인 교차 산출물은 최상위 유지**: `eval/`(모델 비교 리포트 — 여러 도메인에 걸침),
  `uploads/`(데모 임시 업로드 — 도메인 무관, 배포 후 외부 테스터 경로로 반드시 유지).
- 강제는 이번 사이클에서 **컨벤션 수준**(문서 규약). 훅/스크립트 검증은 추후.
- ADR-004(입력 위치)·ADR-007(출력 위치)의 역할 축 규칙은 도메인 내부로 재정의되므로
  새 레이아웃 ADR이 **supersede 관계를 명시적으로 정리**해야 함 (ADR은 삭제 불가, supersede만).
- `ml/data/`는 계속 gitignore — 데이터·가중치는 절대 커밋하지 않음 (ADR-004 불변식 유지).
- 문서 모양: **되돌리기 비싼 결정만 ADR 신규 2~3개** (① 데이터 레이아웃 supersede,
  ② 학습 파이프라인 결정 — Le2i 선택·윈도우 라벨링·recall-first 임계값 정책·gold-8 평가법의
  결정적 부분). **운영 세부는 `docs/rules/ml-training.md` 한 장**(T=30/stride=5, overlap 0.5,
  threshold 산출 절차, metadata.json 계약, 전처리 규칙). 기존 ADR-003/005/009와 MECE 유지.
- 데모: 드롭다운 소스는 `ml/data/{domain}/{raw,processed}/` 클립. avi+mp4 모두 지원
  (extract_poses 글롭과 데모 인테이크 양쪽).
- **접근 분리(배포 모드)**: 내부 클립 드롭다운은 로컬/운영자 모드 전용. 배포된 데모에서
  외부 테스터는 **자신이 업로드한 클립에 대해서만** 낙상 탐지 실행 — 요양원 수집 데이터는
  외부에 절대 노출되지 않음 (개인정보 경계). 모드 구분 메커니즘(환경변수/설정)은 plan에서 결정.
- 모든 코드 작업은 워크트리 브랜치에서 (`git wt`), main 직접 작업 금지.

## Non-Goals
- 훅/스크립트 기반 레이아웃 강제 (추후 사이클)
- 실제 배포 인프라 (업로드 경로를 "유지"만 하면 됨 — 배포 자체는 별도 작업)
- UP-Fall 등 신규 데이터셋 추가 (구조만 수용 가능하게)
- 기존 ADR 본문 수정 (supersede 문서로만)

## Acceptance Criteria
- [ ] 새 레이아웃 ADR: 도메인 우선 2계층 파티션 정의, ADR-004/007과의 supersede/보완 관계 명시
- [ ] 학습 파이프라인 결정 ADR: Le2i 선택, 윈도우 라벨링 규칙, recall-first 운영 임계값 정책, gold-8 2차 평가의 결정적 근거 + 기각 대안
- [ ] `docs/rules/ml-data-layout.md`(또는 기존 ml-filesystem-layout.md 갱신): 강제 subfolder 표 포함
- [ ] `docs/rules/ml-training.md`: 파라미터·절차·계약(metadata.json) 운영 규약
- [ ] `ml/data/`가 실제로 새 구조로 이동됨 (nursing-home/, le2i/ 도메인 폴더)
- [ ] `training/config.py`·`extract_poses`·`evaluate --gold-clips-dir` 기본값 등 코드 경로 일괄 갱신, ruff + pytest 전체 그린
- [ ] Streamlit: `ml/data/` 도메인 클립 드롭다운 선택 → 즉시 추론 실행 가능
- [ ] Streamlit: avi + mp4 모두 동작, 업로드 경로도 그대로 동작
- [ ] 배포 모드에서 드롭다운(내부 데이터) 비노출 — 외부 테스터는 본인 업로드 클립만 추론 가능
- [ ] 데이터 파일이 git에 스테이징되지 않음 (gitignore 경계 유지 확인)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 역할(role) 축 분할로 충분 (ADR-004/007) | le2i_raw/poses가 파티션 밖에서 발생 | 도메인 축을 최상위로 승격, 역할은 도메인 내부로 |
| 외부 데이터셋만 격리하면 됨 | "추후 test/training에 쓸 거니 도메인 단위로" | 요양원 데이터도 도메인 폴더로 — 전면 재편 |
| 파생물은 공용 출력 폴더로 | 도메인별 재사용 시 한 곳에서 보여야 함 | poses/annotated는 도메인 안, eval만 교차 출력으로 최상위 |
| 데모는 업로드 중심 | 드롭다운이 더 편함 | 둘 다: 드롭다운 추가 + 업로드 유지(배포 대비) |
| 결정마다 ADR | 운영 세부까지 영구 문서화는 과함 | ADR 소수 + rules 한 장 |

## Technical Context
- 현 상태: main `ml/data/{raw,processed,annotated,uploads}` (요양원), 워크트리 `ml/data/{le2i_raw,le2i_poses,eval,uploads}` — 두 체크아웃에 분산
- gold-8 클립: main의 `ml/data/processed/` (예: "2026-02-11 베스트요양원1 401호.mp4")
- 관련 기존 문서: ADR-004, ADR-007, `docs/rules/ml-filesystem-layout.md`, ADR-003/005/009
- 경로 참조 코드: `ml/training/config.py`(LE2I 경로), `training/extract_poses.py`(--input-dir, avi 글롭), `training/evaluate.py`(--gold-clips-dir), `demo/app.py`(업로드 인테이크)
- 워크트리 워크플로 필수: `git wt <issue#>`
- 주의: 진행 중인 review-fix 커밋(워크트리 브랜치)과 독립 — 이 작업은 새 슬러그/새 워크트리

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Domain | core | name(nursing-home/le2i/…), provenance | has mandatory RoleSubfolders |
| RoleSubfolder | core | raw/processed/poses/annotated | belongs to one Domain |
| CrossDomainOutput | supporting | eval/ | aggregates across Domains |
| TransientUpload | supporting | uploads/ | domain-agnostic, 배포 후 외부 테스터 경로 |
| LayoutADR | artifact | supersedes ADR-004/007 부분 | constrains Domain structure |
| TrainingDecisionADR | artifact | Le2i, labeling, threshold, gold-8 | constrains rules doc |
| MLRulesDoc | artifact | params, procedures, contracts | operationalizes ADRs |
| DemoClipPicker | feature | dropdown source dirs, avi+mp4 | reads Domain/RoleSubfolder |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 6 | 2 | 0 | 4 | 67% |
| 3 | 7 | 1 | 0 | 6 | 86% |
| 4 | 8 | 1 | 0 | 7 | 88% |

## Interview Transcript
<details>
<summary>Full Q&A (4 rounds + Round 0)</summary>

### Round 0 — 토폴로지
**Q:** 2 컴포넌트(data-layout 규약 / ML 의사결정 문서화)가 맞는가?
**A:** 맞아요, 둘 다. (이후 사용자 추가입력으로 데모 피커 UX 컴포넌트 추가)

### Round 1
**Q:** 역할 축(ADR-004/007)과 출처 축의 결합 방식은?
**A:** "추후 test/training에 쓸 거니 도메인 단위로 묶는 게 필요하지 않을까? ADR-7은 뭐하고 있는 거냐?" → ADR-007은 역할 축만 다룸을 확인, 도메인 축 공백 합의.

### Round 2
**Q:** 파생물(poses/eval)도 도메인 폴더 안에 넣는가?
**A:** "좋은데 그러면 하위 data도 구분해야 하지 않을까요?" + 후속: "하위 subfolder도 강제해야 한다고 생각함" → 완전 도메인 우선 + 강제 역할 subfolder.

### Round 3
**Q:** 문서 모양 — ADR vs rules 배분?
**A:** ADR 소수 + ML rules 한 장 (Recommended 선택).

### Round 4
**Q:** 완료 범위는? (복수 선택)
**A:** 문서 + 물리 이동/코드 경로 + 데모 드롭다운/mp4 + 컨벤션 수준 강제, 단 업로드도 유지(배포해서 외부 테스트 가능해야).
**Ambiguity:** ~13%
</details>
