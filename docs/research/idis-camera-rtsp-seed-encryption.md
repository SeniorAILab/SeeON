# IDIS 카메라 RTSP 연결 / SEED-128 암호화 게이트 (finding)

IDIS IP 카메라(WebGuard 펌웨어)에서 RTSP 스트림을 ffmpeg/VLC/OpenCV로 받을 때의 연결 절차와, 모든 클라이언트가 `DESCRIBE`에서 막히는 SEED-128 암호화 게이트의 진단·해제 방법을 정리한다. production 낙상 live path는 `RTSP -> ml-worker -> ml-api -> backend /api/v1/events`이며(ADR-067/029), 카메라 자체의 연결성은 이 path와 무관한 하드웨어 사전조건이다.

> 실측(2026-06-22, `10.10.79.121`): IDIS WebGuard 카메라를 SEED 암호화 OFF 상태로 연결했다. 트리플 스트림이 전부 HEVC(H.265) Main이었고 trackID=1은 `1920×1080@30`, trackID=2는 `640×360@30`, trackID=3은 `352×240@15`였다. H.264 트랙은 없었다. ML 입력은 추론 부하와 프레임율 균형 때문에 trackID=2를 권장한다. 실제 IP와 자격증명은 git 밖 local config에만 둔다.

## TL;DR

```bash
vlc --rtsp-tcp "rtsp://<camera-host>:554/trackID=1"
ffprobe -rtsp_transport tcp "rtsp://<camera-host>:554/trackID=1"
```

- URL 형식은 `rtsp://<camera-host>:554/trackID=#`이고 `#`는 1~3의 트리플 스트림이다. 인증이 필요한 장비의 user-info는 git 밖 local secret config에만 둔다.
- 막히면 십중팔구 카메라의 SEED-128 스트림 암호화가 켜져 있는 것이고, 카메라 웹설정에서 끄면 된다.

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

- Wi-Fi가 service order 1순위면 랜선을 꽂아도 인터넷은 Wi-Fi로 유지되고 랜선은 카메라망 접근용으로만 쓰인다(그대로 두면 된다).
- DHCP가 IP를 안 주면 수동으로 설정한다: `sudo ifconfig en8 inet 10.10.79.50 netmask 255.255.0.0`.

## 1. 증상: 모든 클라이언트가 DESCRIBE에서 454

```
OPTIONS   → 200 OK
DESCRIBE  → 401 → (digest 인증) → 454 Session Not Found
```

ffmpeg, VLC(live555), raw 소켓이 전부 동일하게 454를 낸다. 경로나 형식 문제가 아니다.

## 2. 진단: 인증 vs 암호화 게이트 구분

454는 인증이 아니라 암호화 게이트다. 두 개를 칼같이 구분하는 테스트는 다음과 같다.

```bash
# 틀린 비번 → 401 (인증 게이트), 맞는 비번 → 454 (암호화 게이트)
ffprobe -rtsp_transport tcp "rtsp://<camera-host>:554/trackID=1"
```

- 틀린 비번에도 454가 나오면 진짜 비번이 다른 것이다(인증 문제).
- 틀린 비번은 401, 맞는 비번은 454면 인증은 통과한 것이고 암호화가 범인이다.

암호화 헤더는 OPTIONS 응답에 박혀 있으니 직접 확인한다.

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

암호화가 ON이면 응답에 다음 두 줄이 보인다.

```
Security-Type: SEED_128/video1;sps
Data-Encryption: partial
```

이 두 줄이 사라지면 암호화 OFF, 즉 연결 가능한 상태다.

> SEED-128은 IDIS 독자(KISA) 암호화라서 ffmpeg/VLC/OpenCV 어디에도 복호화 코드가 없어 클라이언트로는 우회가 불가능하다. 서버가 DESCRIBE 응답(SDP) 자체를 안 주기 때문에 복호화 시도 단계조차 가지 못한다.

## 3. 해결: 카메라에서 SEED 암호화 끄기

1. 브라우저로 `https://<ip>`에 접속해 WebGuard에 로그인한다(`<rtsp-user>` / `<rtsp-password>`).
2. Setup → System/Network → 보안/암호화에서 전송·데이터 암호화(SEED)를 OFF로 둔다. 끌 것은 "데이터 암호화 / 스트림 암호화 / SEED / 영상 암호화"이고, `SSL`·`HTTPS`·`RTP 전송`은 꺼봐야 소용없으니 헷갈리지 않는다.
3. 저장(Apply)한다. 반영이 안 되면 카메라를 재부팅한다.
4. 위 2번 OPTIONS 스크립트로 `Security-Type` 줄이 사라졌는지 확인한다.

> 설정 UI(WebGuard)는 JS/애플릿이라 curl REST로는 안 되고(설정 엔드포인트 404) 브라우저로 사람이 직접 꺼야 한다. IDIS DirectIP 독자 포트(예: 8016)는 SDK가 필요하다.

## 4. 검증

```bash
ffprobe -rtsp_transport tcp "rtsp://<camera-host>:554/trackID=1"
# 정상: Video: hevc (Main) 1920x1080 30 fps 같은 스트림 정보

vlc --rtsp-tcp "rtsp://<camera-host>:554/trackID=1"
ffmpeg -rtsp_transport tcp -i "rtsp://<camera-host>:554/trackID=1" -frames:v 1 /tmp/cam.jpg
```

- 코덱이 HEVC(H.265)일 수 있다. OpenCV/ffmpeg 디코딩이 안 되면 카메라에서 trackID 하나를 H.264로 바꾸거나 서브스트림(`trackID=2`)을 쓴다.
- ONVIF 경로(`rtsp://<ip>:554/onvif/media2?profile=Profile1`)도 동작하고 ONVIF GetStreamUri가 URI를 알려주지만, 암호화 게이트는 동일하게 적용된다.

### 실측 코덱 (2026-06-22, `10.10.79.121`)

| 스트림 | trackID | 코덱 | 프로파일 | 해상도 | FPS | 픽셀포맷 |
|---|---|---|---|---|---|---|
| 메인 | 1 | HEVC (H.265) | Main (lvl 4.0) | 1920×1080 | 30 | yuvj420p |
| 서브 | 2 | HEVC (H.265) | Main | 640×360 | 30 | yuvj420p |
| 서브 | 3 | HEVC (H.265) | Main | 352×240 | 15 | yuvj420p |

- 세 트랙 다 H.265이고 H.264 트랙은 없다. 각 트랙에는 `data` 타입 채널(메타데이터)이 하나씩 동반되는데 영상과는 무관하다.
- ML 추론 입력은 trackID=2(640×360@30)를 권장한다. 1080p 대비 부하가 낮고, trackID=3(15fps)보다 낙상 같은 빠른 동작 포착에 유리하다.

## 막다른 길 (시도하지 말 것)

- VLC GUI로 우회하는 것은 안 된다. VLC도 같은 live555 엔진이라 동일하게 454가 난다.
- ONVIF GetStreamUri로 우회하는 것도 안 된다. 받은 URI도 같은 암호화 서버를 경유하므로 454다.
- digest uri 형식 변형(절대/경로/포트)도 안 된다. 인증은 이미 통과한 상태다(454지 401이 아니다).
- macOS 26 + VLC 3.0.23 GUI는 클릭 시 크래시하므로(호환성) CLI(`cvlc`)나 ffmpeg로 테스트한다.

## worker 소비 경로

연결에 성공한 RTSP URL을 worker가 소비하는 절차(per-camera YAML, smoke 스크립트)는 README의 edge Compose 단락과 `scripts/ml-worker-rtsp-smoke.sh`, `scripts/ml-worker-nursing-home-backend-e2e.sh`를 따른다. config 계약의 SSOT는 `ml/config/ml-worker.example.yaml`이다.
