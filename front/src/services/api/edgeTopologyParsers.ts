import {
  EdgeEnrollmentResponseError,
  type OwnershipTransferKind,
  type OwnershipTransferPreview,
  type TopologyPreviewStatus,
} from "./edgeEnrollmentTypes";
import {
  readEdgeRefs,
  readInstant,
  readNonnegativeInteger,
  readNullableUuid,
  readRecord,
  readString,
  readUuid,
  readUuidV7,
  requireExactKeys,
  requireKnownKeys,
  requireSchemaVersion,
} from "./edgeEnrollmentValidation";

const SHA256 = /^[a-f0-9]{64}$/;

export function parseTopologyPreviewStatus(
  value: unknown,
): TopologyPreviewStatus {
  const record = readRecord(value, "root");
  requireKnownKeys(
    record,
    [
      "schemaVersion",
      "snapshotId",
      "clientRevision",
      "serverRevision",
      "result",
      "omissions",
    ],
    ["ownershipTransferRequired"],
  );
  requireSchemaVersion(record);
  readUuidV7(record, "snapshotId");
  readNonnegativeInteger(record, "serverRevision");
  const clientRevision = readNonnegativeInteger(record, "clientRevision");
  if (clientRevision < 1) {
    throw new EdgeEnrollmentResponseError("clientRevision must be positive");
  }
  readTopologyResult(record.result);
  const ownershipTransferRequired = readOwnershipTransfer(record);
  if (record.omissions === null) {
    return { kind: "clear", ownershipTransferRequired };
  }
  const omissions = readRecord(record.omissions, "omissions");
  requireExactKeys(omissions, [
    "confirmationId",
    "digest",
    "expiresAt",
    "cameras",
    "rooms",
    "floors",
  ]);
  const digest = readSha256(omissions, "digest");
  return {
    kind: "pending",
    ownershipTransferRequired,
    confirmationId: readUuidV7(omissions, "confirmationId"),
    digest,
    expiresAt: readInstant(omissions, "expiresAt"),
    cameraCount: readEdgeRefs(omissions, "cameras").length,
    roomCount: readEdgeRefs(omissions, "rooms").length,
    floorCount: readEdgeRefs(omissions, "floors").length,
  };
}

function readTopologyResult(value: unknown): void {
  const result = readRecord(value, "result");
  requireExactKeys(result, ["floors", "rooms", "cameras"]);
  for (const kind of ["floors", "rooms", "cameras"]) {
    const counts = readRecord(result[kind], `result.${kind}`);
    requireKnownKeys(
      counts,
      ["created", "updated", "unchanged"],
      ["reactivated", "deactivated"],
    );
    for (const field of Object.keys(counts)) {
      readNonnegativeInteger(counts, field);
    }
  }
}

function readOwnershipTransfer(
  record: Record<string, unknown>,
): OwnershipTransferPreview | null {
  const value = record.ownershipTransferRequired;
  if (value === undefined || value === null) return null;
  const preview = readRecord(value, "ownershipTransferRequired");
  requireExactKeys(preview, ["manifestDigest", "items"]);
  if (!Array.isArray(preview.items)) {
    throw new EdgeEnrollmentResponseError("transfer items must be an array");
  }
  return {
    manifestDigest: readSha256(preview, "manifestDigest"),
    items: preview.items.map(readTransferItem),
  };
}

function readTransferItem(
  value: unknown,
): OwnershipTransferPreview["items"][number] {
  const item = readRecord(value, "transfer item");
  requireExactKeys(item, [
    "kind",
    "edgeRef",
    "canonicalId",
    "parentCanonicalId",
  ]);
  const edgeRefs = readEdgeRefs({ values: [item.edgeRef] }, "values");
  const edgeRef = edgeRefs[0];
  if (edgeRef === undefined) {
    throw new EdgeEnrollmentResponseError("edgeRef is required");
  }
  return {
    kind: readTransferKind(item),
    edgeRef,
    canonicalId: readUuid(item, "canonicalId"),
    parentCanonicalId: readNullableUuid(item, "parentCanonicalId"),
  };
}

function readTransferKind(
  record: Record<string, unknown>,
): OwnershipTransferKind {
  const kind = readString(record, "kind");
  switch (kind) {
    case "FLOOR":
    case "ROOM":
    case "CAMERA":
      return kind;
    default:
      throw new EdgeEnrollmentResponseError("unknown transfer kind");
  }
}

function readSha256(record: Record<string, unknown>, field: string): string {
  const value = readString(record, field);
  if (!SHA256.test(value)) {
    throw new EdgeEnrollmentResponseError(`${field} must be SHA-256`);
  }
  return value;
}
