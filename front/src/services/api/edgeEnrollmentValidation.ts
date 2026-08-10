import {
  EdgeEnrollmentResponseError,
  type EdgeCredentialLifecycle,
} from "./edgeEnrollmentTypes";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_ID = /^[0-9A-HJKMNP-TV-Z]{12}$/;
const RFC3339_MILLIS_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EDGE_REF = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;

export function readRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new EdgeEnrollmentResponseError(`${field} must be an object`);
  }
  return value;
}

export function requireExactKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const keys = Object.keys(record);
  if (
    keys.length !== allowed.length ||
    keys.some((key) => !allowed.includes(key))
  ) {
    throw new EdgeEnrollmentResponseError(
      "response contains unexpected fields",
    );
  }
}

export function requireKnownKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): void {
  const keys = Object.keys(record);
  const allowed = [...required, ...optional];
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some((key) => !allowed.includes(key))
  ) {
    throw new EdgeEnrollmentResponseError(
      "response contains missing or unexpected fields",
    );
  }
}

export function readString(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new EdgeEnrollmentResponseError(
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

export function readTokenId(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = readString(record, field);
  if (!TOKEN_ID.test(value)) {
    throw new EdgeEnrollmentResponseError(`${field} must be a token id`);
  }
  return value;
}

export function readUuid(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = readString(record, field);
  if (!UUID.test(value)) {
    throw new EdgeEnrollmentResponseError(`${field} must be a UUID`);
  }
  return value;
}

export function readUuidV7(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = readString(record, field);
  if (!UUID_V7.test(value)) {
    throw new EdgeEnrollmentResponseError(`${field} must be a UUIDv7`);
  }
  return value;
}

export function readNullableUuid(
  record: Record<string, unknown>,
  field: string,
): string | null {
  if (record[field] === null) return null;
  return readUuid(record, field);
}

export function readBoundedString(
  record: Record<string, unknown>,
  field: string,
  maximumLength: number,
): string {
  const value = readString(record, field);
  if (value.length > maximumLength) {
    throw new EdgeEnrollmentResponseError(`${field} is too long`);
  }
  return value;
}

export function readEdgeRefs(
  record: Record<string, unknown>,
  field: string,
): readonly string[] {
  const values = record[field];
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string" || !EDGE_REF.test(value))
  ) {
    throw new EdgeEnrollmentResponseError(`${field} must be an edge-ref array`);
  }
  return values;
}

export function readInstant(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = readString(record, field);
  if (
    !RFC3339_MILLIS_UTC.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new EdgeEnrollmentResponseError(
      `${field} must be RFC3339 UTC milliseconds`,
    );
  }
  return value;
}

export function readNullableInstant(
  record: Record<string, unknown>,
  field: string,
): string | null {
  if (record[field] === null) return null;
  return readInstant(record, field);
}

export function requireSchemaVersion(record: Record<string, unknown>): void {
  if (record.schemaVersion !== 1) {
    throw new EdgeEnrollmentResponseError("schemaVersion must be 1");
  }
}

export function readPositiveInteger(
  record: Record<string, unknown>,
  field: string,
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new EdgeEnrollmentResponseError(
      `${field} must be a positive integer`,
    );
  }
  return value;
}

export function readNonnegativeInteger(
  record: Record<string, unknown>,
  field: string,
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new EdgeEnrollmentResponseError(
      `${field} must be a non-negative integer`,
    );
  }
  return value;
}

export function readCredentialLifecycle(
  record: Record<string, unknown>,
): EdgeCredentialLifecycle {
  const lifecycle = readString(record, "lifecycle");
  switch (lifecycle) {
    case "ACTIVE":
    case "GRACE":
    case "EXPIRED":
    case "REVOKED":
      return lifecycle;
    default:
      throw new EdgeEnrollmentResponseError("unknown credential lifecycle");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
