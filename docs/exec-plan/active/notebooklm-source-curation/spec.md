---
slug: notebooklm-source-curation
date: 2026-06-12
author: deep-interview
---

# Deep Interview Spec: NotebookLM 소스 큐레이션 기준 — rule 제정 + 코드 강제

## Metadata
- Interview ID: di-notebooklm-source-curation-20260612
- Rounds: 9 (Round 0 topology + 8 question rounds, --quick)
- Final Ambiguity Score: 5%
- Type: brownfield
- Generated: 2026-06-12
- Threshold: 0.05
- Threshold Source: /Users/beomsu/.claude/settings.json
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.3325 |
| Constraint Clarity | 0.95 | 0.25 | 0.2375 |
| Success Criteria | 0.95 | 0.25 | 0.2375 |
| Context Clarity | 0.95 | 0.15 | 0.1425 |
| **Total Clarity** | | | **0.95** |
| **Ambiguity** | | | **0.05 (5%)** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| rule-doc | active | `docs/rules/notebooklm-source-curation.md` 제정 | 기준표·venue 정의·소급 정책·키워드 레지스트리·재심사 규칙 확정 |
| enforcement-skill | active | skill-creator로 입수 게이트 + 감사 스킬 제작 | 강제 지점·env-var·산출물 확정 |
| implementation-survey | active | 검증 가능 API/도구 조사 | Semantic Scholar 채택, GS Metrics 스냅샷 방식은 plan에서 상세화 |
| filter-current-notebook | active | "요양원 낙상 보호 AI" 노트북 소급 감사·삭제 | 유형별 차등 정책 확정, confirm 후 일괄 삭제 |
| citation-graph-expansion | active | 공통 피인용 논문 + 빈출 저자 수집 기준 | 동일 기준표 통과, 발동 임계 ≥3/≥3 |

## Goal

NotebookLM 노트북에 들어가는 모든 소스에 대한 **입수 기준을 standing rule로 제정**하고
(`docs/rules/`), 이를 **코드로 강제**한다: (1) 입수 게이트 — 소스 추가 전 검증해 미달 차단,
(2) 주기 감사 — 기존 노트북 전수 스캔 → 위반 리포트 → confirm 후 삭제. 강제 로직은
skill-creator로 스킬화하며, 모든 수치 기준은 환경변수로 주입 가능하다. 제정 즉시 현재
노트북("요양원 낙상 보호 AI", ba3b3d80)을 소급 감사한다.

## Constraints (확정 기준표)

### 논문 입수 기준 (전부 env-var, prefix `SRC_GATE_`)
| 구분 | 기준 | env-var (기본값) |
|---|---|---|
| 출간 0–1년 (신간) | 탑티어 venue 게재만으로 통과 (인용 무관) | — |
| 출간 1–3년 | citation ≥ 3 | `SRC_GATE_CIT_1_3Y=3` |
| 출간 4–5년 | citation ≥ 5 | `SRC_GATE_CIT_4_5Y=5` |
| 출간 6년 이상 | citation ≥ 5 | `SRC_GATE_CIT_6Y=5` |
| arXiv-only (미게재 프리프린트) | citation ≥ 50, 연차 무관 | `SRC_GATE_CIT_ARXIV_ONLY=50` |

### Venue 판정 (교수님 방법 — obsidian `좋은-논문을-찾는-방법.md` 기반)
- **Google Scholar Metrics 분야 카테고리 Top-N 진입 = 탑티어.** 기본 N=10
  (`SRC_GATE_VENUE_TOP_N=10`, 노트의 "Top 10에 드는 것은 좋다" 채택).
- 카테고리: CV&PR, AI, Health & Medical Sciences(해당 시) — allowlist 파일에서 조정.
- 예외 venue는 **repo allowlist 파일**로 명시 추가/제외. venue별 주관기관 메모 필드 포함
  (IEEE/ACM 공동 주관 = 신뢰 가산 근거 기록).
- 분야가 학회 중심인지 저널 중심인지 카테고리 선정 시 명시 (낙상 도메인 = CV/AI 학회 +
  의료 저널 혼합).

### 기타 입수 규칙
- 기술 문서 레퍼런스: **공식 출처만** (벤더 공식 페이지/공식 문서 O, 커뮤니티/Reddit X).
- **중복 금지**: DOI > arXiv ID > 정규화 URL 순 동일성 키.
- 논문 URL 우선순위: **실제 PDF web URL > 아카이브/abstract 페이지**.
- 인용 수 조회: Semantic Scholar API (batch endpoint).
- **신간 재심사**: venue만으로 통과한 0–1년 소스는 다음 주기 감사에서 연차 기준으로 자동
  재평가 ("venue 맹신 금지" — 노트 Step 3).
- **수집 키워드 레지스트리**: rule 문서에 노트북별 수집 키워드를 기록·유지. 키워드 신규
  진입 시 Survey/Review 논문 우선 수집 (노트 Step 2).

### 인용 그래프 확장 (citation-graph-expansion)
- 수집 논문 **≥3편이 공통 인용**하는 논문 (`SRC_GATE_COCITE_MIN=3`), **≥3편에 등장**하는
  저자(`SRC_GATE_AUTHOR_MIN=3`)의 논문을 확장 후보로 발굴.
- 확장 후보도 **동일 입수 기준표 통과 필수** (경로만 다르고 기준은 단일).
- 확장 시 저자 소속·이전 연구 이력 확인 단계 포함 (노트 Step 3).

### 소급(감사) 정책 — 유형별 차등
- 논문 → 인용/venue 기준 엄격 적용, 미달 삭제.
- 기술문서/업체 자료 → 공식 출처만 유지 (Reddit 등 커뮤니티 소스 삭제).
- 프리프린트 → arXiv-only ≥50 기준대로, 미달 삭제.
- 절차: 위반 소스 표(소스명/유형/위반 사유/처분) 리포트 → **사용자 confirm 후** 일괄 삭제.

## Non-Goals
- 연구 문서(`docs/research/`)의 인용까지 소급 정리하는 것 — 노트북 소스만 대상.
- NotebookLM 외 다른 지식저장소(DEVONthink, Obsidian)의 큐레이션.
- 읽기 깊이 전략(2편 정독/5–8편 정도 이해/skim)은 rule의 "참고" 섹션으로만 — 강제 대상 아님.

## Acceptance Criteria
- [ ] `docs/rules/notebooklm-source-curation.md`가 위 기준표·venue 정의·소급 정책·키워드
      레지스트리·재심사 규칙을 담고 존재
- [ ] venue allowlist 파일이 repo에 존재 (주관기관 메모 필드 포함)
- [ ] 스킬이 입수 게이트 모드로 후보 소스(논문/기술문서)를 받아 통과/차단 판정 + 사유 출력
- [ ] 스킬이 감사 모드로 노트북 전수 스캔 → 위반 표 리포트 → confirm 후 삭제 실행
- [ ] 모든 수치 기준이 `SRC_GATE_*` 환경변수로 오버라이드 가능 (기본값은 위 표)
- [ ] 현재 노트북(ba3b3d80) 감사 1회 완료 — 위반 소스 처분 리포트 존재
- [ ] 확장 후보 발굴(공통 피인용 ≥3, 빈출 저자 ≥3)이 동일 게이트를 통과해야만 입수됨
- [ ] 스킬 미러 규칙 준수 (`.claude/skills/` ↔ `.agents/skills/` ↔ `.codex/skills/`)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "코드로 강제"가 자명 | 강제 지점이 입수인지 사후인지 물음 | 입수 게이트 + 주기 감사 둘 다 |
| 인용 기준 원문 다의적 | 신간(인용 0)이 전부 차단됨을 지적 | 신간은 venue로 대체 통과 + 차기 감사 재심사 |
| "탑티어"가 자명 | 기계 판정 불가를 지적 | GS Metrics Top-10 + repo allowlist (SJR/CORE안은 교수님 방법으로 대체) |
| 소급 적용이 무해 | 적대 리서치 근거 소스 대량 삭제됨을 반론(contrarian) | 유형별 차등 — 논문 엄격/기술문서 공식성만/커뮤니티 삭제 |
| 확장 소스는 별도 기준 필요할 수도 | 완화/수동 큐 옵션 제시 | 동일 기준표, 발동 임계만 env-var |
| top-20이 기본 | 사용자 노트(교수님 Top 10)와 충돌 발견 | 기본 N=10으로 하향 |

## Technical Context
- NotebookLM MCP: `source_add`/`source_delete(confirm)`/`source_list` 등 — 게이트·감사의
  실행 채널. 노트북 "요양원 낙상 보호 AI" id ba3b3d80-0cec-4c72-8910-2981b523be28 (현 134소스).
- Semantic Scholar batch API — 본 세션에서 28편 인용 수 검증에 사용 완료 (작동 확인).
- skill-creator: `claude-plugins-official/skill-creator` 캐시 존재.
- 스킬 미러: `.claude/skills/` + `.agents/skills/` (+ `.codex/skills/` symlink) — AGENTS.md.
- 사용자 방법론 원전: obsidian `40-Permanent-Notes/좋은-논문을-찾는-방법.md`
  (신동환 교수님 방법, 2025-02-18 작성 / 2026-03-04 수정).
- GS Metrics는 공식 API 없음 — 구현 수단 조사(component 3)에서 스냅샷 vs scholarly 등
  결정은 plan 단계로 위임.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Source | core domain | type(논문/기술문서/프리프린트), DOI/arXivID/URL, venue, year, citations | Notebook에 속함; Gate가 판정 |
| Gate | core domain | 기준표, env-vars, 판정 사유 | Source를 통과/차단; Rule을 구현 |
| Audit | core domain | 주기, 위반 표, 처분 | Notebook을 스캔; Gate 기준 재사용 |
| Rule | supporting | 기준표, 키워드 레지스트리, 소급 정책 | docs/rules/에 존재; Gate/Audit의 근거 |
| VenueAllowlist | supporting | venue명, 주관기관, 포함/제외 | Gate가 참조 |
| ExpansionCandidate | supporting | 발굴 경로(co-cite/author), 임계값 | Gate를 동일 통과해야 Source가 됨 |
| KeywordRegistry | supporting | 노트북별 키워드 목록 | Rule에 기록; 수집 시 갱신 |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 4 (Source, Gate, Audit, Rule) | 4 | - | - | N/A |
| 3 | 5 (+VenueAllowlist) | 1 | 0 | 4 | 80% |
| 6 | 6 (+ExpansionCandidate) | 1 | 0 | 5 | 83% |
| 8 | 7 (+KeywordRegistry) | 1 | 0 | 6 | 86% → 이후 안정 |

## Interview Transcript
<details>
<summary>Q&A 요약 (9 rounds, --quick)</summary>

- **R0 (topology)**: 5컴포넌트(rule/스킬/구현조사/현 노트북 필터링/인용그래프 확장) → "5개 다 맞음"
- **R1**: 강제 지점? → 입수 게이트 + 주기 감사 둘 다
- **R2**: 연차별 기준표 + 신간 처리? → 신간 venue 대체 / 1–3y ≥3 / 4–5y ≥5 / 6y+ ≥5 / arXiv-only ≥50
- **R3**: venue 기계 판정? → 외부 랭킹 + repo allowlist
- **R4 (contrarian)**: 소급 시 적대 리서치 근거 소스 대량 삭제됨 → 유형별 차등 적용
- **R5**: (유저 추가 메시지) 교수님 기준 = GS Metrics → GS Metrics 단독 + allowlist로 venue 재정의
- **R6**: 확장 소스 기준? → 동일 기준표, 발동 임계 ≥3/≥3 env-var
- **R7**: 기본값 패키지 확정? → "일부 수정"
- **R8**: 수정 내용? → obsidian "좋은 논문 찾는 방법" 노트 기반 보강 요청 → 노트 발굴·반영,
  Top-N 기본 10으로 하향 확정
- **병행 유저 지시**: 수집 키워드를 rule에 기록 / 오늘자 OMS 로그(2026-06-12 요양원 낙상
  방지 AI)에 규칙 bullet 캡처
</details>
