import type { Role } from "@/types";
import { requestJson } from "@/services/apiClient";
import {
  parseIssueEdgeCredential,
  parseRedactedEdgeCredentials,
  parseRevokeEdgeCredential,
  parseRotateEdgeCredential,
} from "./edgeEnrollmentParsers";
import {
  type EdgeCredentialLifecycle,
  type IssuedEdgeCredential,
  type RedactedEdgeCredential,
  type RevokedEdgeCredential,
  type RotatedEdgeCredential,
} from "./edgeEnrollmentTypes";

export {
  EdgeEnrollmentResponseError,
  type EdgeCredentialLifecycle,
  type IssuedEdgeCredential,
  type RedactedEdgeCredential,
  type RevokedEdgeCredential,
  type RotatedEdgeCredential,
  type TopologyPreviewStatus,
} from "./edgeEnrollmentTypes";
export {
  parseIssueEdgeCredential,
  parseRedactedEdgeCredentials,
  parseTopologyPreviewStatus,
} from "./edgeEnrollmentParsers";

export type IssueEdgeCredentialRequest = {
  readonly facilityId: string;
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
};

export type ListEdgeCredentialsRequest = {
  readonly facilityId?: string;
  readonly lifecycle?: EdgeCredentialLifecycle;
  readonly signal?: AbortSignal;
};

export type CredentialMutationRequest = {
  readonly tokenId: string;
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
};

export type RevokeEdgeCredentialRequest = CredentialMutationRequest & {
  readonly expectedLifecycle: "ACTIVE" | "GRACE";
};

export async function issueEdgeCredential(
  request: IssueEdgeCredentialRequest,
): Promise<IssuedEdgeCredential> {
  const body = await requestJson(
    "/admin/edge-credentials",
    mutationOptions({
      idempotencyKey: request.idempotencyKey,
      signal: request.signal,
      body: { schemaVersion: 1, facilityId: request.facilityId },
    }),
  );
  return parseIssueEdgeCredential(body);
}

export async function listEdgeCredentials(
  request: ListEdgeCredentialsRequest = {},
): Promise<readonly RedactedEdgeCredential[]> {
  const query = new URLSearchParams();
  if (request.facilityId !== undefined)
    query.set("facilityId", request.facilityId);
  if (request.lifecycle !== undefined)
    query.set("lifecycle", request.lifecycle);
  const suffix = query.size === 0 ? "" : `?${query.toString()}`;
  const options: RequestInit = { method: "GET" };
  if (request.signal !== undefined) options.signal = request.signal;
  return parseRedactedEdgeCredentials(
    await requestJson(`/admin/edge-credentials${suffix}`, options),
  );
}

export async function rotateEdgeCredential(
  request: CredentialMutationRequest,
): Promise<RotatedEdgeCredential> {
  const body = await requestJson(
    `/admin/edge-credentials/${encodeURIComponent(request.tokenId)}/rotate`,
    mutationOptions({
      idempotencyKey: request.idempotencyKey,
      signal: request.signal,
      body: { schemaVersion: 1, expectedLifecycle: "ACTIVE" },
    }),
  );
  return parseRotateEdgeCredential(body);
}

export async function revokeEdgeCredential(
  request: RevokeEdgeCredentialRequest,
): Promise<RevokedEdgeCredential> {
  const body = await requestJson(
    `/admin/edge-credentials/${encodeURIComponent(request.tokenId)}/revoke`,
    mutationOptions({
      idempotencyKey: request.idempotencyKey,
      signal: request.signal,
      body: {
        schemaVersion: 1,
        expectedLifecycle: request.expectedLifecycle,
        reason: "ADMIN_REVOKED",
      },
    }),
  );
  return parseRevokeEdgeCredential(body);
}

export function canAdministerEdgeCredentials(role: Role | null): boolean {
  return role === "SUPER_ADMIN";
}

function mutationOptions(request: {
  readonly idempotencyKey: string;
  readonly signal: AbortSignal | undefined;
  readonly body: Record<string, string | number>;
}): RequestInit {
  const options: RequestInit = {
    method: "POST",
    headers: { "Idempotency-Key": request.idempotencyKey },
    body: JSON.stringify(request.body),
  };
  if (request.signal !== undefined) options.signal = request.signal;
  return options;
}
