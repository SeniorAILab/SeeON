---
name: technical-report
description: "Eldercare Fall AI 정본 기술 문서(secondbrain/book/, 00 Background ~ 50 Assurance)를 쓰거나 확장·재구성·검토할 때 쓴다. 단일 정의 파일 technical-report.yaml의 depth로 전체 TOC(섹션→## 헤딩→필수 내용)를 강제하고, toss/technical-writing 상위 원칙과 고범수가 정한 한국어 톤·작성 규칙을 적용하며, background에 eldercare-fall-ai 시스템 아키텍처를 depth로 담아 작성 배경지식으로 제공한다."
---

# Eldercare Fall AI Technical Report

요양원 낙상 방지 AI 정본 기술 문서를 **단일 정의 파일 [technical-report.yaml](./technical-report.yaml) 의 depth에 맞춰** 작성·확장·검토하게 강제하는 스킬이다. 이 yaml 하나가 문서의 골격(SSOT)이고, 작성자는 그 틀을 채울 뿐 임의로 늘리거나 줄이지 않는다.

대상은 `secondbrain/book/` 의 정본 문서다 — `Eldercare Index.md` 와 `Eldercare 00 Background.md` ~ `Eldercare 50 Assurance.md`. 문서 구조는 **라이프사이클 spine**(배경 → 제품 → 시스템 설계 → 딜리버리 → 운영 → 보증)이다. 완료 기준은 "이 문서만 읽고 구현 착수가 가능"한 온보딩 완결이되, 코드 근거가 충분한 섹션(System Design, Product)에 한해 이 바를 적용하고 근거가 약한 섹션(Delivery/Operations/Assurance)은 현재 확보된 사실까지만 쓰고 갭은 `deferred`로 남긴다.

> `secondbrain/` 은 Obsidian vault 폴더(`요양원 낙상 방지 AI`)로의 심링크이고(`.gitignore` 처리 — 정본은 vault에만 존재, git 추적·PR 대상 아님), 정본 문서는 그 안의 `book/` 아래에 둔다. 일자별 원시 로그(`secondbrain/2026-... .md`)는 이 강제 틀의 대상이 아니다.

---

## 언제 쓰나

- 기술 문서의 어떤 섹션(00~50)을 **새로 쓰거나 보강·재구성**할 때.
- 섹션이 톤·구조·필수 내용(must)을 지켰는지 **검토**할 때.
- 시스템 사실(아키텍처·경로·계약)을 인용해야 하는데 **추측 없이 출처를 고정**해야 할 때.

쓰지 않을 때: 정본이 아닌 일자별 원시 로그(`secondbrain/2026-... .md`)를 쓸 때. 노트는 자유 형식이고 이 강제 틀의 대상이 아니다.

---

## 핵심 메커니즘 — depth가 곧 TOC (강제)

구조의 진리는 `technical-report.yaml` **단 하나**다. depth가 그대로 문서 골격이다.

- **depth-1** `document.<섹션 00~50>` → `secondbrain/book/` 의 한 `.md` 파일.
- **depth-2** `<섹션>.headings.<## 헤딩>` → 그 파일의 `##` 헤딩.
- **depth-3** `.must` → 그 헤딩이 **반드시** 담아야 하는 내용. 하나라도 비면 그 섹션은 미완이다.

규칙:

1. 작업 **전에** `technical-report.yaml` 을 읽고, 대상 섹션의 `intent` 와 모든 `headings`·`must` 를 파악한다.
2. 작성 **후에** 그 섹션의 `must` 를 **체크리스트로 하나씩 대조**한다. 충족 못 한 must 가 있으면 끝난 게 아니다.
3. 섹션·헤딩을 **임의로 추가/삭제/재배열하지 않는다.** 구조를 바꿔야 하면 **먼저 yaml 을 고치고(승인 받고)** 문서를 거기에 맞춘다 — yaml 이 SSOT, 문서가 종속물이다.
4. validate.py는 `##`(H2)만 검증한다. `## ML` 아래 `### Video Ingest / 데이터셋 구성 / 모델 선택 / 모델 트레이닝 / Serving` 같은 `###`(H3) 구조는 코드 게이트 밖이므로, yaml `must` 항목으로 명시하고 작성 시 **literal `### ` 헤딩으로** 작성한다(bold inline 금지).
5. yaml 의 `governance` 와 아래 톤 규칙을 모든 섹션에 동일하게 적용한다.

---

## 톤 규칙 — 반드시 지킨다

### 상위 원칙 (toss/technical-writing 정렬)

1. **독자 성공 우선** — 문서의 목적은 글이 아니라 독자가 과업을 끝내는 것이다. "이 섹션을 읽은 엔지니어가 무엇을 할 수 있게 되는가"를 먼저 정하고, 거기서 역산해 쓴다.
2. **빠르고 정확한 전달** — 핵심을 앞에 둔다. 결론·계약·경로를 먼저 주고 배경은 뒤로. 한 문단은 한 가지를 말한다. 군더더기·중복·수식을 덜어낸다.
3. **명료함 > 창의성** — 멋진 표현보다 오해 없는 표현. 같은 개념은 같은 용어로 일관되게 쓰고, 모호어("적절히", "잘") 대신 구체값(경로·숫자·헤더명)을 쓴다.
4. **의도적 문서 구조** — 구조가 곧 메시지다. 라이프사이클 spine(00~50)과 각 섹션의 헤딩 위계는 우연이 아니라 yaml로 강제된 의도다. 독자가 목차만 보고 전체 흐름을 잡을 수 있어야 한다.
5. **체계적 개선** — 초안은 끝이 아니라 시작이다. `must` 대조 → MECE 점검 → validate.py 게이트 → 고범수 리뷰의 반복으로 다듬는다. 근거 없는 칸은 채우지 말고 `deferred`로 드러낸다.

### 고범수 취향 (세부 규칙)

- **언어·문체**: 한국어. **paragraph 기본.** bullet 은 섹션 요약이나 atomic 나열에만 쓴다. 설명을 bullet 으로 토막내지 않는다.
- **MECE**: 섹션 간 내용 중복 금지. 같은 사실을 두 곳에 쓰지 말고, 한 곳에 두고 **인용**한다.
- **링크**: 내부·섹션 인용은 `[[wikilink]]`. 외부 소스(코드·repo·URL)는 `[제목](url)` 마크다운 링크.
- **다이어그램**: mermaid 는 **계층적**으로. high-level 을 먼저 그리고, 컴포넌트 상세는 **별도 다이어그램**으로 분리한다. 한 장에 다 그리지 않는다.
- **응집점**: 섹션 소개·목차는 `Eldercare Index.md` **에만** 둔다. 각 `.md` 는 그 자체로 완결된 content 만 담는다.
- **표기**: 프로젝트 앞단 표기는 **Eldercare** (정본 문서 파일·H1 접두어).
- **출처**: 진리 원천은 **실제 code/문서 직접 읽기** (`backend/`, `ml/`, `front/`, `docs/`). 사실은 추측하지 않는다.
- **범위**: 용역·제품 전체를 다루되 구현·설계에 집중한다.
- **거버넌스**: 정본은 **고범수 승인 하에만 확정 수정.** 에이전트는 **초안 제안만** 한다 — 섹션 초안을 제시하고 승인 뒤 반영한다. 문서(정본 큐레이션)와 노트(원시 로그)는 분리하며 자동 동기화하지 않는다.

---

## 배경 지식 — 아키텍처 depth

문서가 인용하는 시스템 사실은 yaml 의 `background` 에 depth 로 박아 둔다. 작성 시 여기서 가져오고, 없거나 불확실하면 실제 코드/repo 를 직접 읽어 확인한다(그리고 필요하면 승인받아 background 를 갱신한다).

- **`background.eldercare_architecture`** — eldercare-fall-ai 시스템(backend/ml/front 구성, 낙상 탐지·알림 파이프라인, 데이터 계약, decision, 배포 토대 등)을 depth 로 담는다. `front/` 는 #257 머지로 **Vite + React 18 + react-router 앱**이 되었다(ADR) — 옛 Next.js 가정으로 쓰지 않는다.

추측 금지가 핵심이다. 모르면 background 또는 코드에서 확인하고, 그래도 없으면 빈 채로 두지 말고 출처 확인을 먼저 한다.

---

## 코드 강제 — 헤딩 구조 검증기

선언만으로는 강제가 아니다. [validate.py](./validate.py) 가 `technical-report.yaml` 의 `document` depth 를 진리로 삼아 `secondbrain/book/` 마크다운의 **실제 헤딩 구조를 파싱해 대조**한다 — 필수 `##` 누락, 정의에 없는 `##`, 순서 뒤바뀜, `# 제목` 불일치, 빈 헤딩(본문 없음)을 잡고 위반 시 **exit 1** 로 끊는다(frontmatter 와 코드펜스 안의 `#` 는 무시). 빈 헤딩은 경고(WARN), 구조 위반은 오류(FAIL)다.

```
python3 .claude/skills/technical-report/validate.py          # 사람용 리포트
python3 .claude/skills/technical-report/validate.py --json   # 기계 판독(CI/hook)
python3 .claude/skills/technical-report/validate.py --book <dir>
```

검증기는 `secondbrain/book/` 을 자동 탐지한다(`.claude/skills/technical-report` 심링크를 풀어 프로젝트 루트 기준으로 찾는다). PyYAML 이 필요하므로 없으면 `uv run python3 ...` 또는 `pip install pyyaml` 후 실행한다.

검증기는 **H2(`##`)까지만** 본다. `## ML` 아래 H3(`### Video Ingest` 등)는 게이트 밖이므로 `grep -c "^### "` 같은 보조 확인으로 직접 챙긴다. 섹션을 쓰거나 고친 뒤에는 **반드시 통과(exit 0)** 시킨다. Obsidian 등이 헤딩을 정규화(예: `vs`→`Vs`)해 drift 가 생기면, 문서가 아니라 **SSOT 인 yaml 을 실제값에 맞춰** 재정렬한다. 이 게이트가 "구조가 코드로 강제된다"는 보증이다.

---

## 워크플로

1. **틀 읽기**: `technical-report.yaml` 에서 대상 섹션의 `intent` 와 모든 `headings`·`must` 를 확보한다.
2. **사실 확보**: 인용할 시스템 사실은 `background` depth + 실제 code(`backend/`, `ml/`, `front/`, `docs/`)에서 가져온다.
3. **작성**: paragraph 우선으로 쓰고 위 톤 규칙을 지킨다. 인용은 wikilink/링크. 다이어그램이 필요한 헤딩은 계층적 mermaid.
4. **must 대조**: 섹션의 모든 `must` 를 체크리스트로 충족 확인. 빠진 게 있으면 채운다.
5. **MECE 점검**: 다른 섹션과 중복된 서술이 없는지 보고, 있으면 한 곳에 두고 나머지는 wikilink 로 바꾼다.
6. **코드 검증**: `python3 .claude/skills/technical-report/validate.py` 가 **exit 0** 인지 확인한다(헤딩 구조 게이트). H3 구조는 `grep` 으로 보조 확인.
7. **거버넌스**: 초안으로 제시하고 **고범수 승인 후** 정본에 반영한다. Index 의 상태줄·목차도 필요하면 함께 갱신(승인 대상).

---

## 파일

- **[technical-report.yaml](./technical-report.yaml)** — 강제 TOC(`document` 00~50 → `headings` → `must`) + 배경 아키텍처(`background.eldercare_architecture`). 이 한 파일이 구조와 배경의 단일 출처다. 구조를 바꾸려면 이 파일을 먼저 고친다.
- **[validate.py](./validate.py)** — 헤딩 구조 검증기. yaml `document` 와 실제 `.md` 헤딩을 대조해 위반 시 exit 1. 작성·수정 후 게이트로 돌린다.
