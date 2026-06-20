import { create } from "zustand";
import type { Level, SpaceStatusLevel } from "@/types";

// UX 검증 로그 — PoC 효과 측정용(인메모리). 개인정보 없음.
export interface UxLogEntry {
  id: string;
  spaceName: string;
  bed?: string;
  type: SpaceStatusLevel; // 발생 시 상태
  riskLevel: Level;
  detectedAt: number; // epoch ms
  ttsPlayed: boolean;
  acknowledgedAt?: number;
  ackSeconds?: number; // 확인까지 걸린 시간
  button?: string; // 확인 완료 / 방문 중 / 도움 요청
}

interface UxTestState {
  logs: UxLogEntry[];
  openBySpace: Record<string, string>; // spaceId → 미확인 logId
  logEvent: (e: {
    spaceId: string;
    spaceName: string;
    bed?: string;
    type: SpaceStatusLevel;
    riskLevel: Level;
    ttsPlayed: boolean;
  }) => void;
  logAck: (spaceId: string, button: string) => void;
  reset: () => void;
}

let seq = 0;

export const useUxTestStore = create<UxTestState>((set, get) => ({
  logs: [],
  openBySpace: {},

  logEvent: (e) => {
    // 같은 공간에 이미 미확인 로그가 있으면 중복 기록하지 않음
    if (get().openBySpace[e.spaceId]) return;
    const id = `ux_${Date.now()}_${seq++}`;
    const entry: UxLogEntry = {
      id,
      spaceName: e.spaceName,
      bed: e.bed,
      type: e.type,
      riskLevel: e.riskLevel,
      detectedAt: Date.now(),
      ttsPlayed: e.ttsPlayed,
    };
    set((s) => ({
      logs: [entry, ...s.logs],
      openBySpace: { ...s.openBySpace, [e.spaceId]: id },
    }));
  },

  logAck: (spaceId, button) => {
    const id = get().openBySpace[spaceId];
    if (!id) return;
    set((s) => {
      const logs = s.logs.map((l) =>
        l.id === id
          ? {
              ...l,
              acknowledgedAt: Date.now(),
              ackSeconds: Math.round((Date.now() - l.detectedAt) / 1000),
              button,
            }
          : l
      );
      const openBySpace = { ...s.openBySpace };
      delete openBySpace[spaceId];
      return { logs, openBySpace };
    });
  },

  reset: () => set({ logs: [], openBySpace: {} }),
}));

export function uxSummary(logs: UxLogEntry[]) {
  const acked = logs.filter((l) => l.acknowledgedAt);
  const avg =
    acked.length > 0
      ? Math.round(acked.reduce((a, l) => a + (l.ackSeconds ?? 0), 0) / acked.length)
      : 0;
  return {
    total: logs.length,
    acknowledged: acked.length,
    avgAckSeconds: avg,
    ttsPlayed: logs.filter((l) => l.ttsPlayed).length,
    helpRequests: logs.filter((l) => l.button === "도움 요청").length,
  };
}
