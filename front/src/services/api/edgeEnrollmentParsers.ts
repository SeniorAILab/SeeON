import {
  EdgeEnrollmentResponseError,
  type RedactedEdgeCredential,
  type RevokedEdgeCredential,
} from "./edgeEnrollmentTypes";
import {
  readBoundedString,
  readCredentialLifecycle,
  readInstant,
  readPositiveInteger,
  readRecord,
  readString,
  readTokenId,
  readUuid,
  readUuidV7,
  requireExactKeys,
  requireSchemaVersion,
} from "./edgeEnrollmentValidation";

export {
  parseIssueEdgeCredential,
  parseRotateEdgeCredential,
} from "./edgeEnrollmentCredentialParsers";
export { parseTopologyPreviewStatus } from "./edgeTopologyParsers";

export function parseRedactedEdgeCredentials(
  value: unknown,
): readonly RedactedEdgeCredential[] {
  const record = readRecord(value, "root");
  requireExactKeys(record, ["schemaVersion", "items"]);
  requireSchemaVersion(record);
  if (!Array.isArray(record.items)) {
    throw new EdgeEnrollmentResponseError("items must be an array");
  }
  return record.items.map(parseRedactedCredential);
}

export function parseRevokeEdgeCredential(
  value: unknown,
): RevokedEdgeCredential {
  const record = readRecord(value, "root");
  requireExactKeys(record, [
    "schemaVersion",
    "operationId",
    "tokenId",
    "lifecycle",
    "revokedAt",
  ]);
  requireSchemaVersion(record);
  if (readString(record, "lifecycle") !== "REVOKED") {
    throw new EdgeEnrollmentResponseError("lifecycle must be REVOKED");
  }
  return {
    operationId: readUuidV7(record, "operationId"),
    tokenId: readTokenId(record, "tokenId"),
    revokedAt: readInstant(record, "revokedAt"),
  };
}

function parseRedactedCredential(value: unknown): RedactedEdgeCredential {
  const record = readRecord(value, "credential");
  requireExactKeys(record, [
    "tokenId",
    "prefix",
    "lifecycle",
    "edgeInstallationId",
    "enrollmentGeneration",
    "createdAt",
    "valueState",
  ]);
  if (readString(record, "valueState") !== "not-returned") {
    throw new EdgeEnrollmentResponseError("valueState must be not-returned");
  }
  return {
    tokenId: readTokenId(record, "tokenId"),
    prefix: readBoundedString(record, "prefix", 64),
    lifecycle: readCredentialLifecycle(record),
    edgeInstallationId: readUuid(record, "edgeInstallationId"),
    enrollmentGeneration: readPositiveInteger(record, "enrollmentGeneration"),
    createdAt: readInstant(record, "createdAt"),
    valueState: "not-returned",
  };
}
