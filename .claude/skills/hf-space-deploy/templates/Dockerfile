FROM python:3.11-slim

# libglib2.0-0: opencv-python-headless needs gthread even without a display.
# libtcmalloc-minimal4: faulthandler traces show glibc-malloc heap corruption
# (fuse() abort, conv segfault) whenever torch's first inference overlaps any
# other native thread; tcmalloc's thread-caching allocator sidesteps the race.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 \
    && (apt-get install -y --no-install-recommends libtcmalloc-minimal4 \
        || apt-get install -y --no-install-recommends libtcmalloc-minimal4t64) \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/lib/x86_64-linux-gnu/libtcmalloc_minimal.so.4 /usr/local/lib/libtcmalloc_minimal.so

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    # Single-threaded BLAS/OpenMP: torch and opencv must not spin rival pools
    # on the 2-vCPU Space.
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    YOLO_CONFIG_DIR=/tmp/Ultralytics \
    # Keep ultralytics fully offline: its analytics thread (events.py _post)
    # was mid-SSL-handshake at the moment of the conv segfault.
    YOLO_OFFLINE=True \
    # Sidestep AVX-512 conv kernels; the Space host advertises avx512f and the
    # segfault is inside the first fused conv forward.
    ATEN_CPU_CAPABILITY=avx2 \
    LD_PRELOAD=/usr/local/lib/libtcmalloc_minimal.so

WORKDIR /home/user/app

COPY --chown=user requirements.txt .
# ultralytics declares opencv-python (GUI build, needs libxcb/libGL); force the
# headless wheel back as the sole cv2 provider so the slim image stays GUI-free.
RUN pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y opencv-python \
    && pip install --no-cache-dir --force-reinstall "opencv-python-headless>=4.10"

COPY --chown=user . .

EXPOSE 7860
# settings.update(sync=False) persists the no-telemetry choice into the runtime
# settings file (YOLO_CONFIG_DIR is tmpfs, so it must happen at boot, not build).
# fileWatcherType=none: watchdog's inotify threads raced torch's allocator
# during fuse(); the image is immutable so hot-reload watching is dead weight.
CMD ["bash", "-c", "python -c 'from ultralytics import settings; settings.update(sync=False)'; python smoke.py; exec streamlit run demo/app.py --server.port=7860 --server.address=0.0.0.0 --server.headless=true --server.fileWatcherType=none"]
