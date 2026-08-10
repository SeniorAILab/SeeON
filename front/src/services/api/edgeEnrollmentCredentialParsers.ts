import {
  EdgeEnrollmentResponseError,
  OneTimeCredential,
  type IssuedEdgeCredential,
  type RotatedEdgeCredential,
} from "./edgeEnrollmentTypes";
import type { ReplacedEdgeInstallation } from "./edgeInstallationAdminTypes";
import { parseIssueReplay } from "./edgeEnrollmentReplayParsers";
import {
  readBoundedString,
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

const EDGE_BEARER = /^eft_v1\.([0-9A-HJKMNP-TV-Z]{12})\.[A-Za-z0-9_-]{43}$/;
const FACILITY_CODE = /^NH-[0-9A-HJKMNP-TV-Z]{10}$/;

export function parseIssueEdgeCredential(value: unknown): IssuedEdgeCredential {
  const record = readRecord(value, "root");
  if ("operation" in record) return parseIssueReplay(record);
  requireExactKeys(record, [
    "schemaVersion",
    "operationId",
    "facilityCode",
    "edgeInstallationId",
    "enrollmentGeneration",
    "lifecycle",
    "oneTimeDisplay",
    "createdAt",
  ]);
  requireSchemaVersion(record);
  const facilityCode = readString(record, "facilityCode");
  if (!FACILITY_CODE.test(facilityCode)) {
    throw new EdgeEnrollmentResponseError("facilityCode is malformed");
  }
  if (readPositiveInteger(record, "enrollmentGeneration") !== 1) {
    throw new EdgeEnrollmentResponseError("enrollmentGeneration must be 1");
  }
  if (readString(record, "lifecycle") !== "ACTIVE") {
    throw new EdgeEnrollmentResponseError("lifecycle must be ACTIVE");
  }
  return {
    kind: "initial",
    operationId: readUuidV7(record, "operationId"),
    facilityCode,
    edgeInstallationId: readUuid(record, "edgeInstallationId"),
    enrollmentGeneration: 1,
    createdAt: readInstant(record, "createdAt"),
    oneTimeCredential: readInitialCredential(record.oneTimeDisplay),
  };
}

export function parseRotateEdgeCredential(
  value: unknown,
): RotatedEdgeCredential {
  const record = readRecord(value, "root");
  requireExactKeys(record, [
    "schemaVersion",
    "operationId",
    "edgeInstallationId",
    "enrollmentGeneration",
    "prior",
    "replacement",
    "oneTimeDisplay",
  ]);
  requireSchemaVersion(record);
  const prior = readRecord(record.prior, "prior");
  requireExactKeys(prior, ["tokenId", "lifecycle", "graceEndsAt"]);
  if (readString(prior, "lifecycle") !== "GRACE") {
    throw new EdgeEnrollmentResponseError("prior.lifecycle must be GRACE");
  }
  const replacement = readRecord(record.replacement, "replacement");
  requireExactKeys(replacement, ["lifecycle"]);
  if (readString(replacement, "lifecycle") !== "ACTIVE") {
    throw new EdgeEnrollmentResponseError(
      "replacement.lifecycle must be ACTIVE",
    );
  }
  const base = {
    operationId: readUuidV7(record, "operationId"),
    edgeInstallationId: readUuid(record, "edgeInstallationId"),
    enrollmentGeneration: readPositiveInteger(record, "enrollmentGeneration"),
    priorTokenId: readTokenId(prior, "tokenId"),
    graceEndsAt: readInstant(prior, "graceEndsAt"),
  };
  const display = readCredentialDisplay(record.oneTimeDisplay);
  switch (display.kind) {
    case "initial":
      return {
        ...base,
        kind: "initial",
        oneTimeCredential: display.credential,
      };
    case "replay":
      return {
        ...base,
        kind: "replay",
        replacementTokenId: display.tokenId,
        replacementPrefix: display.prefix,
      };
  }
}

export function parseReplaceEdgeInstallation(
  value: unknown,
): ReplacedEdgeInstallation {
  const record = readRecord(value, "root");
  requireExactKeys(record, [
    "schemaVersion",
    "operation",
    "edgeInstallationId",
    "previousEnrollmentGeneration",
    "enrollmentGeneration",
    "installationState",
    "oneTimeDisplay",
  ]);
  requireSchemaVersion(record);
  if (readString(record, "installationState") !== "PENDING_CLAIM") {
    throw new EdgeEnrollmentResponseError(
      "installationState must be PENDING_CLAIM",
    );
  }
  const operation = readRecord(record.operation, "operation");
  requireExactKeys(operation, [
    "operationId",
    "status",
    "createdAt",
    "updatedAt",
  ]);
  if (readString(operation, "status") !== "SUCCEEDED") {
    throw new EdgeEnrollmentResponseError("operation status must be SUCCEEDED");
  }
  const base = {
    operation: {
      operationId: readUuidV7(operation, "operationId"),
      status: "SUCCEEDED" as const,
      createdAt: readInstant(operation, "createdAt"),
      updatedAt: readInstant(operation, "updatedAt"),
    },
    edgeInstallationId: readUuid(record, "edgeInstallationId"),
    previousEnrollmentGeneration: readPositiveInteger(
      record,
      "previousEnrollmentGeneration",
    ),
    enrollmentGeneration: readPositiveInteger(
      record,
      "enrollmentGeneration",
    ),
    installationState: "PENDING_CLAIM" as const,
  };
  const display = readCredentialDisplay(record.oneTimeDisplay);
  switch (display.kind) {
    case "initial":
      return {
        ...base,
        kind: "initial",
        oneTimeCredential: display.credential,
      };
    case "replay":
      return {
        ...base,
        kind: "replay",
        replacementTokenId: display.tokenId,
        replacementPrefix: display.prefix,
      };
  }
}

type CredentialDisplay =
  | { readonly kind: "initial"; readonly credential: OneTimeCredential }
  | {
      readonly kind: "replay";
      readonly tokenId: string;
      readonly prefix: string;
    };

function readCredentialDisplay(value: unknown): CredentialDisplay {
  const record = readRecord(value, "oneTimeDisplay");
  if (record.redacted === false) {
    return { kind: "initial", credential: readInitialCredential(record) };
  }
  if (record.redacted === true) {
    requireExactKeys(record, ["redacted", "tokenId", "prefix"]);
    return {
      kind: "replay",
      tokenId: readTokenId(record, "tokenId"),
      prefix: readBoundedString(record, "prefix", 64),
    };
  }
  throw new EdgeEnrollmentResponseError("redacted must be boolean");
}

function readInitialCredential(value: unknown): OneTimeCredential {
  const record = readRecord(value, "oneTimeDisplay");
  requireExactKeys(record, ["redacted", "tokenId", "prefix", "value"]);
  if (record.redacted !== false) {
    throw new EdgeEnrollmentResponseError(
      "initial credential must not be redacted",
    );
  }
  const tokenId = readTokenId(record, "tokenId");
  readBoundedString(record, "prefix", 64);
  const bearer = readString(record, "value");
  const match = EDGE_BEARER.exec(bearer);
  if (match === null || match[1] !== tokenId) {
    throw new EdgeEnrollmentResponseError("one-time credential is malformed");
  }
  return new OneTimeCredential(bearer);
}
