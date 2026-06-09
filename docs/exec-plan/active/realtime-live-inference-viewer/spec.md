---
slug: realtime-live-inference-viewer
issue: 39
status: in-progress
author: gobeumsu
---

# Spec — 실시간 프레임별 라이브 추론 뷰어 (issue #39)

## What

Streamlit 데모의 **사전렌더 플레이어**(`build_annotated_video` → mp4 → `st.video`)를
**프레임별 실시간 추론 뷰어**로 교체한다. 각 프레임을 처리하는 즉시 `st.empty()` 자리표시자에
증분 렌더하고, 낙상 발화 상태(빨간 박스 on/off + confidence)를 실시간으로 표시한다.

ADR-010(실시간 per-frame 라이브 추론을 표준 데모 관찰 모드로 확정)의 **구현**이다.

## Why

분류기(ADR-009)를 반복 개선하면서 탑다운 낙상 탐지를 **라이브로 관찰**해야 한다. 사전렌더는
파라미터/모델을 바꿀 때마다 전체 재렌더를 강제해 관찰을 막는다. 파이프라인은 이미 프레임 단위
(`Frame → pose → classifier.update(time) → overlay`)라 렌더 루프만 바꾸면 된다.

## Scope

- 입력: `VideoFileSource`로 `data/processed` 클립 라이브 재생 (카메라/RTSP는 후속).
- 추론: 이미 머지된 `FallClassifierModule`(pose + 룰베이스 분류기) 재사용 — 스텁 금지.
- UI: 재생/정지, 분류 모델 선택 + 탐지 파라미터, 실시간 정상/낙상 뱃지.
- 사전렌더 경로(`annotated_video.py`) 및 관련 테스트 제거.

## Out of scope

- 카메라/RTSP 실시간 입력 (후속 이슈, ADR-010 §2 "Later").
- serving `/predict` 연동 (#23/#28).
- 분류기 정확도 개선 / temporal 모델 (#25/#26). 룰베이스는 gold-8에서 0/8 — #39는 *배선*만 검증.
- ADR 작성 — ADR-010이 이미 결정을 기록함.

## Acceptance (요약)

`streamlit run ml/demo/app.py` → 클립 선택 → 재생 시 프레임이 `st.empty()`에 증분 렌더되고,
분류기가 낙상을 발화하면 같은 프레임에서 빨간 박스 + 낙상 뱃지가 뜬다. 사전렌더 경로는 제거되고
`pnpm lint` / `uv run pytest`가 통과한다. (상세 기준은 `plan.md` 참조.)
