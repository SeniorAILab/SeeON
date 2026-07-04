import { useAuthStore } from "@/stores/authStore";
import { useFacilityStore } from "@/stores/facilityStore";

export function useActiveFacilityId(): string {
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  return user?.role === "SUPER_ADMIN" ? (currentFacilityId ?? "") : (user?.facilityId ?? "");
}
