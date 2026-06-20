// 위험 알림 신호: 소리(짧은 경고음) + 진동
// 색약/청각 사용자를 위해 화면 강조와 함께 보조적으로만 사용한다.

let ctx: AudioContext | null = null;

export function playAlertSound() {
  try {
    // ponytail: dropped webkitAudioContext fallback — unprefixed AudioContext is
    // supported in all target browsers (Safari ≥14.1, 2021).
    ctx = ctx ?? new AudioContext();
    const now = ctx.currentTime;
    // 부드러운 2음 알림 (자극적이지 않게)
    [880, 660].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.22);
    });
  } catch {
    /* 자동재생 정책으로 막힐 수 있음 — 무시 */
  }
}

export function vibrateAlert() {
  if ("vibrate" in navigator) {
    navigator.vibrate?.([200, 100, 200]);
  }
}

export function signalDanger(soundEnabled: boolean) {
  if (!soundEnabled) return;
  playAlertSound();
  vibrateAlert();
}
