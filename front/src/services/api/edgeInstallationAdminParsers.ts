import type {
  EdgeOperationSummary,
  OperationStatus,
  OwnershipTransferKind,
} from "./edgeEnrollmentTypes";
import { EdgeEnrollmentResponseError } from "./edgeEnrollmentTypes";
import type {
  EdgeOwnershipTransfer,
  EdgeValidationEventSummary,
  EdgeValidationRun,
} from "./edgeInstallationAdminTypes";
import {
  readInstant,
  readNonnegativeInteger,
  readPositiveInteger,
  readRecord,
  readString,
  readUuid,
  readUuidV7,
  requireExactKeys,
  requireSchemaVersion,
} from "./edgeEnrollmentValidation";

export function parseEdgeValidationRun(value: unknown): EdgeValidationRun {
  const record = readRecord(value, "root");
  requireExactKeys(record, [
    "schemaVersion",
    "operation",
    "validationRunId",
    "edgeInstallationId",
    "enrollmentGeneration",
    "status",
    "createdAt",
    "expiresAt",
  ]);
  requireSchemaVersion(record);
  if (readString(record, "status") !== "ACTIVE") {
    throw new EdgeEnrollmentResponseError("validation status must be ACTIVE");
  }
  return {
    operation: parseOperation(record.operation),
    validationRunId: readUuidV7(record, "validationRunId"),
    edgeInstallationId: readUuid(record, "edgeInstallationId"),
    enrollmentGeneration: readPositiveInteger(
      record,
      "enrollmentGeneration",
    ),
    status: "ACTIVE",
    createdAt: readInstant(record, "createdAt"),
    expiresAt: readInstant(record, "expiresAt"),
  };
}

export function parseEdgeValidationEvents(
  value: unknown,
): readonly EdgeValidationEventSummary[] {
  const record = readRecord(value, "root");
  requireExactKeys(record, ["schemaVersion", "items"]);
  requireSchemaVersion(record);
  if (!Array.isArray(record.items)) {
    throw new EdgeEnrollmentResponseError("items must be an array");
  }
  return record.items.map((item) => {
    const event = readRecord(item, "validation event");
    return {
      id: readUuid(event, "id"),
      detectedAt: readInstant(event, "detectedAt"),
    };
  });
}

export function parseEdgeOwnershipTransfer(
  value: unknown,
): EdgeOwnershipTransfer {
  const record = readRecord(value, "root");
  requireExactKeys(record, [
    "schemaVersion",
    "operation",
    "edgeInstallationId",
    "enrollmentGeneration",
    "serverRevision",
    "transferred",
    "appliedAt",
  ]);
  requireSchemaVersion(record);
  const transferred = readRecord(record.transferred, "transferred");
  requireExactKeys(transferred, ["floors", "rooms", "cameras"]);
  return {
    operation: parseOperation(record.operation),
    edgeInstallationId: readUuid(record, "edgeInstallationId"),
    enrollmentGeneration: readPositiveInteger(
      record,
      "enrollmentGeneration",
    ),
    serverRevision: readNonnegativeInteger(record, "serverRevision"),
    transferred: {
      floors: readNonnegativeInteger(transferred, "floors"),
      rooms: readNonnegativeInteger(transferred, "rooms"),
      cameras: readNonnegativeInteger(transferred, "cameras"),
    },
    appliedAt: readInstant(record, "appliedAt"),
  };
}

export function parseOwnershipTransferKind(value: unknown): OwnershipTransferKind {
  switch (value) {
    case "FLOOR":
    case "ROOM":
    case "CAMERA":
      return value;
    default:
      throw new EdgeEnrollmentResponseError("unknown transfer kind");
  }
}

function parseOperation(value: unknown): EdgeOperationSummary {
  const record = readRecord(value, "operation");
  requireExactKeys(record, ["operationId", "status", "createdAt", "updatedAt"]);
  return {
    operationId: readUuidV7(record, "operationId"),
    status: parseOperationStatus(readString(record, "status")),
    createdAt: readInstant(record, "createdAt"),
    updatedAt: readInstant(record, "updatedAt"),
  };
}

function parseOperationStatus(value: string): OperationStatus {
  switch (value) {
    case "PENDING":
    case "SUCCEEDED":
    case "FAILED":
    case "UNKNOWN":
      return value;
    default:
      throw new EdgeEnrollmentResponseError("unknown operation status");
  }
}
