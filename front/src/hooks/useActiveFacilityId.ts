import { useParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useFacilityStore } from "@/store/facilityStore";

export function useActiveFacilityId(): string {
  const { facilityId } = useParams<{ facilityId: string }>();
  const user = useAuthStore((s) => s.user);
  const currentFacilityId = useFacilityStore((s) => s.currentFacilityId);
  return facilityId ?? currentFacilityId ?? user?.facilityId ?? "";
}
