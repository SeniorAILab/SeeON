---
title: 코드 레벨 안정성(가짜 fallback 금지·명시적 거절·중복 금지) — 빅테크/구루의 강제 방식
slug: code-stability-enforcement-practices
type: research
status: active
date: 2026-06-10
author: gobeumsu (deep-research wf_f3efc759-85a)
grounds_on:
  - deep-research workflow wf_f3efc759-85a (105 agents, 23 sources, 111 claims → 3-vote adversarial → 11 confirmed / 14 killed)
related: [per-frame-vs-temporal-fall-judgment]
---

# 코드 레벨 안정성 강제 — 다른 사람들은 어떻게 하나

> research 문서. "fail-fast / 가짜 fallback 금지 / 명시적 거절 / 중복 로직 금지"를
> 최상위 엔지니어링 조직과 권위자들이 **어떤 원칙으로, 어떤 강제 가능한 artifact로**
> (스타일 가이드, 어서션 규칙, 린트/CI 게이트, AI-에이전트 규칙 파일) 운영하는지 정리한다.
> 3표 적대검증(2/3 반박 시 탈락)을 통과한 주장만 본문에 남겼고, 탈락한 주장은 §6에 명시한다.
> 이 문서는 사실과 비교만 제시한다 — 결정(ADR)은 별도.

## 0. 한 줄 요약

검증을 통과한 권위 소스들(NASA/JPL Power of Ten, TigerBeetle Tiger Style)은 한 방향으로 수렴한다:
**silent continuation(조용히 계속 진행)은 유효한 에러 처리 전략이 아니며**, 이를 "조언"이 아니라
**측정·감사 가능한 수치 기준**(함수당 어서션 밀도, 반환값 전수 검사, 자원 상한)으로 강제한다.
강제 가능해야 규칙이고, 측정 불가능하면 권고에 그친다는 것이 공통 패턴이다.

## 1. Tiger Style (TigerBeetle) — "corrupt code의 유일한 올바른 처리는 crash" [high]

- 런타임 자기검증(self-verification)이 의무: 어서션이 **모든 로직과 상태를 실행 중에 검사**하고,
  불변식 위반이 감지되면 통제된 셧다운이 정답이다. 원문: *"The only correct way to handle corrupt
  code is to crash"*, *"No silent failures permitted."* 이를 "재앙적 correctness 버그를 liveness
  버그로 강등(downgrade)시키는 것"이라고 표현한다 — 죽는 것이 틀린 답을 내는 것보다 낫다는 뜻.
- 어서션은 **프로덕션에서도 켜 둔다** (테스트 전용이 아님). 함수당 최소 2개 어서션이 표준에 명시.
- 검증 3-0 통과. 출처: [tigerstyle.dev](https://tigerstyle.dev/),
  [TIGER_STYLE.md](https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/TIGER_STYLE.md) (1차 출처, 활발히 유지).

**모든 것에 상한(bound)** [high]: 자원·동시성·실행 경로를 전부 명시적으로 bound한다. 원문:
*"Put a limit on everything because everything has a limit... Bound loops and queues to detect
infinite loops and latency spikes."* 무한 루프·큐 폭주를 "런타임 변동성"이 아니라 **감지 가능한
에러 조건**으로 취급 — bound 자체가 fail-fast 트립와이어다. (3-0)

## 2. NASA/JPL Power of Ten — silent discard를 규칙 위반으로 정의 [high]

Holzmann의 2006 IEEE Computer 원문(doi:10.1109/MC.2006.212) 기준:

- **Rule 7 — 반환값·파라미터 전수 검사**: *"Each calling function must check the return value of
  nonvoid functions, and each called function must check the validity of all parameters provided
  by the caller."* 유일한 예외는 명시적 `(void)` 캐스트 — **의도적 폐기를 눈에 보이게 표시**하는
  장치다. 즉 "조용한/우발적 무시"와 "의식적 opt-out"을 구문 수준에서 구별하게 만들고, 전자는 규칙
  위반이다. (3개 독립 derivation 모두 3-0)
- **Rule 5 — 어서션 밀도 하한**: 코드베이스 평균 **함수당 최소 2개 어서션** (per-function 하드
  플로어가 아니라 codebase average floor임에 주의 — 이 뉘앙스를 틀린 주장은 검증에서 탈락했다).
  어서션이 발화하면 **명시적 복구 행동**(예: 호출자에게 에러 조건 반환)이 의무 — 조용한 계속 진행
  금지. fail-fast를 **측정·감사 가능한 표준**으로 인코딩한 사례.
- 출처: [P10.pdf 원문](https://spinroot.com/gerard/pdf/P10.pdf),
  [umich 사본](https://web.eecs.umich.edu/~imarkov/10rules.pdf),
  [Wikipedia](https://en.wikipedia.org/wiki/The_Power_of_10:_Rules_for_Developing_Safety-Critical_Code).

## 3. ML 시스템의 silent failure — 코드 어서션과 구조적으로 다른 범주 [medium]

- AI/ML 시스템의 **silent failure**는 별개 신뢰성 범주다: 예외도, crash도, 에러 코드도 없이
  **자신감 있게 틀린 출력**을 내는 실패. 기존 코드 레벨 어서션 게이트로는 잡히지 않아 **전용 런타임
  모니터**가 필요하다.
- 근거: FAME 런타임 모니터가 자율주행 인지 시스템(YOLOv4)의 silent failure 31건 중 29건(93.5%)
  감지 — 해당 실패들은 표준 운영 중 어떤 감지 가능한 에러 신호도 내지 않았다.
  ([arXiv:2510.22224](https://arxiv.org/pdf/2510.22224), IEEE Reliability Magazine 2025-12 게재)
- **일반화 한계 (medium인 이유)**: CARLA 시뮬레이터 한정, 표본 31건, 경쟁 모니터와 비교 없음.
  "silent DNN failure가 코드 예외와 구조적으로 다른 감지 레이어를 요구한다"는 범주 주장은 유효하나
  수치의 프로덕션 일반화는 불가.
- **본 프로젝트 함의(사실 차원)**: 낙상 감지에서 "모델이 돌긴 도는데 낙상을 못 본다"는 실패는
  bare-except 금지 같은 코드 규칙만으로는 안 잡힌다는 뜻 — 코드 레벨 게이트와 추론 품질 모니터는
  별개 레이어다.

## 4. LLM 코딩 에이전트 — 같은 fail-silent 병리, CLAUDE.md로의 인코딩 [high]

- Karpathy(2026-01-26, X, 14M+ 조회): *"The models make wrong assumptions on your behalf and just
  run along with them without checking. They don't manage their confusion, don't seek
  clarifications, don't surface inconsistencies, don't present tradeoffs, don't push back when
  they should."* — LLM 에이전트가 안전-critical 표준이 금지하는 것과 **동일한 fail-silent 병리**
  (틀린 가정을 조용히 채택하고 진행)를 보인다는 관찰. (3-0)
- 이 관찰은 실무자들의 CLAUDE.md/AGENTS.md 규칙 파일로 인코딩되고 있다: "검증 없이 가정하지 마라",
  "불확실성을 명시적으로 드러내라" 류의 행동 금지 조항. 대표 사례:
  [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
  (포스트 다음 날 생성된 파생 레포, 해당 카테고리 최다 스타급).
- **출처 품질 주의**: 1차 출처가 소셜 미디어 포스트이고, 파생 규칙 파일은 커뮤니티 artifact다 —
  Anthropic/OpenAI 공식 가이드가 아니며, **가짜 fallback 방지 효과가 실증 평가된 검증 주장은 없다**.

## 5. 강제 artifact 비교 — 검증 통과 사례 기준

| 원칙 | 누가 | artifact 형태 | 강제 메커니즘 |
|------|------|--------------|--------------|
| 반환값/입력 전수 검사, silent discard 금지 | NASA/JPL (Rule 7) | 코딩 표준 + 정적 분석 가능한 규칙 | `(void)` 캐스트만 예외인 구문 규칙 — 도구 검사 가능 |
| 어서션 밀도 하한 + 발화 시 명시적 복구 | NASA/JPL (Rule 5) | 수치 기준 (codebase 평균 함수당 2개) | 측정·감사 가능 (밀도 카운트) |
| 불변식 위반 시 crash, 프로덕션 어서션 | TigerBeetle (Tiger Style) | TIGER_STYLE.md (레포 내 표준 문서) | 리뷰 + 어서션이 프로덕션에서 실행됨 |
| 모든 자원·루프·큐에 상한 | TigerBeetle | 동일 문서 | bound 초과 = 감지 가능한 에러 |
| ML silent failure 감지 | 학계 (FAME) | 전용 런타임 모니터 | 코드 게이트와 별개 레이어 |
| LLM의 무단 가정/불확실성 은폐 금지 | 실무 커뮤니티 (Karpathy 파생) | CLAUDE.md / AGENTS.md 행동 규칙 | 에이전트 컨텍스트 주입 (효과 미실증) |

공통 패턴: 살아남은 사례들은 전부 **"무엇이 위반인지 기계적으로 판정 가능한 형태"**(수치 하한,
구문 규칙, bound)로 원칙을 내렸다. "좋은 코드를 쓰자" 수준의 권고형 주장들은 검증에서 살아남지
못했거나 애초에 발견되지 않았다.

## 6. 검증에서 탈락/미해결 — 정직한 공백

이번 패스에서 **확인에 실패**한 것들 (사실이 아니라는 뜻이 아니라, 검증 가능한 1차 인용을 확보하지
못했다는 뜻):

- **Google**: "C++ 예외 전면 금지", "메모리 고갈 = fatal 취급" 둘 다 0-3 반박으로 탈락. Google의
  fail-fast 공식 입장은 이 패스의 검증된 증거로는 서술 불가.
- **IEC 61508 / DO-178C / ISO 26262**: 관련 주장 4건 전부 탈락. 인증 표준이 silent error
  propagation을 감사 가능한 요구사항으로 명문화하는지는 **미해결** — 표준 원문 직접 조사 필요.
- **Michael Nygard (Release It!) / Netflix / Erlang "let it crash"**: 소스는 수집됐으나(§출처)
  검증을 통과한 주장이 없음. **"언제 fallback이 정당한 resilience(서킷브레이커·벌크헤드)이고
  언제 에러 마스킹인가"라는 핵심 긴장은 이번 합성이 답하지 못한 중심 공백이다.**
- **"린트만이 에이전트를 잡는다"** (factory.ai): 0-3 반박 탈락. CLAUDE.md 행동 규칙 vs 자동화 강제
  (린트/CI)의 효과 비교는 실증 근거 없음.
- **중복 로직 금지(DRY) 강제**: 질문에 포함했으나 이 각도에서 검증을 통과한 권위 주장이 없었다.

## 7. 열린 질문 (후속 조사 후보)

1. resilience engineering(서킷브레이커, graceful degradation)은 "정당한 fallback"과 "에러 마스킹
   fallback"을 어떻게 구별하며, 이를 **강제 가능한 규칙**으로 명문화한 표준이 존재하는가?
   — 낙상 시스템은 미탐(silent degradation)과 오경보(과잉 crash) 양쪽이 모두 해로워서 이 경계가
   직접적으로 중요하다.
2. IEC 61508/DO-178C/ISO 26262가 silent error propagation 금지를 SIL 수준 요구사항으로 명문화하는가?
3. AI 코딩 에이전트의 가짜 fallback 생성을 막는 데 린트/정적분석/CI 게이트와 CLAUDE.md 행동 규칙
   중 무엇이 실증적으로 효과적인가?
4. Tiger Style의 crash-on-invariant-violation을 ML 추론 레이어에 적용할 때 경계는 어디인가 —
   pose confidence 하락 시 추론 워커를 죽이는 게 맞나, 데이터 무결성/어서션 레이어에만 적용하나?

## 출처 (23개 수집, 품질 표기)

**1차**: [TIGER_STYLE.md](https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/TIGER_STYLE.md) ·
[tigerstyle.dev](https://tigerstyle.dev/) ·
[Holzmann P10 원문](https://spinroot.com/gerard/pdf/P10.pdf) ·
[umich 사본](https://web.eecs.umich.edu/~imarkov/10rules.pdf) ·
[Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html) (주장 탈락) ·
[arXiv:2510.22224 (FAME)](https://arxiv.org/pdf/2510.22224) ·
[arXiv:2603.25499](https://arxiv.org/pdf/2603.25499) (주장 탈락) ·
[Karpathy X post](https://x.com/karpathy/status/2015883857489522876)

**2차/커뮤니티**: [Wikipedia P10](https://en.wikipedia.org/wiki/The_Power_of_10:_Rules_for_Developing_Safety-Critical_Code) ·
[Perforce NASA rules](https://www.perforce.com/blog/kw/NASA-rules-for-developing-safety-critical-code) ·
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) ·
[steipete/agent-rules](https://github.com/steipete/agent-rules) ·
[ferd.ca Zen of Erlang](https://ferd.ca/the-zen-of-erlang.html) (주장 미통과) ·
[verraes.net let-it-crash](https://verraes.net/2014/12/erlang-let-it-crash/) (주장 미통과) ·
[factory.ai linters-for-agents](https://factory.ai/news/using-linters-to-direct-agents) (주장 탈락) 외 8건

**통계**: 5 각도 / 23 소스 / 111 주장 추출 / 상위 25 검증 → 11 확인, 14 탈락 / 합성 후 6 finding.
