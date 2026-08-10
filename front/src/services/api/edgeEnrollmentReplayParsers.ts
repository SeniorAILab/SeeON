import {
  EdgeEnrollmentResponseError,
  type EdgeCredentialSummary,
  type EdgeInstallationState,
  type EdgeInstallationSummary,
  type EdgeOperationSummary,
  type IssuedEdgeCredential,
  type OperationStatus,
} from "./edgeEnrollmentTypes";
import {
  readCredentialLifecycle,
  readInstant,
  readNonnegativeInteger,
  readNullableInstant,
  readNullableUuid,
  readPositiveInteger,
  readRecord,
  readString,
  readTokenId,
  readUuid,
  readUuidV7,
  requireExactKeys,
  requireSchemaVersion,
} from "./edgeEnrollmentValidation";

export function parseIssueReplay(
  record: Record<string, unknown>,
): IssuedEdgeCredential {
  requireExactKeys(record, [
    "schemaVersion",
    "operation",
    "credential",
    "installation",
    "secretDisplay",
  ]);
  requireSchemaVersion(record);
  if (readString(record, "secretDisplay") !== "NOT_AVAILABLE") {
    throw new EdgeEnrollmentResponseError(
      "secretDisplay must be NOT_AVAILABLE",
    );
  }
  return {
    kind: "replay",
    operation: readOperation(record.operation),
    credential: readCredentialSummary(record.credential),
    installation: readInstallationSummary(record.installation),
    secretDisplay: "NOT_AVAILABLE",
  };
}

function readOperation(value: unknown): EdgeOperationSummary {
  const record = readRecord(value, "operation");
  requireExactKeys(record, ["operationId", "status", "createdAt", "updatedAt"]);
  return {
    operationId: readUuidV7(record, "operationId"),
    status: readOperationStatus(record),
    createdAt: readInstant(record, "createdAt"),
    updatedAt: readInstant(record, "updatedAt"),
  };
}

function readCredentialSummary(value: unknown): EdgeCredentialSummary {
  const record = readRecord(value, "credential");
  requireExactKeys(record, [
    "tokenId",
    "tokenPrefix",
    "facilityId",
    "edgeInstallationId",
    "enrollmentGeneration",
    "lifecycle",
    "issuedAt",
    "expiresAt",
    "graceExpiresAt",
    "revokedAt",
  ]);
  const tokenId = readTokenId(record, "tokenId");
  const tokenPrefix = readString(record, "tokenPrefix");
  if (tokenPrefix !== `eft_v1.${tokenId}.[redacted]`) {
    throw new EdgeEnrollmentResponseError("tokenPrefix is malformed");
  }
  return {
    tokenId,
    tokenPrefix,
    facilityId: readUuid(record, "facilityId"),
    edgeInstallationId: readUuid(record, "edgeInstallationId"),
    enrollmentGeneration: readPositiveInteger(record, "enrollmentGeneration"),
    lifecycle: readCredentialLifecycle(record),
    issuedAt: readInstant(record, "issuedAt"),
    expiresAt: readNullableInstant(record, "expiresAt"),
    graceExpiresAt: readNullableInstant(record, "graceExpiresAt"),
    revokedAt: readNullableInstant(record, "revokedAt"),
  };
}

function readInstallationSummary(value: unknown): EdgeInstallationSummary {
  const record = readRecord(value, "installation");
  requireExactKeys(record, [
    "edgeInstallationId",
    "facilityId",
    "enrollmentGeneration",
    "state",
    "clientInstallationRef",
    "acceptedClientRevision",
    "serverRevision",
  ]);
  return {
    edgeInstallationId: readUuid(record, "edgeInstallationId"),
    facilityId: readUuid(record, "facilityId"),
    enrollmentGeneration: readPositiveInteger(record, "enrollmentGeneration"),
    state: readInstallationState(record),
    clientInstallationRef: readNullableUuid(record, "clientInstallationRef"),
    acceptedClientRevision: readNonnegativeInteger(
      record,
      "acceptedClientRevision",
    ),
    serverRevision: readNonnegativeInteger(record, "serverRevision"),
  };
}

function readOperationStatus(record: Record<string, unknown>): OperationStatus {
  const status = readString(record, "status");
  switch (status) {
    case "PENDING":
    case "SUCCEEDED":
    case "FAILED":
    case "UNKNOWN":
      return status;
    default:
      throw new EdgeEnrollmentResponseError("unknown operation status");
  }
}

function readInstallationState(
  record: Record<string, unknown>,
): EdgeInstallationState {
  const state = readString(record, "state");
  switch (state) {
    case "PENDING_CLAIM":
    case "CLAIMED":
    case "REPLACED":
    case "DEACTIVATED":
      return state;
    default:
      throw new EdgeEnrollmentResponseError("unknown installation state");
  }
}
