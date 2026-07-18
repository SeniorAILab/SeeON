import { requestJson } from "@/services/apiClient";

export type DashboardReceiptKind = "delivery" | "presentation";

export interface DashboardReceiptRequestDto {
  dashboardClientId: string;
  backendEventId: string;
  alertId: string;
  alertSeq: string;
  observedAt: string;
  surface?: string;
}

export interface DashboardReceiptResponse {
  deliveryId?: string;
  presentationId?: string;
  backendEventId: string;
  alertId: string;
  alertSeq: string;
  kind: DashboardReceiptKind;
  surface: string;
  observedAt: string;
  recordedAt: string;
  duplicate: boolean;
}

export async function postDashboardReceipt(
  kind: DashboardReceiptKind,
  body: DashboardReceiptRequestDto,
): Promise<DashboardReceiptResponse> {
  const value = await requestJson(`/dashboard/receipts/${kind}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapDashboardReceiptDto(value, kind);
}

function mapDashboardReceiptDto(
  value: unknown,
  kind: DashboardReceiptKind,
): DashboardReceiptResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid dashboard receipt response");
  }
  const receipt = value as Record<string, unknown>;
  const idKey = kind === "delivery" ? "deliveryId" : "presentationId";
  if (
    typeof receipt[idKey] !== "string" ||
    typeof receipt.backendEventId !== "string" ||
    typeof receipt.alertId !== "string" ||
    typeof receipt.alertSeq !== "string" ||
    receipt.kind !== kind
  ) {
    throw new Error("Invalid dashboard receipt response");
  }
  return receipt as unknown as DashboardReceiptResponse;
}
