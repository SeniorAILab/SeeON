import { useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon } from "lucide-react";
import { MonitorHeader } from "@/components/monitor/MonitorHeader";
import { CompactSpaceCard } from "@/components/monitor/CompactSpaceCard";
import { EmergencyOverlay } from "@/components/monitor/EmergencyOverlay";
import { MonitorDetailDrawer } from "@/components/monitor/MonitorDetailDrawer";
import { CurrentAttentionPanel, type AttentionItem } from "@/components/poc/CurrentAttentionPanel";
import { PatrolOrderPanel } from "@/components/poc/PatrolOrderPanel";
import { FeedbackForm } from "@/components/poc/FeedbackForm";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { dashboardService } from "@/services/dashboardService";
import { eventService } from "@/services/eventService";
import { realtimeEngine } from "@/mocks/realtimeEngine";
import { useRealtimeSpaceStatus } from "@/hooks/useRealtimeSpaceStatus";
import { useTTSAlerts, buildTTSAlerts } from "@/hooks/useTTSAlerts";
import { useMonitorStore } from "@/stores/monitorStore";
import { useMonitorSettingsStore } from "@/stores/monitorSettingsStore";
import { useUxTestStore } from "@/stores/uxTestStore";
import { useAuthStore } from "@/store/authStore";
import { canAdmin } from "@/lib/rolePolicy";
import { useFacilityStore } from "@/store/facilityStore";
import { cn } from "@/lib/utils";
import { attentionRank } from "@/lib/staffCopy";
import type { DemoMode, Facility, Floor, Level, Space } from "@/types";

const SCENARIOS: { label: string; demo: DemoMode }[] = [
  { label: "평상시", demo: "NORMAL" },
  { label: "저녁 식사 후", demo: "MEAL" },
  { label: "취침 준비", demo: "BEDTIME" },
  { label: "야간 순찰", demo: "NIGHT" },
  { label: "위험 이벤트 테스트", demo: "RISK_DEMO" },
];
const riskOf: Record<string, Level> = { DANGER: "HIGH", CAUTION: "MEDIUM", CHECK_NEEDED: "MEDIUM", STABLE: "LOW" };

export function PocFloor2Page() {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = currentFacilityId ?? user?.facilityId ?? "fac_happy_nokyang";

  const soundEnabled = useMonitorStore((s) => s.soundEnabled);
  const setSound = useMonitorStore((s) => s.setSound);
  const acknowledge = useMonitorStore((s) => s.acknowledge);
  const trigger = useMonitorStore((s) => s.trigger);
  const setDemoSetting = useMonitorSettingsStore((s) => s.update);
  const logEvent = useUxTestStore((s) => s.logEvent);
  const logAck = useUxTestStore((s) => s.logAck);

  const [facility, setFacility] = useState<Facility | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [allSpaces, setAllSpaces] = useState<Space[]>([]);
  const [scenarioIdx, setScenarioIdx] = useState(3); // 기본: 야간 순찰
  const [selected, setSelected] = useState<Space | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevAttention = useRef<Set<string>>(new Set());

  useEffect(() => {
    dashboardService.getDashboard(facilityId).then((d) => {
      setFacility(d.facility);
      setFloors(d.floors);
      setAllSpaces(d.spaces);
    });
  }, [facilityId]);

  const floor2 = floors.find((f) => f.name === "2F");
  const spaces2F = useMemo(
    () => allSpaces.filter((s) => s.isActive && s.floorId === floor2?.id),
    [allSpaces, floor2]
  );

  const { statuses, summary, totalPeople, connection, lastUpdateAt } = useRealtimeSpaceStatus(
    facilityId,
    spaces2F
  );

  // 시나리오 → 엔진 (UX 검증 프로파일: 알림 빈도 낮춤)
  useEffect(() => {
    realtimeEngine.setProfile("POC_2F");
    realtimeEngine.setDemoMode(SCENARIOS[scenarioIdx].demo);
    return () => realtimeEngine.setProfile("DEFAULT");
  }, [scenarioIdx]);

  const sorted = useMemo(
    () =>
      [...spaces2F].sort(
        (a, b) =>
          attentionRank[statuses[a.id]?.status ?? "STABLE"] -
          attentionRank[statuses[b.id]?.status ?? "STABLE"]
      ),
    [spaces2F, statuses]
  );

  // 현재 확인 필요 (침대/사유는 이벤트에서만)
  const attention: AttentionItem[] = useMemo(() => {
    return sorted
      .filter((s) => (statuses[s.id]?.status ?? "STABLE") !== "STABLE")
      .map((s) => {
        const st = statuses[s.id]!;
        const ev = eventService.openForSpace(s.id);
        return { space: s, status: st, bed: ev?.zoneName, desc: ev?.message ?? st.aiSummary };
      });
  }, [sorted, statuses]);

  const emergencySpace = attention.find((a) => a.status.emergency)?.space;

  // TTS (이름 없이 공간/구역 단위)
  const ttsAlerts = useMemo(() => buildTTSAlerts(spaces2F, statuses, floors), [spaces2F, statuses, floors]);
  useTTSAlerts(ttsAlerts, soundEnabled);

  // UX 검증 로그 — 새 이벤트 기록
  useEffect(() => {
    const ids = new Set(attention.map((a) => a.space.id));
    for (const a of attention) {
      if (!prevAttention.current.has(a.space.id)) {
        logEvent({
          spaceId: a.space.id,
          spaceName: a.space.name,
          bed: a.bed,
          type: a.status.status,
          riskLevel: riskOf[a.status.status],
          ttsPlayed: soundEnabled,
        });
      }
    }
    prevAttention.current = ids;
  }, [attention, soundEnabled, logEvent]);

  // 추천 순찰 순서
  const patrol = useMemo(() => {
    if (attention.length > 0) return attention.slice(0, 4).map((a) => a.space.name);
    return ["중앙복도", "좌측복도", "우측복도"];
  }, [attention]);

  function handleAck(spaceId: string) {
    logAck(spaceId, "확인 완료");
    acknowledge(spaceId);
  }

  function emergencyTest() {
    const target = spaces2F.find((s) => s.id === "sp_203") ?? spaces2F.find((s) => s.type === "ROOM");
    if (target) trigger(target.id, true);
  }

  const nightMode = useMonitorSettingsStore((s) => s.nightMode);
  const floorOf = (id: string) => floors.find((f) => f.id === id);
  // 관찰자(관리자)만 테스트 컨트롤을 본다. 선생님 화면은 평범한 "2층 안전 현황"처럼 보인다.
  const observer = canAdmin(user);

  if (!facility) {
    return <div className="flex min-h-screen items-center justify-center bg-bg text-xl text-ink-soft">2층 검증 화면을 준비하는 중...</div>;
  }

  return (
    <div ref={rootRef} className={nightMode ? "dark" : ""}>
      <div className="min-h-screen bg-bg p-4 2xl:p-6">
        <MonitorHeader
          facilityName={facility.name}
          floorTitle="2층"
          summary={summary}
          totalPeople={totalPeople}
          connection={connection}
          lastUpdateAt={lastUpdateAt}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSound(!soundEnabled)}
          fullscreenRef={rootRef}
        />

        {/* 시나리오 + 테스트 — 관찰자(관리자)에게만 보임. 선생님 화면엔 노출 안 됨. */}
        {observer && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-surface2 p-2">
            <span className="text-xs font-bold text-ink-faint">관찰자 전용 · 시나리오</span>
            {SCENARIOS.map((sc, i) => (
              <button
                key={sc.label}
                onClick={() => {
                  setScenarioIdx(i);
                  setDemoSetting({ demoMode: sc.demo });
                }}
                className={cn(
                  "min-h-[40px] rounded-lg px-3 text-sm font-bold",
                  scenarioIdx === i ? "bg-ink text-surface" : "border-2 border-border text-ink-soft hover:bg-surface"
                )}
              >
                {sc.label}
              </button>
            ))}
            <button
              onClick={emergencyTest}
              className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-status-danger px-3 text-sm font-bold text-white hover:brightness-110"
            >
              <AlertOctagon className="h-4 w-4" />
              응급 테스트
            </button>
          </div>
        )}

        <PrivacyNotice className="mt-2 justify-start" />

        {/* 본문: 좌측 14카드 / 우측 확인필요+순찰 */}
        <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
              {sorted.map((s) => (
                <CompactSpaceCard
                  key={s.id}
                  space={s}
                  status={statuses[s.id]}
                  dimmed={!!emergencySpace}
                  onClick={() => setSelected(s)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <CurrentAttentionPanel items={attention} onAck={handleAck} onSelect={setSelected} />
            <PatrolOrderPanel order={patrol} allStable={attention.length === 0} />
            {observer && <FeedbackForm />}
          </div>
        </div>

        {emergencySpace && (
          <EmergencyOverlay
            space={emergencySpace}
            floor={floorOf(emergencySpace.floorId)}
            status={statuses[emergencySpace.id]}
            others={attention.length - 1}
            onAck={() => handleAck(emergencySpace.id)}
            onDetail={() => setSelected(emergencySpace)}
          />
        )}

        {selected && (
          <MonitorDetailDrawer
            space={selected}
            floor={floorOf(selected.floorId)}
            status={statuses[selected.id]}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
