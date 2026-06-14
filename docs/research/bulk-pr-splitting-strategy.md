---
slug: bulk-pr-splitting-strategy
title: Bulk PR 분할·사이징·거버넌스 전략 — 리서치
type: research
date: 2026-06-14
author: gobeumsu
status: active
---

# Bulk PR 분할·사이징·거버넌스 전략 — 리서치

## 1. TL;DR

- 분할 기준은 줄 수가 아니라 **"한 PR = 한 가지(one thing)"** — 자기완결적이고 머지 후 시스템이 정상 동작해야 한다.
- 작은 PR의 진짜 이점은 **속도가 아니라 리뷰 품질·결함 검출(오탐 감소)** — merge 속도 가속은 실험적으로 기각됨.
- 참고 repo(oh-my-claudecode)의 비결은 **1 issue → N PR fan-out** + PR 본문에 scope 경계를 명시하는 것.
- 참고 repo는 `.github/workflows/pr-check.yml`로 **사이즈를 소프트 강제**(라벨+코멘트)하며, 그것만으로 중앙값 179줄 문화가 정착됨.
- 우리 repo는 정책이 글로만 존재하고 강제가 없어 **PR #105(+12019줄)**가 리뷰 없이 통과됨 — 갭이 구조적.

---

## 2. 검증된 원칙

adversarial verify 통과분만 수록. 신뢰도는 근거의 독립성·표본 규모·재현성 기준.

| 원칙 | 신뢰도 | 근거 및 출처 |
|------|--------|-------------|
| 100줄이 적정 PR 크기, 1,000줄이면 과대. 리뷰어는 크기만으로 거절 가능. | [HIGH] | Google [eng-practices: small-cls](https://google.github.io/eng-practices/review/developer/small-cls.html); Cisco/SmartBear 연구(2,500건 리뷰, 3.2M LOC) — 400 LOC 초과 시 결함 검출률 저하. [SmartBear Cisco 케이스](https://smartbear.com/resources/case-studies/cisco-systems-collaborator/) |
| 분할 1순위 기준은 **개념적 범위(한 가지)**지 줄 수가 아님. 자기완결적이고 머지 후 시스템 정상 동작해야. | [HIGH] | Google eng-practices; oh-my-claudecode 이슈 #3224 → PR #3225~#3228 실증. [oh-my-claudecode pulls](https://github.com/Yeachan-Heo/oh-my-claudecode/pulls) |
| 변경을 개념 단위로 쪼개면 **오탐(잘못 지적) 감소** — 단 진짜 결함 검출 "수"가 늘지는 않음. | [MEDIUM] | 통제실험 28명, p=0.03, Cliff's δ=0.36. [arXiv 1805.10978](https://arxiv.org/abs/1805.10978) |
| PR 크기는 **merge 속도를 예측하지 못함**(null 결과, GitHub+Gerrit+Phabricator 120만 건). | [MEDIUM] | 따라서 작은 PR을 "속도"로 정당화하지 말 것. [arXiv 2203.05045, MSR 2022](https://arxiv.org/abs/2203.05045) |
| oh-my-claudecode는 **명시적 scope-boundary 분할** — 관련 있지만 별개인 근본원인을 별도 PR로, 분할 근거를 PR 본문에 서술. | [HIGH] | PR #1368(per-session 429) vs #1388(multi-session thundering-herd), 본문에 경계 명시. [PR #1388](https://github.com/Yeachan-Heo/oh-my-claudecode/pull/1388) |

---

## 3. 기각된 통념

adversarial verify에서 0-3 등급으로 죽은 주장 — "이렇게 하지 마라" 경고로 제시.

| 주장 | 등급 | 기각 이유 |
|------|------|----------|
| "리팩터링은 반드시 기능 변경과 분리해야 한다" | 0-3 | Google 원문도 그렇게까지 단정하지 않음; 불가피한 혼합 허용 |
| "vertical/horizontal 분할 같은 정형 기법이 있다" | 0-3 | 과잉 일반화; 실제 repo에서 해당 패턴으로 분류한 사례 없음 |
| "feature-based 분할이 품질 최고" | 0-3 | 비교 실험 없음; 마케팅 용어 수준 |
| "50줄이 최적 / 200줄 미만이면 빨리 머지된다" | 0-3 | Graphite 마케팅 블로그 출처; arXiv 2203.05045 null 결과와 충돌 |
| "10파일 이하여야 리뷰 가능" | 0-3 | 출처 미확인; 파일 수보다 개념 범위가 중요함(원칙 2와 충돌) |
| "200~400줄이 결함 40%↓·3배 빨리 머지된다" | 0-3 | InfoQ 과장; 원 논문의 수치가 아님 |
| "참고 repo가 큰 PR을 체계적으로 거절한다" | 0-3 | 사실 아님. 실제로 87파일·대형 PR도 머지됨. 실제 운용은 '거절'이 아니라 '경고+라벨' 소프트 게이트 |

> **교훈:** 특정 숫자 규칙에 집착 금지. 입증된 범위는 "100~400 LOC + one-thing 원칙"까지.

---

## 4. issue → PR 매핑 패턴

### 4.1 참고 repo: 1 issue → N PR (fan-out)

이슈 본문의 **번호 매긴 결함/항목 리스트 = PR 분할 계약**.

예시 — 이슈 #3224(버그 4개 번들):
1. dispatch 안 뜸
2. harness auto-merge 충돌
3. 빈 final
4. N:agent:role 무성 붕괴

→ fan-out:

| PR | 담당 버그 | 브랜치 |
|----|----------|--------|
| [#3225](https://github.com/Yeachan-Heo/oh-my-claudecode/pulls) | bug#4 | `omc-issue-3224-teams-runtime` |
| [#3226](https://github.com/Yeachan-Heo/oh-my-claudecode/pulls) | bug#2 | `omc-issue-3224-teams-runtime-followup` |
| [#3227](https://github.com/Yeachan-Heo/oh-my-claudecode/pulls) | bug#1 | `omc-issue-3224-dispatch-gap` |
| [#3228](https://github.com/Yeachan-Heo/oh-my-claudecode/pulls) | bug#3 | `omc-issue-3224-terse-finals` |

- **브랜치 규칙:** 이슈# 공유 + 토픽 슬러그로 분기.
- **PR 제목:** conventional-commit + `(#3224)`.
- **PR 본문 scope 경계 예시(#3228):** "Parser(#3225), harness(#3226), dispatch(#3227)는 이미 머지됐고 여기선 안 건드림. 남은 항목만."

### 4.2 우리 repo: 1 issue → 1 branch → 1 PR (1:1:1, 분해 없음)

이슈 #102(에픽: production frontend OAuth+dashboard) → branch `feat/102-...` → PR #105(+12,019/-126, 90 files). 에픽이 통째로 메가 PR.

라벨 체계(`type:/domain:/priority:`)는 오히려 우위이나, 이슈를 에픽으로 끊고 1:1로 PR에 흘려보내는 구조가 문제.

### 4.3 비교 표

| 항목 | 참고 repo (oh-my-claudecode) | 우리 repo |
|------|------------------------------|-----------|
| issue 단위 | 버그 항목 단위 (세분화) | 에픽/기능 단위 (대형) |
| issue → PR 카디널리티 | 1 issue → N PR (fan-out) | 1 issue → 1 PR (1:1:1) |
| 브랜치 | 이슈# 공유 + 토픽 슬러그 분기 | `<type>/<issue#>-<slug>` 단일 |
| PR 본문 | scope 경계 명시 (머지됨/미룸) | 경계 서술 없음 |
| 종료 조건 | 이슈 내 항목 번호 기준 완료 | 이슈 전체 기능 완료 |

---

## 5. 사이즈 실측 데이터

### 5.1 참고 repo 최근 머지 PR 100건

| 지표 | 값 |
|------|---|
| churn(추가+삭제) 중앙값 | 179 |
| churn 최소값 | 3 |
| churn p75 | 403 |
| churn p90 | 640 |
| churn 최대값 | 18,520 |
| 파일 수 중앙값 | 6 |
| 파일 수 p90 | 25 |
| 파일 수 최대값 | 376 |
| churn < 100건 | 29건 (29%) |
| churn < 300건 | 65건 (65%) |
| churn < 500건 | 86건 (86%) |
| churn > 1,000건 | 4건 (4%) |

> 참고: 최대값(18,520)은 아웃라이어. 소프트 게이트만으로도 분포의 86%가 500줄 미만에 수렴.

### 5.2 우리 repo 열린 PR 현황

| PR | 추가/삭제 | 파일 수 | 브랜치 | 설명 |
|----|----------|--------|--------|------|
| #106 | +1,838 / -8 | 17 | feat/100 | 침대 이탈 탐지 page |
| **#105** | **+12,019 / -126** | **90** | feat/102 | production frontend OAuth+dashboard ← **최악** |
| #104 | +688 / -1,024 | 41 | docs/101 | ADR MECE 재편 |
| #103 | +3,130 / -22 | 32 | feat/29 | alert pipeline harden |
| #99 (DRAFT) | +4,576 / -25 | 36 | feat/96 | kakao alert pilot |
| #98 | +1,005 / -15 | 10 | feat/97 | demo UI refactor |

> **한 줄 평:** 우리 PR들은 참고 repo 중앙값(179줄/6파일) 대비 **5~60배** 규모.

---

## 6. 거버넌스 / 강제 레이어

### 6.1 참고 repo가 가진 것

**`.github/workflows/pr-check.yml`**
- size-check: 라벨 자동 부여 — `size/S` ≤100, `size/M` ≤500, `size/L` ≤1,000, `size/XL` >1,000
- >1,000줄이면 자동 "Large PR Alert" 코멘트 게시
- base-branch-check: base가 `dev/main/release/*/hotfix/*` 아니면 **CI 하드 실패**
- draft-check: draft 상태이면 머지 차단

**`.github/workflows/auto-label.yml`**
- 이슈 제목/본문 키워드로 `bug/enhancement/question/documentation/installation/agents` 자동 라벨

**`templates/rules/git-workflow.md`**
- conventional commits + PR 작성 절차 문서화

**에이전트·스킬**
- agents: git-master, code-reviewer, security-reviewer
- skills: release, self-improve, project-session-manager

> **중요 관찰:** 사이즈 게이트는 소프트(라벨+코멘트)인데도 중앙값 179줄 유지 → **넛지만으로 문화 정착** 가능성을 시사.

### 6.2 우리 repo 현황

- `.github/`에 `ISSUE_TEMPLATE/(config.yml, task.yml)`만 존재. **`.github/workflows/` 폴더 자체 없음** → CI 사이즈 강제 = 0.
- `docs/rules/`: `github-labels.md`, `worktree-workflow.md`(ADR-008/016, githooks `assert-not-main`, `git wt <issue#>`, `<type>/<issue#>-<slug>`)
- 스킬 `git-workflow-and-versioning/SKILL.md`에 이미 "~100줄 목표, >1,000줄 분할", "나중에 쪼개겠다 → 제출 전에 쪼개라" 규칙 존재. `code-review-and-quality` 스킬도 보유.
- `size/*` 라벨 없음.

### 6.3 갭 표

| 항목 | 참고 repo | 우리 repo | 상태 |
|------|----------|----------|------|
| 정책 문서 | ✅ | ✅ | 동등 |
| 사이즈 CI 강제 | ✅ (소프트 게이트) | ❌ | **갭** |
| base 브랜치 가드 | ✅ CI 하드 실패 | 로컬 훅만 | 부분 갭 |
| size/* 라벨 | ✅ | ❌ | **갭** |
| 이슈 자동 라벨 | ✅ | 수동(체계는 우위) | 자동화 갭 |
| 이슈 템플릿 | 기본 | ✅ task.yml 우위 | 우리 우위 |
| PR 템플릿 | ✅ | ❌ | **갭** |

> **한 줄 진단:** 우리는 "글로 된 정책 + 빈 강제 = 안 지켜짐". 그래서 #105가 통과됨.

---

## 7. 적용 권고

> **주의:** 이 절은 옵션을 제시하는 것이며, 결정은 인간 몫. "~해야 한다" 대신 "근거상 ~가 권장됨/옵션"으로 표기.

### 7.1 우선순위 옵션 목록

| 옵션 | 우선도 | 비고 |
|------|--------|------|
| `.github/workflows/pr-check.yml` 이식: size 라벨 S/M/L/XL + >1,000 경고, base=main 가드, draft notice | 높음 | 채택 진행 중 — 본 작업에서 추가됨으로 기록 |
| `size/*` 라벨 6종 생성 | 중간 | pr-check.yml 이식과 함께 적용 권장 |
| `.github/PULL_REQUEST_TEMPLATE.md`에 scope-boundary 본문 강제 | 중간 | "이미 머지됨/다음으로 미룸" 필드 포함 |
| 스킬 `git-workflow-and-versioning`에 issue→PR fan-out 섹션 추가 | 낮음 | 현재 스킬은 1:1:1 전제로 작성됨 |

### 7.2 PR #105 구체 분할안 (stacked, 의존 순서)

> 각 PR은 main 빌드를 깨지 않게 자기완결, 본문에 "이미 머지됨/다음으로 미룸" 명시 권장.

| 순서 | 내용 | 포함 ADR 후보 |
|------|------|--------------|
| PR-1 | Prisma schema / migration / seed | ADR-024 |
| PR-2 | auth + hmac.guard | ADR-023 |
| PR-3 | RLS + red-team 테스트 | ADR-022 |
| PR-4 | SSE 전송 | ADR-025 |
| PR-5 | admin UI + alerts 페이지 | — |

### 7.3 머지 전 리뷰 체크리스트 (참고용)

- [ ] 제목을 "그리고" 없이 한 문장으로 쓸 수 있는가?
- [ ] 이 PR만 머지해도 main이 동작하는가?
- [ ] ADR 대상 결정이 PR에 섞여 있는가? (섞였으면 distill 규칙 적용)
- [ ] 테스트가 동봉됐는가?
- [ ] stacked PR이면 base·rebase 처리·독립 테스트 불가 여부가 본문에 명시됐는가?
- [ ] conventional commit + 이슈 링크가 있는가?
- [ ] worktree 규칙(`git wt <issue#>`)이 준수됐는가?

---

## 8. 한계 / 열린 질문

| 질문 | 현재 상태 |
|------|----------|
| 분할이 실제 결함 검출 "률"을 높이는가? | 미해결 — 유일 통제실험(28명)이 표본 부족. 입증된 이점은 오탐 감소까지. |
| merge 속도 null 결과가 엔터프라이즈에도 적용되는가? | 미확인 — 오픈소스 한정 데이터. |
| 단일 feature가 본질적으로 여러 레이어를 요구할 때 최적 분할 기준은? | 미해결 (feature/file/layer 중 최선 불명확). |
| stacked PR을 독립 테스트 불가할 때 리뷰 체크리스트가 어떻게 달라지는가? | 미해결. |
| 참고 repo 관찰 결과의 일반화 가능성은? | 제한적 — 단일 오픈소스 프로젝트. Google eng-practices는 2025-11 read-only 아카이브됐으나 여전히 널리 인용됨. |

---

## 9. 출처

조사 규모: 24개 소스, 94개 주장 추출 → 25개 검증 → 7 확정 / 18 기각.

### Primary (직접 인용, 실험적 근거)

| 출처 | 품질 등급 | 비고 |
|------|----------|------|
| [Google eng-practices: small-cls](https://google.github.io/eng-practices/review/developer/small-cls.html) | ★★★ | 2025-11 read-only 아카이브; 여전히 업계 표준 인용 |
| [arXiv 1805.10978](https://arxiv.org/abs/1805.10978) | ★★★ | 통제실험; n=28, p=0.03 |
| [arXiv 2203.05045 (MSR 2022)](https://arxiv.org/abs/2203.05045) | ★★★ | 120만 PR, null 결과 |
| [oh-my-claudecode PR #1388](https://github.com/Yeachan-Heo/oh-my-claudecode/pull/1388) | ★★★ | scope-boundary 실증 |
| [oh-my-claudecode pulls (fan-out 패턴)](https://github.com/Yeachan-Heo/oh-my-claudecode/pulls) | ★★★ | PR #3225~#3228 관찰 |

### Secondary (간접 참조, 케이스 스터디)

| 출처 | 품질 등급 | 비고 |
|------|----------|------|
| [SmartBear/Cisco Collaborator case study](https://smartbear.com/resources/case-studies/cisco-systems-collaborator/) | ★★☆ | 2,500건 리뷰; 400 LOC 기준 |
| InfoQ PR 사이즈 기사 | ★☆☆ | 일부 수치 과장 확인됨 (7절 기각 목록 참고) |

### Blog (주의: 일부 주장 기각됨)

| 출처 | 품질 등급 | 비고 |
|------|----------|------|
| Graphite PR size 블로그 | ★☆☆ | "50줄 최적", "200줄 미만 빠른 머지" 주장 기각 |
| thedroidsonroids 등 | ★☆☆ | vertical/horizontal 분할 기법 주장 기각 |
