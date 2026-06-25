# IDIS 카메라 RTSP 연결 런북

IDIS IP 카메라(WebGuard 펌웨어)에서 RTSP 스트림을 ffmpeg/VLC/OpenCV로 받는 절차.
낙상 production live path는 `RTSP -> ml-worker -> ml-api -> backend /ingest/*`다(ADR-067/029).
FastAPI(`ml-api`)는 private/local health/status/models/debug/control API이자 backend ingest 관문이며
production RTSP와 raw frame relay는 소유하지 않는다.

> 실제 사례(2026-06-22): IDIS WebGuard 카메라, SEED 암호화 OFF 상태로 연결.
> 트리플 스트림 전부 **HEVC(H.265) Main**: trackID=1 `1920×1080@30`, trackID=2 `640×360@30`, trackID=3 `352×240@15`. H.264 트랙 없음. ML 입력은 trackID=2 권장(추론 부하/프레임율 균형). 실제 IP와 자격증명은 git 밖의 local config에만 둔다.

## TL;DR

```bash
vlc --rtsp-tcp "rtsp://<camera-host>:554/trackID=1"
ffprobe -rtsp_transport tcp "rtsp://<camera-host>:554/trackID=1"
```

- URL 형식: `rtsp://<camera-host>:554/trackID=#` (`#` = 1~3, 트리플 스트림). 인증 정보가 필요한 장비의 user-info는 git 밖 local secret config에만 둔다.
- **막히면 십중팔구 카메라의 SEED-128 스트림 암호화가 켜져 있는 것.** 카메라 웹설정에서 끄면 됨.

## 0. 네트워크 (랜선 직결 시)

카메라는 IDIS NVR PoE 스위치/전용망(예: `10.10.x.x /16`)에 붙어있는 경우가 많다.

```bash
# 이더넷 링크/IP 확인 (DHCP가 10.10.x 대역 줘야 함)
for i in en8 en10 en4 en5 en6; do
  echo "$i -> $(ifconfig $i 2>/dev/null | awk '/status:/{print $2}') $(ipconfig getifaddr $i 2>/dev/null)"
done
ping -c2 <ip>            # 카메라 핑
nc -z -G2 <ip> 554       # RTSP 포트
```

- Wi-Fi가 service order 1순위면 랜선 꽂아도 인터넷은 Wi-Fi 유지, 랜선은 카메라망 접근용으로만 쓰임 (그대로 두면 됨).
- DHCP가 IP를 안 주면 수동: `sudo ifconfig en8 inet 10.10.79.50 netmask 255.255.0.0`

## 1. 증상: 모든 클라이언트가 DESCRIBE에서 454

```
OPTIONS   → 200 OK
DESCRIBE  → 401 → (digest 인증) → 454 Session Not Found
```

ffmpeg, VLC(live555), raw 소켓 전부 동일하게 454. **경로/형식 문제가 아니다.**

## 2. 진단: 인증 vs 암호화 게이트 구분

454는 인증이 아니라 **암호화 게이트**다. 두 개를 칼같이 구분하는 테스트:

```bash
# 틀린 비번 → 401 (인증 게이트), 맞는 비번 → 454 (암호화 게이트)
ffprobe -rtsp_transport tcp "rtsp://<camera-host>:554/trackID=1"
ffprobe -rtsp_transport tcp "rtsp://<camera-host>:554/trackID=1"
```

- 틀린 비번도 454면 → 진짜 비번이 다른 것 (인증 문제)
- 틀린 비번=401, 맞는 비번=454면 → **인증 OK, 암호화가 범인**

암호화 헤더 직접 확인 (OPTIONS 응답에 박혀있음):

```bash
python3 - <<'PY'
import socket
IP,PORT="<ip>",554
s=socket.create_connection((IP,PORT),5); s.settimeout(4)
s.sendall(f"OPTIONS rtsp://{IP}:{PORT}/trackID=1 RTSP/1.0\r\nCSeq:1\r\n\r\n".encode())
d=b""
while b"\r\n\r\n" not in d:
    c=s.recv(4096)
    if not c: break
    d+=c
print(d.decode(errors='replace'))
PY
```

암호화 ON이면:
```
Security-Type: SEED_128/video1;sps
Data-Encryption: partial
```
이 두 줄이 **사라지면** 암호화 OFF = 연결 가능 상태.

> SEED-128은 IDIS 독자(KISA) 암호화. ffmpeg/VLC/OpenCV 어디에도 복호화 코드가 없어서
> **클라이언트로는 우회 불가**. 서버가 DESCRIBE 응답(SDP) 자체를 안 준다 → 복호화 시도 단계조차 못 감.

## 3. 해결: 카메라에서 SEED 암호화 끄기

1. 브라우저로 `https://<ip>` 접속 → WebGuard 로그인 (`<rtsp-user>` / `<rtsp-password>`)
2. **Setup → System/Network → 보안/암호화** 에서 **전송·데이터 암호화(SEED) OFF**
   - 끌 것: "데이터 암호화 / 스트림 암호화 / SEED / 영상 암호화"
   - **헷갈리지 말 것** (이거 꺼봐야 소용 없음): `SSL`, `HTTPS`, `RTP 전송`
3. 저장(Apply). 반영 안 되면 카메라 재부팅.
4. 위 2번 OPTIONS 스크립트로 `Security-Type` 줄 사라졌는지 확인.

> 참고: 설정 UI(WebGuard)는 JS/애플릿이라 curl REST로는 안 됨(설정 엔드포인트 404). **브라우저로 사람이 직접** 꺼야 한다. IDIS DirectIP 독자 포트(예: 8016)는 SDK 필요.

## 4. 검증

```bash
ffprobe -rtsp_transport tcp "rtsp://<camera-host>:554/trackID=1"
# 정상: Video: hevc (Main) 1920x1080 30 fps 같은 스트림 정보

vlc --rtsp-tcp "rtsp://<camera-host>:554/trackID=1"
ffmpeg -rtsp_transport tcp -i "rtsp://<camera-host>:554/trackID=1" -frames:v 1 /tmp/cam.jpg
```

- 코덱이 **HEVC(H.265)** 일 수 있음. OpenCV/ffmpeg 디코딩 안 되면 카메라에서 trackID 하나를 H.264로 바꾸거나 서브스트림(`trackID=2`) 사용.
- ONVIF 경로도 동작: `rtsp://<ip>:554/onvif/media2?profile=Profile1` (ONVIF GetStreamUri가 알려줌). 단 암호화 게이트는 동일하게 적용됨.

### 실측 코덱 (2026-06-22, `10.10.79.121`)

| 스트림 | trackID | 코덱 | 프로파일 | 해상도 | FPS | 픽셀포맷 |
|---|---|---|---|---|---|---|
| 메인 | 1 | HEVC (H.265) | Main (lvl 4.0) | 1920×1080 | 30 | yuvj420p |
| 서브 | 2 | HEVC (H.265) | Main | 640×360 | 30 | yuvj420p |
| 서브 | 3 | HEVC (H.265) | Main | 352×240 | 15 | yuvj420p |

- 세 트랙 다 H.265 (H.264 트랙 없음). 각 트랙에 `data` 타입 채널(메타데이터) 1개씩 동반 — 영상 무관.
- ML 추론 입력은 **trackID=2 (640×360@30)** 권장: 1080p 대비 부하 낮고, trackID=3(15fps)보다 낙상 같은 빠른 동작 포착에 유리.

## 5. 4대 카메라 edge-worker smoke

백엔드에서 카메라 4대를 먼저 등록해 각 카메라의 `camera_id`, `ingest_key_id`, one-time `ingest_secret`, `facility_id`, 필요 시 `resident_id`를 확보한다. `ingest_secret`은 camera 생성 응답에서 한 번만 반환되며 list/get/update 응답에는 다시 나오지 않는다. edge 장비에는 git 밖 local 파일로만 config를 둔다. 이미 생성된 카메라의 secret을 잃어버렸다면 별도 rotation endpoint가 생기기 전까지는 카메라를 재생성한다.

```bash
cp ml/config/ml-worker.example.yaml /tmp/eldercare-ml-worker-rtsp.yaml
chmod 600 /tmp/eldercare-ml-worker-rtsp.yaml
```

`/tmp/eldercare-ml-worker-rtsp.yaml`에 camera entry를 실제 값으로 채운다. RTSP URL은 보통 서브스트림을 쓴다. 이 파일이 `EDGE_CAMERA_CONFIG`이고, per-camera RTSP URL과 LSTM fall model artifact 계약을 가진다. backend `/ingest/*` key/secret은 ADR-067/029에 따라 `ml-api` 설정에 둔다.

```yaml
version: 1
relay:
  url: http://ml-api:8000
  token: local-ml-api-relay-token
models:
  fall:
    type: lstm
    framework: pytorch
    mode: sequence
    artifact_dir: /app/models/fall/lstm
    weights: model.pt
    architecture: arch.json
    metadata: metadata.yaml
cameras:
  - camera_id: backend-camera-id
    facility_id: backend-facility-id
    resident_id: backend-resident-id-or-null
    rtsp_url: rtsp://<camera-host>:554/trackID=2
```

config 문법만 확인:

```bash
EDGE_CAMERA_CONFIG=/tmp/eldercare-ml-worker-rtsp.yaml \
  uv run --directory ml python -m runtime.edge_worker_config --check

uv run --directory ml python -m worker.edge_worker \
  --config /tmp/eldercare-ml-worker-rtsp.yaml \
  --check-config
```

Nursing-home 영상 기반 production-shaped RTSP E2E:

```bash
NURSING_HOME_FALL_VIDEO=/path/to/nursing-home-fall.mp4 \
ML_MODELS_DIR=/path/to/ml/models \
DEMO_INGEST_SECRET=<seeded-demo-ingest-secret> \
scripts/ml-worker-nursing-home-backend-e2e.sh
```

개발 중 worker가 계속 소비할 RTSP 입력만 필요하면 같은 publisher를 직접 띄운다:

```bash
pnpm dev:rtsp -- /path/to/nursing-home-fall.mp4
```

이 명령은 영상을 반복 재생하며 `rtsp://127.0.0.1:8554/nursing-home`을 유지한다. `ml-worker.local.yaml`의 camera `rtsp_url`을 이 값으로 두면, 개발자는 실제 worker 소비 경로로 계속 작업할 수 있다. E2E 명령은 같은 `scripts/rtsp-loop-video.sh` publisher를 Docker network 안에서 재사용하고, `compose.edge.yaml`의 `ml-worker` production entrypoint가 그 RTSP를 소비하게 한다. alert/heartbeat는 stub이 아니라 `ml-api`를 통해 실제 backend `/ingest/*`로 전송하며, 마지막에 backend DB의 `alerts` 테이블에 낙상 alert가 기록됐는지 확인한다.

Edge Compose 기동은 실제 camera config를 secret으로 마운트한다:

```bash
EDGE_CAMERA_CONFIG=/tmp/eldercare-ml-worker-rtsp.yaml \
  docker compose -f compose.edge.yaml up -d --build
```

실제 스트림과 worker 유한 실행 smoke:

```bash
EDGE_CAMERA_CONFIG=/tmp/eldercare-ml-worker-rtsp.yaml \
  MAX_FRAMES_PER_CAMERA=30 \
  scripts/ml-worker-rtsp-smoke.sh
```

이 smoke는 YAML의 각 RTSP URL을 `ffprobe -rtsp_transport tcp`로 먼저 확인하고, 그 다음 `worker.edge_worker`를 configured cameras에 대해 `--max-frames-per-camera`로 실행한다. `/tmp/eldercare-ml-worker-rtsp.yaml`이 없으면 실제 카메라 검증은 할 수 없다. Jetson Nano 검증은 legacy/constrained hardware-gated smoke로만 기록하고, 일반 GPU 지원으로 주장하지 않는다.

## 막다른 길 (시도하지 말 것)

- VLC GUI로 우회 → 안 됨. VLC도 같은 live555 엔진 → 동일 454.
- ONVIF GetStreamUri로 우회 → 안 됨. 받은 URI도 같은 암호화 서버 경유 → 454.
- digest uri 형식 변형(절대/경로/포트) → 안 됨. 인증은 이미 통과 상태(454지 401 아님).
- macOS 26 + VLC 3.0.23 GUI는 클릭 시 크래시함(호환성). CLI(`cvlc`)나 ffmpeg로 테스트할 것.
