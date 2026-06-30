# Rule: NotebookLM 소스 큐레이션 기준

> Scope: NotebookLM 노트북에 입수하는 모든 소스. 모든 수치 기준은 `SRC_GATE_*`
> 환경변수로 오버라이드 가능하다(하드코딩 없음).
> 강제 메커니즘은 `.claude/skills/notebooklm-source-curation/`에 구현된다.
> Venue 판정 메커니즘 근거는 향후 별도 decision로 distill한다. 현재 재구성된 ADR은 ML demo cloud deployment deferral이므로 이 규칙은 ADR 번호를 선점하지 않는다.

---

## 1. 논문 입수 기준표

연차는 **현재 연도 − 출간 연도**로 계산한다.

| 구분 | 통과 조건 | env-var (기본값) |
|---|---|---|
| 0–1년 (신간) | 탑티어 venue 게재만으로 통과 (인용 수 무관) | — |
| 1–3년 | citation ≥ 3 | `SRC_GATE_CIT_1_3Y=3` |
| 4–5년 | citation ≥ 5 | `SRC_GATE_CIT_4_5Y=5` |
| 6년 이상 | citation ≥ 5 | `SRC_GATE_CIT_6Y=5` |
| arXiv-only (미게재 프리프린트) | citation ≥ 50 (연차 무관) | `SRC_GATE_CIT_ARXIV_ONLY=50` |

- 인용 수 조회: Semantic Scholar batch API (`scripts/semantic_scholar.py`).
- 인용 수 조회 실패 → `UNRESOLVABLE` 분류, 자동 통과·자동 삭제 없음.

---

## 2. Venue 판정

**기준**: Google Scholar Metrics 분야 카테고리 Top-N 진입 = 탑티어.

- 기본 N: **10** (`SRC_GATE_VENUE_TOP_N=10`)
- Allowlist 파일: `docs/rules/notebooklm-venue-allowlist.yaml`
- Venue 판정 메커니즘: **수동 스냅샷 YAML, repo 커밋, 연 1회 갱신** (ADR 플래그).
  GS Metrics는 통상 매년 6월 갱신된다. 갱신 후 allowlist를 PR로 업데이트한다.

**대상 카테고리** (낙상 도메인 특성: CV/AI 학회 중심 + 의료 저널 혼합):

| GS Metrics 카테고리 | 도메인 적합성 |
|---|---|
| Computer Vision & Pattern Recognition | 주 도메인 (핵심 — 학회 중심) |
| Artificial Intelligence | 부 도메인 (AI 기법 — 학회 중심) |
| Health & Medical Sciences | 노인간호·낙상 임상 연구 (저널 중심) |

`gs_rank <= SRC_GATE_VENUE_TOP_N AND include: true` → 탑티어 판정.

예외 추가/제거는 allowlist의 `include` 필드와 `note` 필드를 통해 PR로 반영한다.
Venue 주관기관 메모(`sponsor_org`)는 IEEE/ACM 공동 주관 등 신뢰 가산 근거로 사용한다.

---

## 3. 기타 입수 규칙

### 기술 문서 (tech docs)

- **공식 출처만 허용**: 벤더 공식 페이지 / 공식 문서.
- 커뮤니티 출처 차단: Reddit, Stack Overflow, 개인 블로그, Medium 등.

### 중복 제거

동일성 키 우선순위: **DOI > arXiv ID > normalized URL**.
이미 존재하는 소스와 키가 일치하면 입수 거부.

### URL 우선순위

**실제 PDF web URL > 아카이브/abstract 페이지**.
예: `arxiv.org/pdf/…` > `arxiv.org/abs/…`.

### 메타데이터 보강 (enrichment) 파이프라인

URL만 존재하고 DOI/arXiv ID가 없는 소스는 `scripts/enrichment.py`가 단계적으로 해석한다:
URL-regex → source_describe → **defuddle** (빈·짧은 제목인 경우 페이지 fetch로 제목 추출, Node/defuddle 필요, optional) → S2 title search (confidence ≥ 0.85) → UNRESOLVABLE.

---

## 4. 신간 재심사 규칙

venue 통과만으로 입수된 0–1년 소스는 **다음 주기 감사에서 연차 기준으로 재평가**한다.

- 이유: "venue 맹신 금지" — venue 등재가 인용 축적을 보장하지 않는다.
- 상태 추적 파일: `docs/rules/notebooklm-venue-only-passes.yaml`
  (스키마: `source_id`, `url`, `title`, `first_passed_date`, `venue`, `year_at_approval`).
- 첫 번째 감사 시 파일이 없으면 신간 재심사는 no-op이다.

---

## 5. 소급(감사) 정책 — 유형별 차등

감사 절차: **위반 표 출력 → 사용자 confirm → 일괄 삭제**. confirm 없이는 삭제 없음.

| 유형 | 적용 기준 | 미달 처분 |
|---|---|---|
| 논문 | 인용 + venue 기준 엄격 적용 | 삭제 |
| 기술문서 | 공식 출처 여부만 확인 | 비공식이면 삭제 |
| 프리프린트 | arXiv-only citation ≥ `SRC_GATE_CIT_ARXIV_ONLY` | 삭제 |
| OTHER | 자동 판정 불가 | **manual review** |
| UNRESOLVABLE | 메타데이터 해석 불가 | **manual review** (자동 삭제 절대 금지) |

위반 표 컬럼: `소스명 | 유형 | 위반사유 | 처분`

---

## 6. 인용 그래프 확장 기준

| 발굴 경로 | 발동 임계값 | env-var (기본값) |
|---|---|---|
| 공통 피인용 (co-cite) | 수집 논문 ≥ N편이 동일 논문을 인용 | `SRC_GATE_COCITE_MIN=3` |
| 빈출 저자 (frequent author) | 수집 논문 ≥ N편에 등장하는 저자의 논문 | `SRC_GATE_AUTHOR_MIN=3` |

- 확장 후보도 **동일 입수 기준표 통과 필수** (발굴 경로가 달라도 기준은 단일).
- 확장 시 저자 소속 및 이전 연구 이력 확인 단계 포함.

---

## 7. 수집 키워드 레지스트리

노트북별 수집 키워드를 기록·유지한다. 키워드 신규 진입 시 Survey/Review 논문 우선 수집.

| 노트북 | 키워드 |
|---|---|
| 요양원 낙상 보호 AI | fall detection, top-down CCTV, pose estimation, video anomaly detection, VLM verification, nursing home monitoring |

---

## 8. Invariants

- **모든 수치 기준은 `SRC_GATE_*` env-var로 오버라이드 가능하다** — 스크립트 내 하드코딩 없음.
- **소스 삭제는 반드시 사용자 confirm 후에만 실행된다** (`confirm=True` 없이는 삭제 API 호출 없음).
- **UNRESOLVABLE 소스는 자동 삭제되지 않는다** — 항상 manual review 처분으로 기록.
- **OTHER 유형은 자동 통과·자동 차단 없음** — 항상 manual review.
- **venue 판정 allowlist는 git canonical 경로**(`docs/rules/notebooklm-venue-allowlist.yaml`)에 존재하며, 변경은 PR + git diff로 추적된다.

---

## 참고 (비강제): 읽기 깊이 전략

논문 수집 후 읽기 깊이 분류 (강제 대상 아님, 개인 운용 기준):

| 깊이 | 기준 | 예시 편수 |
|---|---|---|
| 정독 | 방법론 + 실험 전체 검토 | ~2편 (핵심 기반 논문) |
| 정도 이해 | 서론·결론 + 핵심 섹션 | 5–8편 |
| Skim | 제목·초록·결론만 | 나머지 |
