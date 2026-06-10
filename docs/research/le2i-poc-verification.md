---
title: Le2i Fall Detection Dataset — PoC Verification
slug: le2i-poc-verification
type: research
status: active
date: 2026-06-10
author: gobeumsu (executor agent — web verification)
grounds_on:
  - UBFC dataUBFC portal: https://search-data.ubfc.fr/imvia/FR-13002091000019-2024-04-09_Fall-Detection-Dataset.html
  - Original paper: Charfi et al. (2013) JEI doi:10.1117/1.JEI.22.4.041003
  - GitHub HAR-UP annotation code: https://github.com/nithiroj/Fall-Detection-PyTorch/blob/master/preprocess.py
  - Google Drive mirror (YifeiYang210): https://github.com/YifeiYang210/Fall_Detection_dataset
  - Kaggle mirror: https://www.kaggle.com/datasets/tuyenldvn/falldataset-imvia
related: [fall-detection-datasets, fall-state-taxonomy]
---

# Le2i Fall Detection Dataset — PoC Verification

> **research 문서.** 결정하지 않는다. 6개 blocking data-point 검증 + 다운로드 경로 확인.
> Download access confirmed via HTTP 206 range request (2026-06-10).

---

## VERDICT SUMMARY (read first)

| # | Data Point | Verdict | Confidence |
|---|-----------|---------|------------|
| 1 | **Access method** | **DIRECT download — no login, no form** (HTTP 206 confirmed) | HIGH |
| 2 | **License** | CC BY-NC-SA 3.0 — research only, non-commercial | HIGH |
| 3 | **Structure / format** | 4 scenarios, RGB .avi, 25 fps, 320×240, ~191 annotated videos | HIGH |
| 4 | **Annotation format** | Per-video `.txt`: line 1 = fall start frame, line 2 = fall end frame; `0`+`0` = ADL | HIGH (code-verified) |
| 5 | **Fall vs ADL determination** | `lines[0] == 0 and lines[1] == 0` → ADL | HIGH |
| 6 | **Size / minimal subset** | Full official 8.95 GB; Google Drive mirror (annotated Coffee_room+Home) = 310 MB | HIGH |

---

## 1. Official Source + Access Method (KEY QUESTION)

**Source:** Julien Dubois, Johel Miteran (ImViA, Université Bourgogne Europe)
**Portal:** https://search-data.ubfc.fr/imvia/FR-13002091000019-2024-04-09_Fall-Detection-Dataset.html
**DOI:** 10.25666/DATAUBFC-2024-04-09

### Access verdict: DIRECT DOWNLOAD — no login required

The UBFC portal generates a pre-signed S3 URL via a redirector:

```
GET https://search-data.ubfc.fr/dl_data.php?file=101
→ 303 redirect → https://storage-data.ubfc.fr/dataubfc/...FallDataset.zip?X-Amz-...&X-Amz-Expires=300
```

**Confirmed via `curl --range 0-99 -L` → HTTP 206 Partial Content.** The first bytes decode as a ZIP containing `Coffee_room_01.zip`, confirming the archive structure. The 300-second signed URL is for initiation only; once a GET transfer begins, S3 keeps the connection alive regardless of URL expiry.

Additional mirrors (both also publicly accessible without login):

| Mirror | URL | Size | Note |
|--------|-----|------|------|
| **UBFC official** | `https://search-data.ubfc.fr/dl_data.php?file=101` | **8.95 GB** | All 4 scenarios + features |
| **Google Drive (YifeiYang210)** | `https://drive.usercontent.google.com/download?id=16sv5CLT3pBI0kcLvAYJqT_zscGK-GF91&export=download&confirm=t` | **310 MB** | `pure_data.zip` — annotated subset (Coffee_room + Home) |
| **Kaggle** | `kaggle datasets download -d tuyenldvn/falldataset-imvia` | ~310 MB | Requires `KAGGLE_USERNAME` + `KAGGLE_KEY` env vars |

---

## 2. License

**CC BY-NC-SA 3.0** — Attribution, Non-Commercial, Share Alike.

From the UBFC portal: *"CC BY-NC-SA — creativecommons.org/licenses/by-nc-sa/3.0/"*

- **Research use: allowed.** PoC development qualifies.
- **Commercial deployment: prohibited** without separate agreement.
- **Redistribution: share-alike** (derivatives must use the same license).
- Required citation: Charfi I., Miteran J., Dubois J., Atri M., Tourki R., *"Optimised spatio-temporal descriptors for real-time fall detection"*, JEI 22(4), 2013.

---

## 3. Dataset Structure + Format

### Scenarios

| Scenario | Approx. video count | Has `Annotation_files`? |
|----------|--------------------|-----------------------|
| Coffee_room | ~70 | YES |
| Home | ~60 | YES |
| Office | ~64 | NO |
| Lecture_room | ~27 | NO |
| **Total (annotated)** | **~130–191** | (Home + Coffee_room only) |

> Note on video count discrepancy: the UBFC portal states "191 annotated videos"; a third-party mirror (YifeiYang210) reports 221 total (including Office/Lecture_room without annotation). The official 191 figure is used here.

### Video format

- **Container:** `.avi` (RGB, single-person)
- **Resolution:** 320 × 240 pixels
- **Frame rate:** 25 fps (fixed, no per-clip variance)
- **Subjects:** 9 subjects; 3 fall types (forward, balance loss, fall from sitting) + 6 ADL types
- **Fall clips:** 143 fall videos; 48 ADL videos (per third-party source)

---

## 4. Annotation Format (CRITICAL — drives the loader)

### File location and naming

```
FallDataset/
├── Videos/
│   ├── Coffee_room/
│   │   ├── video (1).avi
│   │   └── ...
│   └── Home/
│       └── ...
└── Annotation_files/
    ├── Coffee_room/
    │   ├── video (1).txt    ← corresponds to video (1).avi
    │   └── ...
    └── Home/
        └── ...
```

Path derivation (confirmed from `nithiroj/Fall-Detection-PyTorch/preprocess.py`):

```python
annot_path = video_path.replace('Videos', 'Annotation_files').replace('.avi', '.txt')
```

### Per-file structure

```
<fall_start_frame>        ← line 0 (integer); 0 if no fall
<fall_end_frame>          ← line 1 (integer); 0 if no fall
<h>,<w>,<cx>,<cy>         ← per-frame bounding box: height, width, center_x, center_y
<h>,<w>,<cx>,<cy>
...                       ← one row per frame
```

### DISCREPANCY vs task spec

The task spec assumed `frame_index,x1,y1,x2,y2` (corner-based). The **actual format** uses center-based bounding boxes: `height, width, center_x, center_y`. There is **no frame_index column** in the per-frame rows — rows are implicitly indexed by position. Conversion to corner format:

```
x1 = cx - w/2,  y1 = cy - h/2,  x2 = cx + w/2,  y2 = cy + h/2
```

The loader (`le2i.py` or equivalent) must perform this conversion.

### Code evidence (from `preprocess.py`)

```python
with open(annot_file) as f:
    lines = f.readlines()
falls.append((int(lines[0]), int(lines[1])))   # (start_frame, end_frame)
```

### Known annotation inconsistencies

Per GitHub issue `nithiroj/Fall-Detection-PyTorch#3`:
- Some annotation files have `0` on both lines even for videos that appear to contain falls (corrupted/missing annotations).
- `Coffee_room/` is missing annotation file for at least video 26.
- `Office/` and `Lecture_room/` folders have **no annotation folder at all**.

**Mitigation:** Filter out clips where `start == 0 and end == 0` only for `Home/` and `Coffee_room/` — validate via visual spot-check on a random 5% of ADL-labeled clips.

---

## 5. Fall vs ADL Determination

```python
start, end = int(lines[0]), int(lines[1])
is_fall = (start > 0 or end > 0)   # True → fall clip; False → ADL
```

Fall interval: frames `[start, end]` inclusive are the fall event. Frames outside `[start, end]` within the same clip are pre/post-fall context (usable as non-fall frames for per-frame classification).

**No Activity-11 / post-fall lying ambiguity (R9):** Le2i uses frame-interval labels, not activity codes. The post-fall lying period is simply within `[start, end]` and labeled as part of the fall sequence. No mitigation needed (unlike UP-Fall Activity-11).

---

## 6. Total Size + Minimal PoC Subset

| Scope | Content | Format | Size | Recommended for PoC? |
|-------|---------|--------|------|----------------------|
| **Full official (UBFC)** | All 4 scenarios + pre-extracted features | Original .avi + .txt annotations | **8.95 GB** | For full training; needed for original annotation format |
| **Google Drive mirror (YifeiYang210)** | Coffee_room + Home, pre-processed | JPEG frames, 5-class dirs, pre-split | **310 MB** | **YES for fast PoC start** — different format, see Section 7 |
| **Kaggle mirror** | Similar annotated subset | .avi + .txt (closer to original) | ~310 MB | Alternative |

### Google Drive mirror format (confirmed via download 2026-06-10)

The `pure_data.zip` (310 MB) is **NOT** the original .avi + annotation .txt format. It is a third-party pre-processed version:

```
pure_data.zip
├── train/
│   ├── in.txt           # index: "idx\tlabel\t./Category\VideoName"
│   ├── Blank/           # ADL — empty/no-person frames
│   │   ├── Coffee_room_v1/  001.jpg, 002.jpg, ...
│   │   └── ...
│   ├── Fall/            # Fall event frames
│   ├── Lie/             # Post-fall / lying down (144 clips — NOTE: ambiguous)
│   ├── Likefall/        # Fall-like ADL hard negatives (18 clips)
│   └── Stand/           # Standing/walking ADL
└── val/
    └── (same structure)
```

**Clip counts (confirmed):**

| Class | Train clips | Val clips |
|-------|------------|-----------|
| Blank | 231 | 17 |
| Fall | 74 | 28 |
| Lie | 144 | 17 |
| Likefall | 18 | 8 |
| Stand | 225 | 15 |
| **Total** | **692** | **85** |

**Implications:**
- Loader needs frame-directory reader (not `.avi` + `.txt` parser)
- `Lie` class (post-fall lying) is separate from `Fall` — binary classification must decide whether to merge `Fall+Lie` → positive or keep them split
- `Likefall` provides valuable hard negatives for model robustness
- The 5-class structure deviates from the binary fall/non-fall assumed in the LSTM-Transformer spec

**For the original .avi + annotation .txt format:** use UBFC official download (Option B below).

---

## 7. Download

### Option A — Google Drive mirror (310 MB, pre-processed JPEG frames) — PROOF-OF-ACCESS DONE

**Format:** JPEG frame directories + 5-class labels (NOT original .avi). Use this for fast PoC iteration if the loader is written for frame-directories.

No credentials required. Run from the worktree root:

```bash
mkdir -p ml/data/le2i_raw
curl -L \
  "https://drive.usercontent.google.com/download?id=16sv5CLT3pBI0kcLvAYJqT_zscGK-GF91&export=download&confirm=t" \
  -o ml/data/le2i_raw/pure_data.zip
unzip ml/data/le2i_raw/pure_data.zip -d ml/data/le2i_raw/
```

> **Already downloaded** to `ml/data/le2i_raw/sample/pure_data.zip` (310 MB, verified 2026-06-10).

### Option B — UBFC official (8.95 GB, original .avi + .txt annotations) — RECOMMENDED for annotation-accurate loader

**Format:** Original `.avi` videos + per-video `.txt` annotation files (fall start/end frames + per-frame bboxes). Use this if building the `le2i.py` loader described in Section 4.

No login required; generates a fresh pre-signed S3 URL on each request:

```bash
mkdir -p ml/data/le2i_raw
curl -L \
  "https://search-data.ubfc.fr/dl_data.php?file=101" \
  -o ml/data/le2i_raw/FallDataset.zip
unzip ml/data/le2i_raw/FallDataset.zip -d ml/data/le2i_raw/
```

> The redirect URL has `X-Amz-Expires=300`; S3 honors in-flight transfers past expiry. Use `-C -` to resume if interrupted. **Do NOT run this multi-GB download interactively** — launch as a detached background job.

### Option C — Kaggle CLI (requires API key, ~310 MB)

```bash
# Prerequisites: KAGGLE_USERNAME and KAGGLE_KEY set in environment
kaggle datasets download -d tuyenldvn/falldataset-imvia \
  -p ml/data/le2i_raw/ --unzip
```

---

## 8. Caveats and Open Questions

| ID | Issue | Severity | Resolution |
|----|-------|----------|------------|
| C1 | Annotation inconsistencies (missing files, zero-annotated falls) | MEDIUM | Filter + spot-check 5% of ADL clips |
| C2 | Bounding box is center+dims format, NOT x1,y1,x2,y2 — loader must convert | HIGH | Fix `le2i.py` loader |
| C3 | Office + Lecture_room have no annotations — cannot use without manual labeling | LOW for PoC | Use only Coffee_room + Home |
| C4 | Subjects are not elderly — domain gap vs actual nursing home residents | MEDIUM | Use for pretraining; validate on in-domain data |
| C5 | CC BY-NC-SA forbids commercial redistribution | HIGH for product | Confirm scope with legal before production use |
| C6 | Google Drive mirror (YifeiYang210/pure_data.zip) is unofficial — license compliance is user's responsibility | MEDIUM | Prefer UBFC official for citation compliance |
