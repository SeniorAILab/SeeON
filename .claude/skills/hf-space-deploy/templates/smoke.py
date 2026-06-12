"""Boot-time smoke probe: pinpoint which native call corrupts the heap.

Runs before streamlit in the container CMD; each step flushes a marker line
so the HF run log shows exactly where the glibc abort happens.
"""
import faulthandler
import subprocess

faulthandler.enable()
print("[smoke] start", flush=True)
flags = subprocess.run(
    ["grep", "-m1", "flags", "/proc/cpuinfo"], capture_output=True, text=True
).stdout
print("[smoke] cpu avx512:", "avx512f" in flags, "| amx:", "amx_tile" in flags, flush=True)

import numpy as np  # noqa: E402

print("[smoke] numpy", np.__version__, flush=True)
import cv2  # noqa: E402

print("[smoke] cv2", cv2.__version__, flush=True)
import torch  # noqa: E402

print("[smoke] torch", torch.__version__, "threads", torch.get_num_threads(), flush=True)
t = torch.randn(64, 64) @ torch.randn(64, 64)
print("[smoke] torch matmul ok", float(t.sum()), flush=True)

from ultralytics import YOLO  # noqa: E402

print("[smoke] ultralytics imported", flush=True)

from pathlib import Path  # noqa: E402

pose_files = sorted(Path("models/pose").rglob("*.pt"))
print("[smoke] pose files:", [str(p) for p in pose_files], flush=True)
model = YOLO(str(pose_files[0]))
print("[smoke] YOLO loaded", flush=True)

img = np.zeros((480, 640, 3), dtype=np.uint8)
results = model.predict(img, verbose=False)
print("[smoke] predict#1 ok", len(results), flush=True)
results = model.predict(img, verbose=False)
print("[smoke] predict#2 ok", len(results), flush=True)

import threading  # noqa: E402

def _threaded() -> None:
    nano = YOLO("models/pose/yolo26n-pose.pt")
    nano.predict(img, verbose=False)
    nano.predict(img, verbose=False)
    print("[smoke] threaded predict ok", flush=True)

th = threading.Thread(target=_threaded)
th.start()
th.join()

vw = cv2.VideoWriter("/tmp/t.avi", cv2.VideoWriter_fourcc(*"MJPG"), 25, (640, 480))
for _ in range(25):
    vw.write(img)
vw.release()
cap = cv2.VideoCapture("/tmp/t.avi")
frames = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    frames += 1
    model.predict(frame, verbose=False)
cap.release()
print("[smoke] avi decode + predict ok:", frames, "frames", flush=True)

fall = sorted(Path("models/fall").rglob("model.pt"))
print("[smoke] fall files:", [str(p) for p in fall], flush=True)
for f in fall:
    torch.load(f, map_location="cpu", weights_only=False)
    print(f"[smoke] torch.load ok: {f}", flush=True)
print("[smoke] ALL OK", flush=True)
