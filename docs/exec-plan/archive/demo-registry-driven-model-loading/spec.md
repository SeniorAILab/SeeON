---
slug: demo-registry-driven-model-loading
title: "Streamlit Demo — Registry-Driven Model Loading & Threshold Policy"
type: spec
date: 2026-06-12
owner: gobeumsu
issue: 74
status: active
interview: deep-interview di-demo-loop-models-001 (--quick, threshold 5%)
---

# Spec: Streamlit Demo — Registry-Driven Model Loading & Threshold Policy

## Why this slug exists

The autoresearch loop (#74) produced best-state artifacts for **six** model families
(`ml/models/fall/{random-forest,svm,logistic-regression,lstm,transformer,gcn}`), and the
NH evaluation showed **gcn** is the adoption frontrunner (18/19 confirmed falls at th 0.30).
But the demo cannot show any of this: `demo/classifiers.py` hardcodes 4 specs
(rule_based/random_forest/lstm/transformer) and `demo/temporal_module.py` hardcodes a
3-way if/elif — gcn, svm, logistic-regression are invisible, and every future family
would need demo edits. User decision (2026-06-12): "training이 끝난 결과물이 바로
streamlit에 로딩이 되도록" — exposure must be **registry-driven**, not hand-listed.

## Requirements

- R1 **Single source of truth**: one lightweight declarative catalog of model families
  (key, mode, artifact filename, import path). Training `REGISTRY` and the demo's
  temporal key set both derive from it. Adding a family = one catalog entry; the demo
  picks it up with zero demo-side edits.
- R2 **Artifact-presence auto-exposure**: a family appears in the 분류 모델 selectbox
  iff its `metadata.json` exists on disk (existing probe semantics, now over all
  catalog keys). gcn must load — including `arch.json` HP reconstruction.
- R3 **Lazy-import policy preserved**: `demo.temporal_module` and `demo.classifiers`
  stay importable without torch/sklearn; model classes import only inside the factory.
- R4 **Threshold slider with per-model optimal defaults** (user decision, Round 1):
  when a temporal model is selected, show a 판정 임계값 slider whose default is that
  model's recommended threshold — NH-frontier value where measured
  (phase3-step2 v2: gcn 0.30, random_forest 0.20, logistic_regression 0.10,
  transformer 0.133), else the artifact's LE2I `operating_threshold` from metadata.
  NH values live in a committed demo-side mapping (metadata.json is overwritten on
  retrain and never carries NH-derived numbers).
- R5 Existing behaviours unchanged: rule-based path, ModelModule seam, public-mode
  privacy invariants, `st.empty()` render pattern (docs/rules/streamlit-demo.md).

## Success criteria

- `pytest tests/` green; new tests pin catalog↔REGISTRY↔demo-key lockstep and
  threshold-default resolution.
- Headless smoke: every artifact-present family (gcn included) builds via
  `build_temporal_model` with a fake pose module.
- Visual confirmation in Streamlit (operator mode) is performed by the user.

## Non-goals

- Mask freeze / gate-2 decision (separate human gate), NH re-evaluation.
- Un-retiring lstm (its artifact exists → it auto-exposes like any family; retirement
  is a leaderboard/adoption concept, not a demo concept).
- Product frontend (`front/`, `backend/`) — demo surface only (ADR-003).

## Companion deliverables (same branch, separate artifact type)

ADR-019 (NH gold dataset construction methodology) and ADR-020 (autoresearch method),
MECE against ADR-018 (custody) and ADR-017 (adoption criteria). ADRs are
work-independent permanent docs — authored alongside, not part of this plan's steps.
