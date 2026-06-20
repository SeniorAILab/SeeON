import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, LayoutGrid, ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { dashboardService } from "@/services/dashboardService";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";
import { useMonitorSettingsStore } from "@/stores/monitorSettingsStore";
import { spaceTypeLabel } from "@/lib/labels";
import type { Floor, Space } from "@/types";

export function FloorSelectorPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  const facilityId = currentFacilityId ?? user?.facilityId ?? "fac_happy_nokyang";
  const allowAllView = useMonitorSettingsStore((s) => s.allowAllView);
  const nightMode = useMonitorSettingsStore((s) => s.nightMode);

  const [facilityName, setFacilityName] = useState("");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);

  useEffect(() => {
    dashboardService.getDashboard(facilityId).then((d) => {
      setFacilityName(d.facility.name);
      setFloors(d.floors);
      setSpaces(d.spaces);
    });
  }, [facilityId]);

  function floorSummary(floorId: string): string {
    const list = spaces.filter((s) => s.floorId === floorId);
    const types = Array.from(new Set(list.map((s) => spaceTypeLabel[s.type])));
    return types.slice(0, 2).join(" · ");
  }

  return (
    <div className={nightMode ? "dark" : ""}>
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6">
        <button
          onClick={() => navigate(-1)}
          className="absolute left-5 top-5 inline-flex items-center gap-1.5 text-base text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="h-5 w-5" /> 돌아가기
        </button>

        <LogoMark size={56} className="mb-4" />
        <div className="mb-1 flex items-center gap-2 text-xl text-ink-soft">
          <Building2 className="h-5 w-5" /> {facilityName}
        </div>
        <h1 className="mb-3 text-3xl font-extrabold text-ink 2xl:text-4xl">
          표시할 층을 선택해주세요
        </h1>
        <PrivacyNotice className="mb-8" />

        <div className="grid w-full max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3">
          {floors.map((f) => (
            <button
              key={f.id}
              onClick={() => navigate(`/monitor/floor/${f.id}`)}
              className="rounded-2xl border-2 border-border bg-surface px-5 py-7 text-center shadow-card transition-transform hover:scale-[1.03] hover:border-brand/50"
            >
              <div className="text-4xl font-extrabold text-ink 2xl:text-5xl">{f.name}</div>
              <div className="mt-2 text-base text-ink-soft">{floorSummary(f.id)}</div>
            </button>
          ))}

          {allowAllView && (
            <button
              onClick={() => navigate("/monitor/all")}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-brand/40 bg-brand-soft px-5 py-7 text-center text-brand transition-transform hover:scale-[1.03]"
            >
              <LayoutGrid className="mb-2 h-8 w-8" />
              <div className="text-2xl font-extrabold 2xl:text-3xl">전체 보기</div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
