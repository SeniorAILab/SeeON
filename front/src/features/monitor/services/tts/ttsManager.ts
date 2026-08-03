// =============================================================
// TTS 알림 관리자 — 우선순위 큐 + 재안내 스케줄
//   · 우선순위: 응급 > 위험 > 주의
//   · 동시 다발 시에도 요약 없이 고정 템플릿 개별 안내
//   · 확인 완료(목록 제거) 시 해당 안내 중단
//   · 재생은 playTTS(브라우저 음성)
// =============================================================
import { playTTS, cancelTTS } from "./playTTS";
import type { TTSFailureReason } from "./ttsProvider";
import { textFor } from "./audioMap";
import type { AudioLevel } from "./ttsConfig";

export type TTSLevel = "EMERGENCY" | "DANGER" | "CAUTION";

export interface TTSAlertInput {
  spaceId: string;
  name: string;
  level: TTSLevel;
  reason: string;
  floorName: string;
}

const PRIORITY: Record<TTSLevel, number> = { EMERGENCY: 0, DANGER: 1, CAUTION: 2 };
const AUDIO_LEVEL: Record<TTSLevel, AudioLevel> = {
  EMERGENCY: "emergency",
  DANGER: "danger",
  CAUTION: "caution",
};
const REANNOUNCE_MS = [30_000, 120_000, 300_000]; // 30초 → 2분 → 5분

interface Item extends TTSAlertInput {
  announces: number;
  nextAt: number;
}
interface Utterance {
  priority: number;
  text: string;
}

class TTSManager {
  private items = new Map<string, Item>();
  private queue: Utterance[] = [];
  private speaking = false;
  private enabled = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  private ensureTimer() {
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1000);
  }

  update(alerts: TTSAlertInput[], enabled: boolean) {
    this.ensureTimer();
    if (!enabled) {
      if (this.enabled) this.silenceAll();
      this.enabled = false;
      return;
    }
    this.enabled = true;

    const now = Date.now();
    const incoming = new Map(alerts.map((a) => [a.spaceId, a]));

    // 제거(확인 완료/해소)
    for (const id of [...this.items.keys()]) {
      if (!incoming.has(id)) this.items.delete(id);
    }

    // 추가/격상
    for (const a of alerts) {
      const cur = this.items.get(a.spaceId);
      if (!cur) {
        this.items.set(a.spaceId, { ...a, announces: 0, nextAt: now });
      } else if (PRIORITY[a.level] < PRIORITY[cur.level]) {
        Object.assign(cur, a, { announces: 0, nextAt: now }); // 격상 → 즉시 재안내
      } else {
        cur.reason = a.reason;
      }
    }

  }

  private tick() {
    if (!this.enabled) return;
    const now = Date.now();
    const due = [...this.items.values()]
      .filter((it) => it.nextAt <= now)
      .sort((a, b) => PRIORITY[a.level] - PRIORITY[b.level]);

    for (const it of due) {
      const level = AUDIO_LEVEL[it.level];
      this.queue.push({
        priority: PRIORITY[it.level],
        text: textFor(it.name, level),
      });
      const delay = REANNOUNCE_MS[Math.min(it.announces, REANNOUNCE_MS.length - 1)];
      it.announces += 1;
      it.nextAt = now + delay;
    }
    this.drain();
  }

  private drain() {
    if (this.speaking || this.queue.length === 0 || !this.enabled) return;
    this.queue.sort((a, b) => a.priority - b.priority);
    const next = this.queue.shift()!;
    this.speaking = true;
    playTTS(next.text)
      .then((result) => {
        // 실패를 조용히 넘기면 "소리 켜짐"인데 영영 안 울리는 상태가 된다.
        setTTSFailure(result.ok ? null : result.reason);
      })
      .finally(() => {
        this.speaking = false;
        this.drain();
      });
  }

  private silenceAll() {
    cancelTTS();
    this.queue = [];
    this.items.clear();
    this.speaking = false;
  }
}

export const ttsManager = new TTSManager();

// ── 발화 실패 표면 ────────────────────────────────────────────
// TV를 켜두기만 하고 아무도 클릭하지 않으면 브라우저 autoplay 정책이 첫
// 발화를 막는다. 예전에는 그 실패를 삼켜서 "소리 켜짐"인데 영영 안 울렸다.
// UI가 이 상태를 구독해 사용자에게 무엇을 하라고 안내한다.

let failureReason: TTSFailureReason | null = null;
const failureListeners = new Set<(reason: TTSFailureReason | null) => void>();

function setTTSFailure(reason: TTSFailureReason | null): void {
  if (failureReason === reason) return;
  failureReason = reason;
  for (const listener of failureListeners) listener(reason);
}

/** 현재 발화 실패 사유. 정상이면 null. */
export function getTTSFailureReason(): TTSFailureReason | null {
  return failureReason;
}

/** 발화 실패 상태 변화를 구독한다. 해제 함수를 돌려준다. */
export function subscribeTTSFailure(
  listener: (reason: TTSFailureReason | null) => void,
): () => void {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

/** 테스트/재시도용 — 실패 상태를 지운다. */
export function clearTTSFailure(): void {
  setTTSFailure(null);
}

/**
 * 테스트 전용 — drain()이 실패를 보고하는 것과 **같은 경로**로 상태를 민다.
 * 별도 우회로가 아니라 프로덕션과 동일한 setter를 쓴다.
 */
export function __setTTSFailureForTest(reason: TTSFailureReason | null): void {
  setTTSFailure(reason);
}
