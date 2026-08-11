import {
  EdgeEnrollmentResponseError,
  parseOwnershipTransferKind,
  type OwnershipTransferManifestItem,
} from "@/services/edgeAdminService";

const EDGE_REF = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;

export function createIdempotencyKey(): string {
  const timestamp = Date.now().toString(16).padStart(12, "0").slice(-12);
  const random = crypto.randomUUID();
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${random.slice(15, 18)}-${random.slice(19, 23)}-${random.slice(24)}`;
}

export function parseOwnershipManifest(
  source: string,
): readonly OwnershipTransferManifestItem[] {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new EdgeEnrollmentResponseError("manifest must be valid JSON");
    }
    throw error;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new EdgeEnrollmentResponseError("manifest must be a non-empty array");
  }
  return value.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new EdgeEnrollmentResponseError("manifest item must be an object");
    }
    const keys = Object.keys(candidate);
    const allowed = ["kind", "edgeRef", "canonicalId", "parentCanonicalId"];
    if (keys.some((key) => !allowed.includes(key))) {
      throw new EdgeEnrollmentResponseError("manifest item has unknown fields");
    }
    const edgeRef = candidate.edgeRef;
    const canonicalId = candidate.canonicalId;
    const parentCanonicalId = candidate.parentCanonicalId;
    if (typeof edgeRef !== "string" || !EDGE_REF.test(edgeRef)) {
      throw new EdgeEnrollmentResponseError("edgeRef is malformed");
    }
    if (typeof canonicalId !== "string" || canonicalId.length === 0) {
      throw new EdgeEnrollmentResponseError("canonicalId is required");
    }
    if (parentCanonicalId !== null && typeof parentCanonicalId !== "string") {
      throw new EdgeEnrollmentResponseError("parentCanonicalId is malformed");
    }
    return {
      kind: parseOwnershipTransferKind(candidate.kind),
      edgeRef,
      canonicalId,
      parentCanonicalId,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
