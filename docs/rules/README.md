# Rules

Project rules are **standing conventions** every change must follow. Unlike a
plan (work-scoped) or an ADR (one cross-cutting decision), a rule is an ongoing
constraint on *how* we work in a given area.

| Rule | Scope | Summary |
|------|-------|---------|
| [streamlit-demo.md](./streamlit-demo.md) | `ml/demo/` | Compact UI; native-scrubbable playback via pre-rendered mp4 + `st.video()`; independent overlay toggles; cache key includes every render-affecting input; model/size/classifier selection through the model-seam. |
| [ml-filesystem-layout.md](./ml-filesystem-layout.md) | `ml/` | Where each file category lives: weights → `ml/weights/` (cache), outputs → `ml/data/{annotated,eval}`, inputs → `ml/data/{raw,processed,uploads}`, artifacts → `ml/artifacts/`. Weights/footage/outputs gitignored, never committed. Records ADR-007. |

---

## Rule: ADRs must be MECE

Every ADR in `docs/decisions/` must be **MECE** — Mutually Exclusive,
Collectively Exhaustive — with respect to the decisions it records.

- **Mutually Exclusive.** One ADR records **one** cross-cutting decision. Two
  ADRs must not overlap or relitigate the same choice. When a new ADR touches an
  area an existing ADR owns, it must explicitly state what it does **not**
  reopen, and scope itself to the genuinely new decision. (Example: ADR-006
  places the frame-source intake in `ml/util/` and explicitly excludes the
  model-seam placement and demo-UX, which belong to ADR-005 and the plan
  respectively.)
- **Collectively Exhaustive.** Within an ADR, the decision is recorded in full:
  the context that forced it, the option chosen, the alternatives weighed and
  why they were rejected, and the trade-offs accepted. A reader should not need
  another document to understand *why* the decision was made.

The boundary test: if a choice is implementation detail of one feature, it
belongs in that feature's plan, not an ADR. If it is cross-cutting and
expensive-to-reverse, it gets its **own** ADR — not a paragraph bolted onto an
existing one. When a decision changes, write a new ADR that supersedes the old
one (never edit a finalized ADR's body, never delete it).

See [docs/decisions/README.md](../decisions/README.md) for the ADR lifecycle.
