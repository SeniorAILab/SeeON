// =============================================================
// TTS 알림 관리자 — 우선순위 큐 + 재안내 스케줄
//   · 우선순위: 응급 > 위험 > 주의
//   · 동시 다발 시 먼저 요약 안내 후 개별 안내
//   · 동일 이벤트 중복 재생 금지, 재안내 30초 → 2분 → 5분
//   · 확인 완료(목록 제거) 시 해당 안내 중단
//   · 재생은 playTTS(사전 생성 mp3 우선, 없으면 브라우저 음성)
// =============================================================
import { playTTS, cancelTTS } from "./playTTS";
import { audioPathFor, summaryPath, summaryMessage, textFor } from "./audioMap";
import type { AudioLevel, SpaceCategory } from "./ttsConfig";

export type TTSLevel = "EMERGENCY" | "DANGER" | "CAUTION";

export interface TTSAlertInput {
  spaceId: string;
  name: string;
  level: TTSLevel;
  reason: string;
  floorName: string;
  category: SpaceCategory;
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
  path?: string;
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
    let newCount = 0;
    for (const a of alerts) {
      const cur = this.items.get(a.spaceId);
      if (!cur) {
        this.items.set(a.spaceId, { ...a, announces: 0, nextAt: now });
        newCount++;
      } else if (PRIORITY[a.level] < PRIORITY[cur.level]) {
        Object.assign(cur, a, { announces: 0, nextAt: now }); // 격상 → 즉시 재안내
        newCount++;
      } else {
        cur.reason = a.reason;
      }
    }

    // 동시 다발: 먼저 요약 안내
    if (newCount > 1) {
      this.queue.push({
        priority: -1,
        text: summaryMessage(this.items.size),
        path: summaryPath,
      });
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
        text: textFor(it.category, level, it.name),
        path: audioPathFor({ category: it.category, level, name: it.name, floorName: it.floorName }),
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
    playTTS(next.text, next.path).finally(() => {
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
