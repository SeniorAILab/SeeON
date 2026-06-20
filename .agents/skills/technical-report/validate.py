#!/usr/bin/env python3
"""Eldercare Fall AI 기술 문서 구조 검증기.

technical-report.yaml 의 document depth(섹션 00~50 → ## 헤딩)를 진리로 삼아,
secondbrain/book/ 의 실제 마크다운 헤딩 구조를 파싱해 대조한다.
헤딩이 진짜 코드로 강제되는 게이트다 — 누락/추가/순서뒤바뀜/빈 헤딩이면 실패(exit 1).

사용:
  python3 validate.py                 # 기본 book 경로 자동 탐지
  python3 validate.py --book <dir>    # book 디렉토리 직접 지정
  python3 validate.py --json          # 기계 판독용 JSON 결과

종료 코드: 0 = 전부 통과, 1 = 위반, 2 = 환경/설정 오류.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML 필요 (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

SKILL_DIR = Path(__file__).resolve().parent
YAML_PATH = SKILL_DIR / "technical-report.yaml"

FRONTMATTER = re.compile(r"^---\s*$")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
FENCE = re.compile(r"^\s*(```|~~~)")


def default_book_dir() -> Path:
    """repo_root/secondbrain/book 를 우선 추정한다(.claude/skills/technical-report 기준)."""
    for up in (SKILL_DIR.parents[2], SKILL_DIR.parents[3] if len(SKILL_DIR.parents) > 3 else SKILL_DIR):
        cand = up / "secondbrain" / "book"
        if cand.is_dir():
            return cand
    # fallback: 4단계 위
    return SKILL_DIR.parents[3] / "secondbrain" / "book" if len(SKILL_DIR.parents) > 3 else SKILL_DIR / "book"


def parse_structure(text: str):
    """frontmatter·코드펜스를 제외하고 (level, text, line_no, has_body) 헤딩 목록을 뽑는다."""
    lines = text.split("\n")
    # frontmatter 제거
    start = 0
    if lines and FRONTMATTER.match(lines[0]):
        for j in range(1, len(lines)):
            if FRONTMATTER.match(lines[j]):
                start = j + 1
                break
    in_fence = False
    raw = []  # (level, text, idx)
    body = lines[start:]
    for idx, ln in enumerate(body):
        if FENCE.match(ln):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = HEADING.match(ln)
        if m:
            raw.append((len(m.group(1)), m.group(2).strip(), idx))
    # has_body: 이 헤딩과 다음 헤딩 사이에 비공백 본문이 있는가
    headings = []
    for k, (lvl, txt, idx) in enumerate(raw):
        next_idx = raw[k + 1][2] if k + 1 < len(raw) else len(body)
        between = body[idx + 1:next_idx]
        has_body = any(s.strip() for s in between)
        headings.append({"level": lvl, "text": txt, "has_body": has_body})
    return headings


def validate(book_dir: Path):
    doc = yaml.safe_load(YAML_PATH.read_text(encoding="utf-8"))["document"]
    results = []
    ok = True
    for sid, sec in doc.items():
        title = sec["title"]
        fname = sec["file"]
        expected_h2 = list((sec.get("headings") or {}).keys()) if sec.get("headings") else []
        errs = []
        warns = []
        path = book_dir / fname
        if not path.is_file():
            errs.append(f"파일 없음: {fname}")
            results.append({"section": sid, "file": fname, "errors": errs, "warnings": warns})
            ok = False
            continue
        headings = parse_structure(path.read_text(encoding="utf-8"))
        h1 = [h for h in headings if h["level"] == 1]
        h2 = [h for h in headings if h["level"] == 2]
        # H1 검증
        if not h1:
            errs.append("H1(# 제목) 없음")
        elif h1[0]["text"] != title:
            errs.append(f'H1 불일치: 기대 "# {title}" / 실제 "# {h1[0]["text"]}"')
        if len(h1) > 1:
            errs.append(f"H1 여러 개({len(h1)}) — 섹션당 하나여야 함")
        # H2 집합·순서 검증
        actual_h2 = [h["text"] for h in h2]
        missing = [e for e in expected_h2 if e not in actual_h2]
        extra = [a for a in actual_h2 if a not in expected_h2]
        for e in missing:
            errs.append(f"필수 ## 헤딩 누락: {e}")
        for a in extra:
            errs.append(f"정의에 없는 ## 헤딩: {a}")
        if not missing and not extra and actual_h2 != expected_h2:
            errs.append(f"## 헤딩 순서 불일치\n      기대: {expected_h2}\n      실제: {actual_h2}")
        # 빈 헤딩(본문 없음) — must 미충족 신호
        for h in h2:
            if not h["has_body"]:
                warns.append(f"빈 ## 헤딩(본문 없음): {h['text']}")
        # abstract 처럼 headings:[] 인데 H2 가 있으면 오류
        if not expected_h2 and actual_h2:
            errs.append(f"이 섹션은 ## 헤딩이 없어야 하는데 발견됨: {actual_h2}")
        if errs:
            ok = False
        results.append({"section": sid, "file": fname, "errors": errs, "warnings": warns,
                        "expected_h2": expected_h2, "actual_h2": actual_h2})
    return ok, results


def main():
    ap = argparse.ArgumentParser(description="Eldercare Fall AI 기술 문서 헤딩 구조 검증기")
    ap.add_argument("--book", type=Path, default=None, help="secondbrain/book 디렉토리")
    ap.add_argument("--json", action="store_true", help="JSON 출력")
    args = ap.parse_args()

    book_dir = args.book or default_book_dir()
    if not book_dir.is_dir():
        print(f"ERROR: book 디렉토리 없음: {book_dir}", file=sys.stderr)
        sys.exit(2)

    ok, results = validate(book_dir)

    if args.json:
        print(json.dumps({"ok": ok, "book": str(book_dir), "results": results}, ensure_ascii=False, indent=2))
        sys.exit(0 if ok else 1)

    print(f"book: {book_dir}\n")
    n_err = n_warn = 0
    for r in results:
        status = "FAIL" if r["errors"] else ("WARN" if r["warnings"] else "PASS")
        print(f"[{status}] {r['section']}  ({r['file']})")
        for e in r["errors"]:
            print(f"   ✗ {e}")
            n_err += 1
        for w in r["warnings"]:
            print(f"   ! {w}")
            n_warn += 1
    print(f"\n{'='*48}")
    print(f"섹션 {len(results)}개 · 오류 {n_err} · 경고 {n_warn} → {'OK' if ok else 'VIOLATIONS'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
