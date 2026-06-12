---
slug: notebooklm-source-curation
date: 2026-06-12
author: planner
spec: spec.md
---

# Plan: NotebookLM 소스 큐레이션 기준 제정 + 강제

## Context

`spec.md` (ambiguity 5%, PASSED)에서 확정된 5개 컴포넌트를 구현한다. 핵심 목표:
NotebookLM 소스 입수 기준을 `docs/rules/`에 standing rule로 제정하고, skill-creator로
입수 게이트 + 감사 스킬을 제작해 코드로 강제한다. 제정 즉시 현재 노트북
(ba3b3d80-0cec-4c72-8910-2981b523be28, "요양원 낙상 보호 AI", ~134 소스)을 소급 감사한다.

---

## Implementation-Means Decision: GS Metrics venue 판정 방법

spec.md에서 plan 단계로 위임된 결정. GS Metrics는 공식 API 없음.

**채택: Option A — 수동 스냅샷 YAML, repo 커밋, 연 1회 갱신**

| 옵션 | 장점 | 단점 |
|---|---|---|
| **A. 수동 스냅샷 (채택)** | 오프라인·결정론적·git diff 추적·ToS 무관 | 갱신이 수동 (연 1회) |
| B. `scholarly` 스크래핑 | 최신 데이터 | GS DOM 변경에 취약, rate-limit, ToS 위반 가능, CI 불가 |
| C. 하이브리드 | 갱신 주기 단축 가능 | B의 단점 + 복잡도 상승, 이득 희박 |

**근거**: GS Metrics는 연 1회(통상 6월) 갱신된다. 갱신 주기가 길어 스크래핑 이득이 없다.
`scholarly`는 DOM 변경마다 깨지고 자동화 파이프라인에 외부 의존성을 추가한다. 수동 스냅샷
YAML은 `git blame`으로 갱신 이력이 추적되고, 오프라인·CI 환경에서도 작동하며, PR 리뷰로
venue 추가/제외를 감사할 수 있다. Semantic Scholar batch API(인용 수 조회)는 이미 이
repo의 워크플로에서 검증 완료된 경로로 유지한다.

> **ADR 플래그 (plan 완료 후 distill 필요)**: venue 판정 메커니즘 선택(GS Metrics
> 스냅샷 vs scraping)은 향후 모든 NotebookLM 자동화 워크플로에 영향을 미치는
> cross-cutting 결정이다. 이 plan을 archive로 이동할 때
> `docs/decisions/ADR-021-notebooklm-venue-judgment-mechanism.md`로 distill할 것.

---

## Work Objectives

1. `docs/rules/notebooklm-source-curation.md` — 영구 standing rule 제정
2. `docs/rules/notebooklm-venue-allowlist.yaml` — GS Metrics 스냅샷 + 허용/제외 목록
3. `.claude/skills/notebooklm-source-curation/` — 입수 게이트 + 감사 스킬 (두 모드)
4. 스킬 미러: `.agents/skills/` 동기화, `.codex/skills/` symlink 확인
5. 노트북 ba3b3d80 소급 감사 1회 실행 + 처분 리포트

## Guardrails

**Must Have**
- 모든 수치 기준은 `SRC_GATE_*` env-var로 오버라이드 가능해야 한다 (하드코딩 없음).
- 소스 삭제는 반드시 사용자 confirm 이후에만 실행된다 (`source_delete(confirm=True)`).
- 스킬 미러 세 경로가 항상 동일한 내용을 가져야 한다.
- rule-doc과 allowlist 파일은 git canonical 경로(`docs/rules/`)에 위치해야 한다.

**Must NOT Have**
- 기술문서·DEVONthink·Obsidian 큐레이션은 scope 밖.
- `docs/research/`의 인용 소급 정리는 scope 밖.
- scholarly 스크래핑 — 채택하지 않기로 결정함 (위 메커니즘 결정 참조).
- 읽기 깊이 전략은 rule의 "참고" 섹션으로만 기록하며, 강제 로직 대상이 아님.

---

## Steps

### Step 1 — Standing Rule-Doc 제정

**파일**: `docs/rules/notebooklm-source-curation.md`

rule 문서 스타일은 `docs/rules/ml-models.md`를 따른다: 섹션 헤더 + 표 + 불변 조건(Invariants).

**포함 내용 (순서대로)**:

1. **논문 입수 기준표** — 연차 구간별 통과 조건 + 각 항목의 `SRC_GATE_*` env-var 기본값

   | 구분 | 기준 | env-var (기본값) |
   |---|---|---|
   | 0–1년 (신간) | 탑티어 venue 게재로 통과 (인용 무관) | — |
   | 1–3년 | citation ≥ 3 | `SRC_GATE_CIT_1_3Y=3` |
   | 4–5년 | citation ≥ 5 | `SRC_GATE_CIT_4_5Y=5` |
   | 6년 이상 | citation ≥ 5 | `SRC_GATE_CIT_6Y=5` |
   | arXiv-only | citation ≥ 50 (연차 무관) | `SRC_GATE_CIT_ARXIV_ONLY=50` |

2. **Venue 판정** — GS Metrics 분야 카테고리 Top-N 진입 = 탑티어. `SRC_GATE_VENUE_TOP_N=10`.
   대상 카테고리: `CV&PR`, `AI`, `Health & Medical Sciences`. allowlist 파일 경로:
   `docs/rules/notebooklm-venue-allowlist.yaml`. 분야 특성 명시: 낙상 도메인 = CV/AI
   학회 중심 + 의료 저널 혼합.

3. **기타 입수 규칙**
   - 기술문서: 공식 출처만 (벤더 공식 페이지/공식 문서 허용, 커뮤니티/Reddit 차단)
   - 중복 금지: DOI > arXiv ID > normalized URL 순 동일성 키
   - URL 우선순위: 실제 PDF web URL > archive/abstract 페이지
   - 인용 수 조회: Semantic Scholar batch API

4. **신간 재심사 규칙** — venue-only 통과 소스(0–1년)는 다음 주기 감사에서 연차 기준으로
   자동 재평가. 이유: "venue 맹신 금지" (교수님 방법 Step 3).

5. **소급(감사) 정책 — 유형별 차등**
   - 논문: 인용/venue 기준 엄격 적용, 미달 삭제
   - 기술문서: 공식 출처만 유지, 커뮤니티 소스 삭제
   - 프리프린트: arXiv-only ≥ 50 기준, 미달 삭제
   - 절차: 위반 표(소스명/유형/위반사유/처분) → 사용자 confirm → 일괄 삭제

6. **인용 그래프 확장 기준**
   - co-cite ≥ 3편 공통 피인용: `SRC_GATE_COCITE_MIN=3`
   - author ≥ 3편 등장 저자: `SRC_GATE_AUTHOR_MIN=3`
   - 확장 후보도 동일 입수 기준표 통과 필수 (경로만 다르고 기준은 단일)
   - 저자 소속·이전 연구 이력 확인 단계 포함

7. **수집 키워드 레지스트리** — 노트북별 수집 키워드 테이블 (초기 항목: 요양원 낙상 보호 AI).
   키워드 신규 진입 시 Survey/Review 논문 우선 수집.

8. **참고 (비강제)** — 읽기 깊이 전략: 2편 정독 / 5–8편 정도 이해 / skim.

**검증 기준**:
- [ ] `docs/rules/notebooklm-source-curation.md`가 존재한다
- [ ] 기준표의 모든 행에 env-var 기본값이 명시된다
- [ ] venue 판정 섹션에 `SRC_GATE_VENUE_TOP_N=10`과 allowlist 파일 경로가 있다
- [ ] 신간 재심사 규칙이 독립 섹션으로 존재한다
- [ ] 키워드 레지스트리 테이블에 요양원 낙상 보호 AI 항목이 있다

---

### Step 2 — Venue Allowlist 파일 제작

**파일**: `docs/rules/notebooklm-venue-allowlist.yaml`

**형식 결정**: YAML — 사람이 읽기 쉽고 주석을 지원하며 diff 친화적. Python PyYAML로 파싱.

**파일 헤더**:
```yaml
# NotebookLM venue allowlist
# GS Metrics snapshot: 2025
# Next refresh: 2026-06
# Mechanism: manual snapshot (ADR-021)
# Top-N default: 10 (SRC_GATE_VENUE_TOP_N)
```

**항목 스키마** (필수 6개 + 선택 2개 — `short`/`note`는 선택, 아래 필수/선택 구분 참조):
```yaml
- venue: "Conference on Computer Vision and Pattern Recognition"
  short: "CVPR"
  gs_category: "Computer Vision & Pattern Recognition"
  gs_rank: 1                    # 2025 GS Metrics 스냅샷 내 순위
  gs_snapshot_year: 2025
  sponsor_org: "IEEE/CVF"       # 신뢰 가산 근거 메모
  include: true
  note: ""                      # 예외 사유 (allowlist 추가/제외 시 필수)
```

**초기 커버리지**: GS Metrics 2025 기준 낙상 도메인 관련 venue
- `CV&PR` 카테고리: CVPR, ICCV, ECCV, NeurIPS(CV 트랙) 등 Top-10 내 항목
- `AI` 카테고리: AAAI, IJCAI 등 Top-10 내 항목
- `Health & Medical Sciences` 카테고리: 낙상 관련 저널 Top-10 내 항목
- 분야 특성 주석: 낙상 도메인은 CV/AI(학회 중심) + 의료(저널 중심) 혼합임을 헤더에 명시

**한국어 저널 정책 (Korean-venue)**: 이 노트북은 한국 요양원 도메인을 다루므로
`한국노인간호학회지`, `Journal of Korean Academy of Nursing` 등 한국 의료·노인간호 저널은
GS Metrics `Health & Medical Sciences` Top-10에 등재되지 않아 allowlist 자동 조회에서 누락된다.
누락 방지를 위해 allowlist에 `language: ko` 서브섹션을 추가해 관련 한국어 저널을 명시적으로
`include: true`로 등재한다. 이 항목들은 `gs_rank: null`, `gs_category: "Korean Medical"` 로 표기하고
`note` 필드에 수동 추가 근거를 기록한다.

**필드 필수/선택 구분**:
- 필수 (6개): `venue`, `gs_category`, `gs_rank`, `gs_snapshot_year`, `sponsor_org`, `include`
- 선택: `short` (축약명), `note` (예외 사유 — `include: false` 항목에는 권장)

**검증 기준**:
- [ ] `docs/rules/notebooklm-venue-allowlist.yaml`이 존재하고 YAML 파싱 가능하다
- [ ] 모든 항목에 6개 필수 필드(venue, gs_category, gs_rank, gs_snapshot_year, sponsor_org, include)가 있다
- [ ] `gs_category` 값 `Computer Vision & Pattern Recognition`, `Artificial Intelligence`, `Health & Medical Sciences` 각각 ≥ 1개 항목이 있다
- [ ] `language: ko` 서브섹션에 한국 의료/노인간호 저널이 ≥ 1개 포함된다
- [ ] 파일 헤더에 스냅샷 연도(`2025`)와 다음 갱신 시점(`2026-06`)이 명시된다

---

### Step 3 — Enforcement 스킬 제작

**도구**: `/oh-my-claudecode:skill-creator`
**출력 primary 위치**: `.claude/skills/notebooklm-source-curation/`

**디렉터리 구조**:
```
.claude/skills/notebooklm-source-curation/
├── SKILL.md
└── scripts/
    ├── gate.py               # 입수 게이트 로직
    ├── audit.py              # 감사 로직 (NotebookLM MCP 호출)
    ├── enrichment.py         # 소스 메타데이터 보강 (URL/title → DOI/arXiv/year/venue/citations)
    └── semantic_scholar.py   # Semantic Scholar batch API 래퍼
```

**SKILL.md 구성**: `fall-video-crop-rename/SKILL.md` 스타일 — frontmatter(name/description),
두 모드 설명, 보조 스크립트 표, 공통 env-var 목록, 워크플로(게이트/감사 각각), 성공 기준 체크리스트.

---

#### Mode A: 입수 게이트 (`gate`)

호출: `/notebooklm-source-curation gate <url_or_doi>`

`scripts/gate.py` 실행 흐름:

1. 소스 유형 분류: 논문(DOI/arXiv ID 존재) / 기술문서(공식 벤더 URL) / 프리프린트(arXiv-only)
   / **OTHER** (YouTube, GitHub repo, Drive doc, text blob 등 위 세 유형에 해당하지 않는 모든 것)
   - `OTHER` → 자동 통과/차단 없음, 반드시 **manual review** 처분으로 라우팅, 사유 출력. silent error 없음.
2. 기술문서 경우: 공식 출처 여부만 확인 → 통과/차단 반환
3. 논문/프리프린트:
   a. 출간 연도 추출 → 연차 구간 결정
   b. venue 판정: `docs/rules/notebooklm-venue-allowlist.yaml` 로드 →
      `gs_rank <= SRC_GATE_VENUE_TOP_N` 조건 + `include: true` 확인
   c. arXiv-only 여부 확인 (venue 게재 이력 없음)
   d. Semantic Scholar batch API → 인용 수 조회 (`scripts/semantic_scholar.py`)
   e. 연차 구간 + venue + 인용 수 조합으로 최종 통과/차단 판정
4. 중복 키 체크: DOI > arXiv ID > normalized URL 순으로 기존 소스와 대조
5. 출력: `PASS` or `BLOCK` + 사유 한 줄

**env-var 로드 (모두 `os.environ.get(key, default)` 패턴, 하드코딩 없음)**:
```
SRC_GATE_CIT_1_3Y        default 3
SRC_GATE_CIT_4_5Y        default 5
SRC_GATE_CIT_6Y          default 5
SRC_GATE_CIT_ARXIV_ONLY  default 50
SRC_GATE_VENUE_TOP_N     default 10
```

---

#### Mode B: 감사 (`audit`)

호출: `/notebooklm-source-curation audit <notebook_id>`

`scripts/audit.py` 실행 흐름:

1. `mcp_notebooklm_source_list(notebook_id)` → 소스 목록 수집 (URL + title만 반환됨)
2. **소스별 메타데이터 보강** (`scripts/enrichment.py::enrich_source(url, title)` 호출):
   현재 노트북 ~134 소스 중 약 68건이 deep-research import 경유 불명 출처(URL-only/opaque)임 —
   보강 실패는 edge case가 아니라 다수 사례이므로 반드시 처리한다.

   해석 순서 (resolution order):
   a. **URL-regex**: `arxiv.org`, `doi.org`, `dl.acm.org`, `ieeexplore.ieee.org`,
      `link.springer.com` 등 URL 패턴으로 DOI/arXiv ID 직접 추출
   b. **source_describe 파싱**: URL-regex 실패 시 `mcp_notebooklm_source_describe(source_id)` 호출 →
      응답 내 구조화 메타데이터(title, year, authors) 파싱 시도
   c. **Semantic Scholar 제목 검색**: `/paper/search?query={title}&fields=...` → 제목 유사도
      match-confidence 임계값(기본 0.85) 이상이면 채택
   d. 위 세 단계 모두 실패 → 유형 `UNRESOLVABLE` 분류, 위반 표에 **manual review** 처분으로
      기록. 자동 통과·자동 삭제 없음.

   `enrich_source()` 반환 구조:
   ```python
   {
     "doi": str | None,
     "arxiv_id": str | None,
     "year": int | None,
     "venue": str | None,
     "citation_count": int | None,  # None = UNRESOLVABLE
     "resolution_path": str,        # "url_regex" | "source_describe" | "s2_title" | "unresolvable"
   }
   ```

3. 소스별 유형 분류 후 게이트 기준 적용 (유형별 차등 정책):
   - 논문: 인용 + venue 기준 적용
   - 기술문서: 공식 출처 여부만 확인
   - 프리프린트: arXiv-only ≥ `SRC_GATE_CIT_ARXIV_ONLY` 기준 적용
   - OTHER: manual review 처분 (자동 판정 없음)
   - UNRESOLVABLE (보강 실패): manual review 처분 (자동 삭제 절대 금지)
4. **신간 재심사**: venue-only 통과 이력 상태 파일
   `docs/rules/notebooklm-venue-only-passes.yaml` 로드 → 해당 소스를 현재 연차 기준으로
   재평가. 상태 파일 스키마:
   ```yaml
   - source_id: "abc123"
     url: "https://..."
     title: "..."
     first_passed_date: "2026-06-12"
     venue: "CVPR"
     year_at_approval: 2025
   ```
   첫 번째 감사(이 plan의 Step 5)는 이 파일이 존재하지 않으므로 신간 재심사는 **no-op**.
   감사 완료 후 venue-only 통과 소스를 파일에 기록해 다음 주기에 재평가되도록 한다.
5. 확장 후보 스캔: co-cite ≥ `SRC_GATE_COCITE_MIN`, author ≥ `SRC_GATE_AUTHOR_MIN`
   조건 충족 항목 식별 → 동일 게이트 통과 여부 검증
6. 위반 표 출력:

   | 소스명 | 유형 | 위반사유 | 처분 |
   |---|---|---|---|
   | … | 논문 | citation 2 (1–3y 기준 ≥3 미달) | 삭제 |
   | … | UNRESOLVABLE | 메타데이터 미해석 | manual review |

7. 사용자 confirm 대기 (`confirm` param 없이는 삭제 없음)
8. confirm 후: `mcp_notebooklm_source_delete(notebook_id, source_ids=[...], confirm=True)` 배치 실행
9. 처분 결과(삭제 수/유지 수/manual review 수/오류)를
   `docs/exec-plan/active/notebooklm-source-curation/audit-{date}.md`에 저장 (git canonical)

**env-var (추가)**:
```
SRC_GATE_COCITE_MIN  default 3
SRC_GATE_AUTHOR_MIN  default 3
```

---

**`scripts/semantic_scholar.py` 인터페이스**:
```python
def fetch_citations(ids: list[str]) -> dict[str, int | None]:
    """ids: DOI 또는 arXiv:XXXX.XXXXX 형식.
    returns {id: citation_count} — None은 S2에서 미발견(UNRESOLVABLE).
    None을 인용 수 0으로 취급하거나 통과시키면 안 됨: 호출자는 None을 별도 처분 카테고리로 라우팅할 것."""
```
- Semantic Scholar batch endpoint: `POST https://api.semanticscholar.org/graph/v1/paper/batch`
- fields: `citationCount,year,venue,externalIds`
- rate-limit 대응: **unauthenticated 1000ms 간격** (S2 비인증 제한 1 req/sec);
  `S2_API_KEY` env-var 설정 시 100ms 단축 허용. 최대 500 IDs/batch.
- API key 없음이 기본 (본 repo 워크플로 기검증 경로); key 있을 경우 자동 감지

---

**검증 기준**:
- [ ] `SKILL.md`가 두 모드(gate/audit)와 보조 스크립트 표를 명확히 기술한다
- [ ] `gate.py` 직접 실행: 논문(고인용) → `PASS`, arXiv-only(저인용) → `BLOCK`, 커뮤니티 URL → `BLOCK` 반환
- [ ] `audit.py`: `source_list` 호출 → 위반 표 출력 → confirm 없이는 삭제 없음 → confirm 후 `source_delete` 실행
- [ ] 모든 임계값이 env-var로 오버라이드된다 (`SRC_GATE_CIT_1_3Y=1 python scripts/gate.py …` 로 동작 변경 확인)
- [ ] `semantic_scholar.py`가 DOI/arXiv ID 배치로 인용 수 dict를 반환한다

---

### Step 4 — 스킬 미러 동기화

**의존성**: Step 3 완료 후 실행.

`.codex/skills/`는 디렉터리 레벨 symlink가 아니라 **실제 디렉터리**이며,
내부에 스킬별 개별 symlink가 존재한다(예: `fall-video-crop-rename -> ../../.agents/skills/fall-video-crop-rename`).

| 경로 | 처리 방식 |
|---|---|
| `.claude/skills/notebooklm-source-curation/` | Step 3에서 생성 (primary) |
| `.agents/skills/notebooklm-source-curation/` | clean-overwrite: `rm -rf` 후 `cp -r` (stale partial-run 파일 방지) |
| `.codex/skills/notebooklm-source-curation` | 개별 symlink 생성: `ln -s ../../.agents/skills/notebooklm-source-curation .codex/skills/notebooklm-source-curation` |

**검증 기준**:
- [ ] `.claude/skills/notebooklm-source-curation/SKILL.md` 존재
- [ ] `.agents/skills/notebooklm-source-curation/SKILL.md` 존재하고 `.claude/` 버전과 동일하다 (`diff .claude/skills/notebooklm-source-curation/SKILL.md .agents/skills/notebooklm-source-curation/SKILL.md` 출력 없음)
- [ ] `.codex/skills/notebooklm-source-curation`이 `.agents/skills/notebooklm-source-curation`을 가리키는 개별 symlink이다 (`ls -la .codex/skills/notebooklm-source-curation` 확인)

---

### Step 5 — 첫 번째 소급 감사 실행

**의존성**: Step 4 완료 후 실행.

**대상**: 노트북 "요양원 낙상 보호 AI", id `ba3b3d80-0cec-4c72-8910-2981b523be28` (~134 소스)

**절차**:
1. Step 3 스킬 audit 모드 실행 (`notebook_id=ba3b3d80-0cec-4c72-8910-2981b523be28`)
2. 유형별 차등 정책 적용 (Step 3 Mode B 흐름 그대로)
3. 위반 소스 표 출력 → 사용자 검토
4. 사용자 confirm 후 `source_delete(confirm=True)` 배치 실행
5. 처분 결과 리포트 저장:
   - 경로: `docs/exec-plan/active/notebooklm-source-curation/audit-20260612.md` **(git canonical)**
   - 이유: 감사 리포트는 무엇이 왜 삭제됐는지에 대한 영구 기록이다. `.omc/plans/` scratch에 두면
     git 이력에 남지 않아 추적 불가. 이 plan의 active 폴더 안에 함께 커밋해 archive 시 같이 이동한다.
   - 포함 내용: 총 소스 수 / 유형별 위반 수 / 삭제 수 / 유지 수 / manual review 대상 수 / 오류 수
     + 위반 소스 전체 목록(소스명/유형/위반사유/처분)

**검증 기준**:
- [ ] 위반 소스 표가 소스명/유형/위반사유/처분 컬럼을 포함해 출력된다
- [ ] confirm 없이는 단 한 건도 삭제되지 않는다
- [ ] 처분 결과 리포트가 `docs/exec-plan/active/notebooklm-source-curation/audit-20260612.md`에 저장된다
- [ ] UNRESOLVABLE/OTHER 소스가 manual review 처분으로 별도 기록된다
- [ ] 확장 후보(co-cite ≥3 or author ≥3) 중 게이트 미달 항목이 입수되지 않았음을 확인한다

---

## Acceptance Criteria → Step 매핑

| Spec AC | Step | 검증 방법 |
|---|---|---|
| `docs/rules/notebooklm-source-curation.md` 기준표·venue·소급정책·키워드레지스트리·재심사규칙 포함 | 1 | 파일 존재 + 섹션 확인 |
| venue allowlist 파일 repo 존재 (주관기관 메모 포함) | 2 | 파일 존재 + YAML 파싱 + `sponsor_org` 필드 확인 |
| 스킬 입수 게이트 모드: 후보 소스 → 통과/차단 + 사유 | 3 | `gate.py` 직접 실행 |
| 스킬 감사 모드: 노트북 스캔 → 위반 표 → confirm → 삭제 | 3 | `audit.py` dry-run + confirm 흐름 |
| 모든 수치 기준 `SRC_GATE_*` env-var 오버라이드 가능 | 3 | env-var 오버라이드 후 동작 변경 확인 |
| 노트북 ba3b3d80 감사 1회 완료 + 처분 리포트 존재 | 5 | `audit-20260612.md` git canonical 경로 존재 |
| 확장 후보 발굴(co-cite ≥3 / author ≥3)이 동일 게이트 통과 필수 | 3+5 | audit.py 확장 경로 + 감사 실행 결과 |
| 스킬 미러 규칙 준수 (`.claude/` ↔ `.agents/` ↔ `.codex/`) | 4 | `diff` + `ls -la` |

---

## Execution Order

Steps 1 and 2 can be authored in parallel (both are static documents with no mutual dependency).
Step 3 depends on Steps 1 and 2 (skill references both files at runtime).
Step 4 follows Step 3 (mirrors primary skill output).
Step 5 follows Step 4 (requires mirrored, ready-to-run skill).

**Worktree workflow**: 모든 코드·문서 변경은 AGENTS.md 규칙에 따라 전용 worktree에서 진행한다.
`git wt <issue#>` 로 브랜치를 생성하고, `main`에서 직접 브랜치하거나 `git worktree add`를
수동으로 실행하지 않는다.

---

## ADR Distillation Checklist (완료 후 실행)

이 plan이 `archive/`로 이동될 때 아래 cross-cutting 결정을 distill할 것:

| 결정 | 파일 |
|---|---|
| venue 판정 메커니즘: GS Metrics 수동 스냅샷 YAML + repo 커밋 (scholarly scraping 기각) | `docs/decisions/ADR-021-notebooklm-venue-judgment-mechanism.md` |

ADR 포함 필드: Decision, Drivers, Alternatives considered (A/B/C), Why chosen, Consequences, Follow-ups.
