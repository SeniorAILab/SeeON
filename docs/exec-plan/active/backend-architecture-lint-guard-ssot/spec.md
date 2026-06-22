---
slug: backend-architecture-lint-guard-ssot
status: active
date: 2026-06-22
author: gjc
issue: 305
kind: spec
source: deep-interview (ambiguity 7.2%)
---

# Deep Interview Spec: 백엔드 계층/DTO ESLint 강제 + SSOT guard 스크립트 (전 벤더 hook convention)

## Metadata
- Interview ID: 5C4AC662-7F5C-4E68-B73C-0C01B38B41E8
- Rounds: 9 (Round 0 topology + Rounds 1–8)
- Final Ambiguity Score: 7.2%
- Type: brownfield
- Generated: 2026-06-21
- Threshold: 0.05
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED (all dimensions ≥0.9; 잔여 ~7%는 사용자 결정이 아닌 구현 granularity 사실 항목 → ralplan/execution에서 확정. "all-dimensions 0.9+" 규칙으로 크리스탈라이즈)
- Auto-Researched Rounds: []
- Auto-Answered Rounds: []
- Architect Failures: 0
- Lateral Reviews: 1 (Round 1, milestone initial→progress, personas: researcher/contrarian/simplifier)
- Lateral Panel Failures: 0
- Refined Rounds: [1]
- Closure Overrides: none
- Restated Goal: (아래 ## Goal 참조 — Phase 4b에서 사용자 "예, 크리스탈라이즈" 확인)

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.93 | 0.35 | 0.327 |
| Constraint Clarity | 0.93 | 0.25 | 0.232 |
| Success Criteria | 0.92 | 0.25 | 0.229 |
| Context Clarity | 0.93 | 0.15 | 0.139 |
| **Total Clarity** | | | **0.928** |
| **Ambiguity** | | | **0.072** |

## Topology
| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| ESLint 아키텍처 규칙 | active | controller/repository/service/DTO import 경계 + 선별 typed 규칙 | AC1–AC4, AC9 |
| Guard 스크립트(hook) | active | scripts/backend-guard/ 단일소스: schema↔migration coupling, 좁은 tenant direct-access(AST) | AC5–AC6 |
| 강제 배선(enforcement wiring) | active | ESLint=editor+CI lint:check / pre-commit=schema↔migration / 전 벤더 SSOT 호출 | AC7–AC8, AC10–AC11 |
| DTO 배치/표준화 | active | 도메인 dto/*.dto.ts 위치 강제 + 인라인 *Dto 금지(warn), 레이아웃 통일 안 함 | AC4 |
| Nest 런타임 가드(ValidationPipe) | deferred | 전역 ValidationPipe + class-validator/transformer | 사용자 확정 보류 (Round 0): 런타임 동작 변경 + 신규 의존성이라 이번 lint/hook 범위에서 제외 |

## Established Facts
| ID | Fact | Source Round |
|----|------|--------------|
| F1 | 위반 가능 규칙은 per-file 예외/ignores 없이 전체 파일에 적용, warn으로 시작 후 error 승격 | 1 (refined) — *F18로 정제됨(pre-commit/PreToolUse warn-tier 부분)* |
| F2 | 기존 위반 0인 규칙(controller→repo/prisma 금지)도 처음엔 warn으로 통일 | 1 |
| F3 | guard 스크립트는 check-freshness.sh warn 패턴(출력만,exit0=비차단)로 시작, 추후 enforce | 1 |
| F4 | CI에 backend lint 추가하되 warn은 CI를 깨지 않음(켜되 비차단) | 1 |
| F5 | DTO는 도메인 폴더 dto/*.dto.ts 에 배치 | 0 |
| F6 | 설정/스크립트에 한글 주석 작성 | 0 |
| F7 | 컴포넌트5 전역 ValidationPipe는 보류 | 0 |
| F8 | lint vs script 분담=ESLint-first. ESLint=import 경계+인라인 DTO. scripts=ESLint 불가 2개(schema↔migration, 좁은 tenant AST). module-export·종합 architecture·레이아웃 통일은 제외(추후) | 2 |
| F9 | DTO 표준화 범위=위치 강제+인라인 *Dto 금지(warn)만. 레이아웃 통일 안 함. 기존 인라인 DTO(residents/cameras/guardians)는 warn 노출, 즉시 마이그레이션 안 함 | 2 |
| F10 | PrismaService가 TENANT_MODELS에 대해 withFacilityContext 없으면 MissingTenantContextError로 fail-closed(런타임 SoT). 정적 tenant guard는 직접 prisma.db.<tenantModel> 접근 패턴만 좁게 warn | 2 |
| F11 | backend lint는 --fix(mutating)라 guard/CI warn용 부적합 → 비차단 lint:check 분리, guard는 eslint 재구현 말고 호출 | 2 |
| F12 | ESLint 엔진=내장 no-restricted-imports + no-restricted-syntax(신규 의존성 0, '.js' suffix 패턴 인코딩) | 3 |
| F13 | guard 언어=POSIX sh 래퍼 + Node .mjs AST 체커(단일소스+AST정확도, 한글 warn 메시지) | 3 |
| F14 | 디렉터리=scripts/backend-guard/ (git-guard 형제, lib.sh 헬퍼 재사용 가능) | 3 |
| F15 | 비차단 lint:check 스크립트 분리(eslint --no-fix), 기존 lint(--fix)는 dev용 유지 | 3 |
| F16 | 배선=PreToolUse+pre-commit+CI 셋 다(warn 비차단) | 4 — *F18로 정제됨(warn-tier hook 부분 철회)* |
| F17 | 심각도=전 파일 warn 고정, error 승격은 나중. ratchet 도전 기각 | 4 |
| F18 | [충돌해소 C] ESLint 아키텍처 규칙=일반 lint만(에디터 전벤더+CI lint:check warn 비차단). git pre-commit=ESLint 불가 계약성 검사(schema↔migration coupling)만. tenant AST guard=CI lint:check warn(pre-commit 미포함). 전 벤더(Codex/GJC/Claude)는 동일 SSOT 스크립트 호출. warn 가시성은 ESLint로 항상 달성 | 6 |
| F19 | SSOT/멀티벤더는 ADR-008 재확인. GJC는 .claude/settings.json·.codex 설정을 읽어 3-레이어(.githooks+Claude+Codex)가 GJC까지 커버(정확한 실행경로는 구현 시 확정). git-native pre-commit=벤더무관 1차 게이트 | 6 |
| F20 | CI backend lint는 ADR-016 'test/lint CI는 무관·허용'에 부합(=convention CI 아님) → 허용 | 6 |
| F21 | convention 산출물=새 ADR(backend)+docs/rules/ 항목+scripts/backend-guard/README(한글)+AGENTS.md 라우팅 1줄+setup-hooks.sh에 backend-guard chmod 등록 | 7 |
| F22 | ESLint 추가 typed 규칙=consistent-type-imports/no-misused-promises/require-await/no-unnecessary-condition/no-explicit-any 5개 모두 warn(F2 일관). 기존 안정성 deny-list는 error 유지 | 8 |
| F23 | 잔여 모호도(~7%)는 구현 granularity(TENANT_MODELS 목록=PrismaService에서 도출, coupling 트리거 규칙, .js suffix 패턴)이며 사실/구현 항목 → ralplan/execution에서 확정 | 8 |

## Trigger Metadata
| Round | Trigger | Status | Affected | Prior→New Ambiguity | Evidence |
|-------|---------|--------|----------|---------------------|----------|
| 6 | A direct contradiction | resolved | enforcement-wiring / constraints | 16% → (peak 30%) → 12.5% | F16/F17의 warn-tier hook이 accepted ADR-016("reversible convention에 warn-tier hook 금지")과 충돌. contradicted_established_fact: ADR-016. 옵션 C(절충)로 해소 → ESLint는 일반 lint, pre-commit엔 계약성 검사만. |

다른 라운드(1–5, 7–8)는 트리거 없음(ambiguity 단조 하강).

## Lateral Review Panel
| Round | Trigger | Personas | Findings folded |
|-------|---------|----------|-----------------|
| 1 | milestone initial→progress | researcher, contrarian, simplifier | ① ESLint-first: import 경계+inline DTO는 lint, 스크립트는 ESLint 불가 항목만 ② PrismaService 런타임 tenant guard(TENANT_MODELS/$allOperations fail-closed) 존재 → 정적 tenant guard는 좁게 ③ backend lint --fix(mutating) → 비차단 lint:check 분리 ④ MVP: ESLint 2종 + script 2종, module-export·종합 architecture·레이아웃 통일 제외. contrarian의 ratchet(신규파일 error) 도전은 Round 4에서 사용자가 기각. |

Lateral Panel Failures: 0.

## Goal
백엔드(NestJS) 계층 경계(controller→service→repository, service→port/adapter)와 DTO 경계를 **신규 의존성 없는 내장 ESLint 규칙**(import 경계·인라인 DTO 금지 + 선별 typed 규칙, **전부 warn-first·예외 없이**, **도메인 `dto/` 폴더 기준**)으로 잡고, **ESLint로 불가능한 검사**(schema↔migration coupling = git pre-commit, 좁은 tenant direct-access = CI)만 `scripts/backend-guard/` **단일소스 스크립트**(POSIX sh 래퍼 + Node `.mjs` AST 체커, **한글 주석**)로 두어, **Codex·GJC·Claude Code 전 벤더와 CI가 동일 소스를 호출**하게 하고(ADR-008 SSOT 패턴 재확인, **ADR-016 warn-tier hook 금지 준수**), 이를 **ADR + `docs/rules/` + README + AGENTS.md로 convention으로 명문화**한다. 전역 ValidationPipe(+ class-validator/transformer)는 이번 범위에서 **보류**.

## Constraints
- **신규 의존성 0**: ESLint 엔진은 내장 `no-restricted-imports` + `no-restricted-syntax`만. `eslint-plugin-boundaries`/`eslint-import-resolver-typescript`는 도입하지 않는다(NodeNext `.js` import 패턴은 규칙 패턴에 직접 인코딩).
- **warn-first, 예외 없음**: 새 아키텍처/DTO/typed 규칙은 전부 `warn`. per-file `ignores`/예외 등록 금지 — 기존 위반 파일(예: `cameras.service.ts`/`residents.service.ts`/`guardians.service.ts` 인라인 DTO, `cameras.service.ts` PrismaService 직접 주입)도 숨기지 않고 계속 warn으로 노출한다. error/reject 승격은 나중 단계.
- **기존 안정성 deny-list는 error 유지**: `no-floating-promises`, `only-throw-error`, `prefer-promise-reject-errors`, `switch-exhaustiveness-check`, `no-non-null-assertion`(+ prettier)은 현행 `error` 그대로.
- **ADR-016 준수**: 되돌릴 수 있는 backend 계층 convention에 대해 **git pre-commit/agent PreToolUse warn-tier를 만들지 않는다**. warn 가시성은 ESLint(에디터 전 벤더 + CI `lint:check`)로 달성. `git pre-commit`에는 ESLint로 불가능한 **계약성 검사(schema↔migration coupling)** 만 둔다. 좁은 tenant direct-access guard는 **CI `lint:check` warn**으로만(되돌릴 수 있어 pre-commit 미포함).
- **단일소스(ADR-008) 재확인**: 모든 guard 로직은 `scripts/backend-guard/` 한 곳. 어느 레이어/벤더도 재구현하지 않고 invoke만. POSIX sh 래퍼가 Node `.mjs` AST 체커를 호출.
- **전 벤더 동일 소스**: Codex(`.codex/config.toml`)·Claude(`.claude/settings.json`)·GJC(Claude/Codex 설정을 읽음)·CI·`.githooks`가 동일 `scripts/backend-guard/` entrypoint를 호출. git-native pre-commit이 벤더 무관 1차 게이트.
- **비차단 lint 분리**: `lint`(`--fix`, dev용)은 유지하고, 별도 비차단 `lint:check`(`eslint`, no `--fix`)를 만들어 guard/CI가 호출. guard 스크립트는 eslint 로직을 재구현하지 않는다.
- **DTO**: 요청 DTO는 도메인 `<domain>/dto/*.dto.ts`에 둔다. controller/service 내부의 인라인 `*Dto` 선언은 `no-restricted-syntax`로 warn. 평면형↔중첩형 폴더 레이아웃은 **통일하지 않는다**(churn 회피, suffix/import 방향만으로 경계 확보).
- **tenant 정적 guard는 좁게**: PrismaService 런타임 가드(TENANT_MODELS + `withFacilityContext()` fail-closed)가 SoT. 정적 검사는 직접 `prisma.db.<tenantModel>` 접근/`PrismaService` 부적절 사용 패턴만 좁게 warn(넓은 금지는 auth/session/ingest 정상 경로 오탐).
- **한글 주석**: 새 ESLint override·guard 스크립트·README의 설명 주석은 한국어로 작성.

## Non-Goals
- 전역 `ValidationPipe` 도입 및 `class-validator`/`class-transformer` 의존성 추가 (보류).
- `module export guard`(Nest `@Module({exports})` 메타데이터 검증) — 이번 제외(합법적 service export 多).
- 종합 architecture import guard 스크립트 — ESLint가 대체하므로 제외.
- 평면형/중첩형 모듈 레이아웃 **물리 통일/대량 이동** — 제외(churn).
- 기존 위반 코드의 **즉시 리팩터/마이그레이션** — 제외(warn으로 노출만, 추후 backlog).
- ESLint 규칙의 **즉시 error/reject 전면화** — 제외(warn-first, 나중 승격).
- `global prefix`(`setGlobalPrefix('api')`) 정리 등 라우팅 변경 — 제외(ADR-046 소관, front path 영향).

## Acceptance Criteria
- [ ] AC1 `*.controller.ts`/`controllers/**`에서 `*.repository(.js)`·`prisma.service(.js)`·`@prisma/client`·`adapters/**` import 시 ESLint **warn** 출력(NodeNext `.js` suffix 패턴 포함).
- [ ] AC2 `*.repository.ts`/`repositories/**`에서 `@nestjs/common`의 HTTP 예외(BadRequest/NotFound/Conflict 등) 및 `*.service`/`*.controller`/`adapters/**` import 시 ESLint **warn**.
- [ ] AC3 `*.service.ts`/`services/**`에서 concrete `adapters/**` import 시 ESLint **warn**(port/token 의존 유도).
- [ ] AC4 controller/service 내부 `export interface|type *Dto` 선언 시 `no-restricted-syntax` **warn**; 도메인 `dto/*.dto.ts`는 허용. 기존 인라인 DTO(`residents`/`cameras`/`guardians`)에서 warn이 실제 출력됨.
- [ ] AC5 `scripts/backend-guard/`의 schema↔migration coupling 검사: `backend/prisma/schema.prisma`가 변경됐는데 `backend/prisma/migrations/**/migration.sql` 변경이 없으면 메시지 출력(git diff 기반). git `pre-commit` + CI에서 호출.
- [ ] AC6 `scripts/backend-guard/`의 좁은 tenant direct-access 검사(Node `.mjs` AST): repository/service에서 `prisma.db.<tenantModel>` 직접 접근/부적절 PrismaService 사용 위험 패턴에 **warn**, 정상 코드(auth/session/ingest/비-tenant 경로)에는 침묵. CI `lint:check` 경로에서 warn(비차단).
- [ ] AC7 `backend/package.json`에 비차단 `lint:check`(eslint, no `--fix`) 스크립트 추가; 기존 `lint`(`--fix`)는 dev용 유지. guard 스크립트는 `lint:check`/eslint를 호출하고 로직을 재구현하지 않음.
- [ ] AC8 `.github/workflows/ci.yml` backend job에 lint(`lint:check`) + `scripts/backend-guard` 호출 스텝 추가, **warn이라 job은 green 유지**(기존 typecheck/build/test 여전히 통과). 위치는 typecheck 전후로 빠른 피드백.
- [ ] AC9 새 ESLint 규칙은 전부 `warn`(F2 일관), 기존 안정성 deny-list는 `error` 유지; `pnpm --filter backend lint:check`가 전체에서 돌고 known 위반에서 warn을 출력하되 exit 0(비차단).
- [ ] AC10 전 벤더 단일소스 배선: `.githooks/pre-commit`(schema↔migration), `.codex/config.toml`/`.claude/settings.json`이 동일 `scripts/backend-guard/` entrypoint를 호출(GJC는 Claude/Codex 설정 경유). 복제 로직 없음(ADR-008). `setup-hooks.sh`에 backend-guard 스크립트 chmod 등록 추가.
- [ ] AC11 convention 명문화: 새 backend ADR(ADR-046 강제 레이어 + ADR-008 재확인 + ADR-016 경계 명시) + `docs/rules/` 항목(scripts/backend-guard 호출법·규칙·제외) + `scripts/backend-guard/README.md`(한글) + `AGENTS.md` Conventions 라우팅 1줄.
- [ ] AC12 새/수정 ESLint override·guard 스크립트·README의 설명 주석이 한국어로 작성됨.

## Deferrals
- **컴포넌트(사용자 확정)**: Nest 런타임 가드(전역 ValidationPipe + class-validator/transformer) — Round 0에서 보류 확정(런타임 동작 변경 + 신규 의존성). 확인 시각은 state `topology.deferrals` 참조.
- **Convergence Pacing**: min-round floor / score-drop cap / confidence dampening 없음 — bidirectional 스코어링이 pacing 메커니즘.
- **구현 granularity(ralplan/execution에서 확정)**: 정확한 TENANT_MODELS 목록(PrismaService 정의에서 도출), schema↔migration coupling 트리거 정밀 규칙, no-restricted-imports `.js` suffix 정확 패턴, GJC가 `.claude/settings.json` PreToolUse 배열을 실행하는지 vs `.claude/hooks/pre/*.sh` 파일 기반인지의 정확한 실행 경로.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 4종 guard 스크립트 + 종합 architecture guard 필요(원안) | lateral 패널: import 경계는 ESLint가 더 정확, 스크립트는 ESLint 불가 항목만 | ESLint-first; 스크립트는 schema↔migration + 좁은 tenant 2종만(F8) |
| 넓은 tenant guard(PrismaService 주입/db 접근 금지) | PrismaService가 이미 런타임 fail-closed; 넓은 금지는 정상 경로 오탐 | 정적 guard는 tenant model 직접 접근 패턴만 좁게 warn(F10) |
| 예외 없이 warn을 pre-commit/PreToolUse/CI 셋 다(F16/F17) | accepted ADR-016: reversible convention에 warn-tier hook 금지(warn 스팸 무뎌짐) | 옵션 C: ESLint=일반 lint(editor+CI), pre-commit=계약성 검사만, warn은 ESLint로 달성(F18) |
| 평면형/중첩형 레이아웃 통일 | churn 크고 경계는 suffix/import로 확보 가능 | 레이아웃 통일 제외, DTO 위치+인라인 금지만(F9) |
| 기존 lint(`--fix`)를 CI/guard에 사용 | `--fix`는 mutating이라 CI/warn-mode 부적합 | 비차단 `lint:check` 분리(F11/F15) |
| no-restricted-imports로 충분 vs eslint-plugin-boundaries | 후자는 표현력↑이나 의존성+resolver 필요 | MVP는 내장 no-restricted-imports(신규 의존성 0)(F12) |

## Technical Context
- **ESLint**: `backend/eslint.config.mjs` flat config(typescript-eslint `recommendedTypeChecked` + prettier + 안정성 deny-list). 아키텍처/계층 import 규칙은 부재. `projectService: true` typed lint 활성.
- **모듈 레이아웃 이중 공존**: 중첩형(`zones/spaces/floors/facilities/resident-assignments`: `controllers/ services/ repositories/ dto/`) vs 평면형(`residents/cameras/guardians/status`, alerts 부분: `*.controller.ts`/`*.service.ts`/`*.repository.ts`). DTO 규약은 이미 `<domain>/dto/*.dto.ts`(예 `zones/dto/zone.dto.ts`). `residents.service.ts`/`cameras.service.ts`/`guardians.service.ts`에 인라인 `*Dto` interface 잔존.
- **ports/adapters**: `alerts/ports/(channel|prediction).port.ts` + `alerts/adapters/*.adapter.ts`(ADR-046 패턴 모범).
- **Prisma/tenant**: `prisma.service.ts`가 `TENANT_MODELS`에 대해 `$allOperations`에서 `MissingTenantContextError` fail-closed, `withFacilityContext()`가 `SET LOCAL app.facility_id` 트랜잭션 보장. NodeNext: 소스가 `'../foo.repository.js'` 형태로 import.
- **hook SSOT(ADR-008/016)**: `scripts/git-guard/lib.sh`(`gg_warn`/`gg_die`/`gg_is_protected`) = 모든 레이어의 단일소스. `.githooks/pre-commit`·`pre-push`(core.hooksPath, 벤더무관 1차 게이트), `.claude/settings.json`(SessionStart+PreToolUse Edit/Write/Bash), `.codex/config.toml [hooks] pre_tool_use`(shell-scoped)가 동일 스크립트 호출. ADR-016: irreversible(asset upload)만 4지점 block, reversible convention은 warn-tier hook 금지·audit-tier(단 test/lint CI는 허용).
- **CI**: `.github/workflows/ci.yml` backend job = `check-migrations.sh` → install → prisma generate → migrate deploy → **typecheck → build → test**(lint 없음). frontend job은 lint 있음. path-filtered, `ci-gate`가 단일 required check.
- **ADR-046**(backend, accepted): controller=transport adapter, service=orchestration/policy/ports, repository=persistence, DTO=HTTP shape(persistence/policy 금지), adapter=port. 이 작업은 ADR-046의 **자동 강제 레이어**.
- **gjc CLI**: `gjc deep-interview`, `gjc state` (session-scoped `.gjc/_session-*/`).

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Lint Rule | core domain | severity(warn/error), scope(file glob), message | enforces Layer Boundary; forbids inline DTO |
| Guard Script | core domain | mode(warn/enforce), target(staged/full), check | invoked by Hook Actor(single source) |
| Hook Actor | external system | .githooks(git-native), Claude settings.json, Codex config.toml, GJC, CI | invokes Guard Script |
| Layer Boundary | supporting | controller, service, repository, port/adapter | enforced by Lint Rule (ADR-046) |
| DTO | supporting | dto/*.dto.ts, class/interface | located in domain dto/ folder |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 5 | 0 | 0 | 5 | 100% |
| 3 | 5 | 0 | 0 | 5 | 100% |
| 4 | 5 | 0 | 0 | 5 | 100% |
| 6 | 5 | 0 | 0 | 5 | 100% |
| 7 | 5 | 0 | 0 | 5 | 100% |
| 8 | 5 | 0 | 0 | 5 | 100% |

도메인 모델은 Round 1에서 확립 후 전 라운드 안정(이 작업은 도구/강제 레이어라 엔티티 변동 없음).

## Interview Transcript
<details>
<summary>Full Q&A (Round 0 + 8 rounds)</summary>

### Round 0 — Topology
**Q:** 5개 상위 컴포넌트(ESLint 규칙 / Guard 스크립트 / 강제 배선 / DTO 배치 / Nest 런타임 가드) 맞나?
**A:** 1~4만 진행, 5(런타임 ValidationPipe) 보류.

### Round 1 — enforcement-wiring / Constraints
**Q:** 기존 위반 규칙을 어떻게 강제? (예외+ignores / 전면 error / warn / 전면 리팩터)
**A:** (free-text→refined) 예외 없이 warn으로 시작, 나중에 reject로 올려도 계속 warn으로 "고쳐야 한다" 노출. → Refine 확인 ⓐ 위반 0 규칙도 warn 통일 ⓑ guard는 warn 모드(비차단) ⓒ CI lint는 켜되 비차단. 전부 수용.
**Ambiguity:** 100% → 40%
*(Lateral panel: initial→progress, researcher/contrarian/simplifier)*

### Round 2 — guard-scripts / Constraints
**Q:** lint가 잡는 것 vs scripts가 잡는 것 분담?
**A:** ESLint-first — import 경계+인라인 DTO는 ESLint, scripts는 ESLint 불가 2개(schema↔migration coupling + 좁은 tenant AST). module-export·종합 architecture·레이아웃 통일 제외.
**Ambiguity:** 40% → 26%

### Round 3 — eslint-rules / Constraints (구현 형태)
**Q:** 엔진·언어·디렉터리·lint 명령?
**A:** 번들 A — 내장 no-restricted-imports/syntax + POSIX sh 래퍼+Node .mjs AST + scripts/backend-guard/ + 비차단 lint:check 분리.
**Ambiguity:** 26% → 21%

### Round 4 — enforcement-wiring / Constraints (배선+심각도)
**Q:** 어디에 꽂고, warn 고정 vs ratchet?
**A:** A — PreToolUse+pre-commit+CI 셋 다(warn 비차단), 전 파일 warn 고정, ratchet 기각.
**Ambiguity:** 21% → 16%

### Round 5 — Success Criteria (acceptance)
**Q:** "됐다"를 무엇으로 검증?
**A:** A — lint:check가 known 위반에서 warn·비차단 / guard 2종이 위반 샘플 warn·정상 침묵 / 3경로 동일 entrypoint / 기존 CI green.

### Round 6 — enforcement-wiring / Constraints (ADR-016 충돌 해소)
**Q:** (조사로 trigger A 발견) SSOT/전벤더는 ADR-008과 일치하나 F16/F17의 warn-tier hook이 ADR-016("reversible convention에 warn-tier hook 금지")과 충돌. 해소?
**A:** C 절충 — ESLint=일반 lint(editor+CI), pre-commit=계약성 검사(schema↔migration)만, tenant AST=CI warn, 전 벤더 동일 SSOT 호출. 두 ADR 모두 존중.
**Ambiguity:** 16% → (peak 30%) → 12.5%

### Round 7 — enforcement-wiring / Criteria (convention 산출물)
**Q:** 어떤 문서 산출물로 convention 명문화?
**A:** A — 새 ADR(backend) + docs/rules/ + scripts/backend-guard/README(한글) + AGENTS.md 라우팅 1줄 + setup-hooks.sh chmod 등록.
**Ambiguity:** 12.5% → 9%

### Round 8 — eslint-rules / Criteria (추가 typed 규칙)
**Q:** 플랜의 선별 typed 규칙 포함?
**A:** A — consistent-type-imports/no-misused-promises/require-await/no-unnecessary-condition/no-explicit-any 5개 모두 warn(F2 일관), 기존 deny-list는 error 유지.
**Ambiguity:** 9% → 7.2%

### Phase 4b — Restate Gate
**Q:** 한 문장 목표 확인?
**A:** "예, 크리스탈라이즈."

</details>
