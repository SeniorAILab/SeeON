---
name: hf-space-deploy
description: Deploys and verifies the eldercare fall-detection Streamlit demo on Hugging Face Spaces (Berom0227/eldercare-fall-demo). Use whenever the user asks to deploy the demo, update the deployed Space, debug a crashing/restarting Space, check whether the deployed URL works, or verify live inference on the deployment. Also use when native crashes (free(): invalid size, SIGSEGV, corrupted double-linked list) appear in HF Space logs — the hardened Dockerfile here is the known fix.
---

# HF Space Deploy — eldercare fall demo

Deploy `ml/demo` to the HF Space **Berom0227/eldercare-fall-demo** (Docker SDK,
free 16GB / 2-vCPU CPU tier) and verify real inference on the live URL.

> **STATUS (2026-06-12): not in active use.** The free CPU tier is too slow for
> the demo's purpose — page loading stalls, playback runs ~7.5× slower than
> realtime, and the live-camera page does not work (no usable camera path on
> the Space). The deployment itself is functionally correct; the blocker is
> **running without a GPU**, not the code. Do **not** delete the demo code or
> these deploy artifacts — they work as-is and become viable again on GPU
> hardware (paid Space tier or another GPU host). Keep this skill for that
> case and for the crash-hardening knowledge below.

## Deployment map

| What | Where |
|---|---|
| Live app | https://berom0227-eldercare-fall-demo.hf.space/ |
| Space repo (Dockerfile lives here) | https://huggingface.co/spaces/Berom0227/eldercare-fall-demo |
| Model weights (downloaded by bootstrap) | https://huggingface.co/Berom0227/eldercare-fall-models |
| HF token | `ml/.env` (gitignored) — `export $(grep -v '^#' ml/.env | xargs)`. Never echo the token. |

## Hard safety rules

- **Never upload nursing-home (NH) footage anywhere external** (ADR-012/ADR-018).
  For upload tests on the deployed app, use the public LE2I dataset only, e.g.
  `ml/data/le2i/raw/Home/video (37).avi` (annotation: fall at frames 129–144).
- **Never set `FALL_DEMO_MODE=operator`** on a deployment; public mode is fail-safe.
- Model weights never go into the git repo (deny-assets hook) — they go to the
  HF model repo / Space only.

## Staging layout

Assemble the Space contents in a scratch dir (convention: `/tmp/hf-space-eldercare-fall-demo/`):

```
Dockerfile            # from templates/Dockerfile — do not weaken, see "Crash class"
requirements.txt      # from templates/requirements.txt — pinned CPU wheels
smoke.py              # from templates/smoke.py — boot canary, optional once stable
README.md             # HF Space card: sdk: docker, app_port: 7860
.streamlit/config.toml
demo/                 # copy of ml/demo (Space copy may add faulthandler.enable())
training/             # modules demo imports
models/pose/*.pt      # YOLO pose weights
models/fall/{gcn,random-forest,...}/   # model.pt + metadata.json
```

Copy `templates/Dockerfile`, `templates/requirements.txt`, `templates/smoke.py` from this
skill into the staging dir rather than rewriting them.

## Crash class — why the Dockerfile looks like that

On the Space host, torch's **first heavy native call** (ultralytics `fuse()`,
first fused conv forward) corrupts the glibc heap whenever **any other native
thread is concurrently active** (watchdog inotify threads, ultralytics
telemetry SSL thread). Symptoms: `free(): invalid size`,
`corrupted double-linked list`, SIGSEGV — version-independent (torch 2.8 and
2.12 both crash), and single-threaded smoke tests pass on identical wheels.

The fix is the combination — removing any one piece reintroduced the crash:

| Mitigation | Kills |
|---|---|
| `LD_PRELOAD` tcmalloc (`libtcmalloc-minimal4`) | the glibc-malloc race itself |
| `YOLO_OFFLINE=True` + `settings.update(sync=False)` at boot | telemetry SSL thread |
| `--server.fileWatcherType=none` | watchdog inotify threads |
| `ATEN_CPU_CAPABILITY=avx2` | AVX-512 conv kernels (segfault site) |
| `OMP/OPENBLAS/MKL_NUM_THREADS=1` | rival BLAS pools on 2 vCPUs |

Also: ultralytics declares GUI `opencv-python` as its own dep, shadowing the
headless wheel on slim images (`ImportError: libxcb.so.1`) — hence the
`pip uninstall opencv-python && pip install --force-reinstall opencv-python-headless`
step after the pinned install.

`smoke.py` runs before streamlit in the CMD and prints a marker per native
step, so a regression shows exactly where the abort happens in the run log.
Keep it while iterating; drop it from CMD once the Space has been stable.

## Upload

Plain `hf` is not installed; use uvx:

```bash
export $(grep -v '^#' ml/.env | xargs)   # loads HF_TOKEN
uvx --from "huggingface_hub[cli]" hf upload \
  Berom0227/eldercare-fall-demo /tmp/hf-space-eldercare-fall-demo . \
  --repo-type space
```

Single-file updates: replace the last two args with `<local-file> <remote-path>`.
Any upload triggers a rebuild (~3 min build + ~2 min app start).

## Watch the rebuild

Poll runtime stage until `RUNNING` (states: `RUNNING_BUILDING` →
`RUNNING_APP_STARTING` → `RUNNING`; `RUNTIME_ERROR`/`PAUSED` = failure):

```bash
curl -s -H "Authorization: Bearer $HF_TOKEN" \
  https://huggingface.co/api/spaces/Berom0227/eldercare-fall-demo \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['runtime']['stage'])"
```

Stream logs (SSE; `run` or `build`). Parse with python json — grep/sed mangle
the escaped JSON:

```bash
curl -s -N -H "Authorization: Bearer $HF_TOKEN" \
  https://huggingface.co/api/spaces/Berom0227/eldercare-fall-demo/logs/run
```

A healthy boot shows the `[smoke]` markers ending in `[smoke] ALL OK`, then
streamlit's startup banner.

## Verify live inference (browser)

Stage check is not enough — verify inference end-to-end with gstack-browse
(`$B = ~/.claude/skills/gstack/browse/dist/browse`):

1. `$B goto https://berom0227-eldercare-fall-demo.hf.space/` and wait for
   `input[type=file]`.
2. `$B upload 'input[type="file"]' "ml/data/le2i/raw/Home/video (37).avi"`
   (55MB upload takes ~30s).
3. Pick the classifier via the 분류 모델 combobox if needed. **Re-snapshot and
   re-grep `@eN` ids immediately before every click** — ids shift between
   Streamlit reruns, and clicks can be swallowed by a rerun (verify state after
   clicking, re-click if the page is still idle).
4. Click 재생, then poll `$B snapshot -i` every ~12s for the status line
   (`정상 · {t}s / … · 낙상도 {p}% · 포즈 감지: {n}명`) or the
   `낙상 감지 N회` badge. Playback is ~7.5× slower than realtime
   (10s clip ≈ 3.5 min).
5. Success = status lines advancing + completion banner
   `재생 완료 — 240 프레임 처리됨` (or a screenshot of frame overlays).

Known quirks: websocket sessions drop after clip completion and reset the page
(server stays healthy — re-upload per session); `$B js "<expr>"` for inline JS
(`eval` takes a file path).

## Known findings (context, not defects)

- Models are trained on LE2I (`metadata.json: dataset=le2i`); NH gold clips are
  evaluation-only (ADR-013). On `video (37)` no classifier flagged the
  annotated fall at demo thresholds — note the gap between trained
  `operating_threshold` (GCN 0.026 / RF 0.09) and demo gate-2 presets
  (0.30 / 0.20) before concluding the model is blind.
- The hardened Dockerfile lives only in the Space repo + this skill's `templates/`;
  `ml/demo/requirements.txt` on main is unpinned and unhardened — apply the
  same hardening before any Streamlit Community Cloud deploy.
