export const EDGE_CREDENTIAL_LIFECYCLES = [
  "ACTIVE",
  "GRACE",
  "EXPIRED",
  "REVOKED",
] as const;

export type EdgeCredentialLifecycle =
  (typeof EDGE_CREDENTIAL_LIFECYCLES)[number];

export type RedactedEdgeCredential = {
  readonly tokenId: string;
  readonly prefix: string;
  readonly lifecycle: EdgeCredentialLifecycle;
  readonly edgeInstallationId: string;
  readonly enrollmentGeneration: number;
  readonly createdAt: string;
  readonly valueState: "not-returned";
};

export type OperationStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";

export type EdgeOperationSummary = {
  readonly operationId: string;
  readonly status: OperationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EdgeCredentialSummary = {
  readonly tokenId: string;
  readonly tokenPrefix: string;
  readonly facilityId: string;
  readonly edgeInstallationId: string;
  readonly enrollmentGeneration: number;
  readonly lifecycle: EdgeCredentialLifecycle;
  readonly issuedAt: string;
  readonly expiresAt: string | null;
  readonly graceExpiresAt: string | null;
  readonly revokedAt: string | null;
};

export type EdgeInstallationState =
  | "PENDING_CLAIM"
  | "CLAIMED"
  | "REPLACED"
  | "DEACTIVATED";

export type EdgeInstallationSummary = {
  readonly edgeInstallationId: string;
  readonly facilityId: string;
  readonly enrollmentGeneration: number;
  readonly state: EdgeInstallationState;
  readonly clientInstallationRef: string | null;
  readonly acceptedClientRevision: number;
  readonly serverRevision: number;
};

export type IssuedEdgeCredential =
  | {
      readonly kind: "initial";
      readonly operationId: string;
      readonly facilityCode: string;
      readonly edgeInstallationId: string;
      readonly enrollmentGeneration: 1;
      readonly createdAt: string;
      readonly oneTimeCredential: OneTimeCredential;
    }
  | {
      readonly kind: "replay";
      readonly operation: EdgeOperationSummary;
      readonly credential: EdgeCredentialSummary;
      readonly installation: EdgeInstallationSummary;
      readonly secretDisplay: "NOT_AVAILABLE";
    };

type RotationBase = {
  readonly operationId: string;
  readonly edgeInstallationId: string;
  readonly enrollmentGeneration: number;
  readonly priorTokenId: string;
  readonly graceEndsAt: string;
};

export type RotatedEdgeCredential =
  | (RotationBase & {
      readonly kind: "initial";
      readonly oneTimeCredential: OneTimeCredential;
    })
  | (RotationBase & {
      readonly kind: "replay";
      readonly replacementTokenId: string;
      readonly replacementPrefix: string;
    });

export type RevokedEdgeCredential = {
  readonly operationId: string;
  readonly tokenId: string;
  readonly revokedAt: string;
};

export type OwnershipTransferKind = "FLOOR" | "ROOM" | "CAMERA";

export type OwnershipTransferPreview = {
  readonly manifestDigest: string;
  readonly items: readonly {
    readonly kind: OwnershipTransferKind;
    readonly edgeRef: string;
    readonly canonicalId: string;
    readonly parentCanonicalId: string | null;
  }[];
};

type TopologyPreviewBase = {
  readonly ownershipTransferRequired: OwnershipTransferPreview | null;
};

export type TopologyPreviewStatus =
  | (TopologyPreviewBase & { readonly kind: "clear" })
  | {
      readonly ownershipTransferRequired: OwnershipTransferPreview | null;
      readonly kind: "pending";
      readonly confirmationId: string;
      readonly digest: string;
      readonly expiresAt: string;
      readonly floorCount: number;
      readonly roomCount: number;
      readonly cameraCount: number;
    };

export class OneTimeCredential {
  #value: string | null;

  constructor(value: string) {
    this.#value = value;
  }

  consume(): string | null {
    const value = this.#value;
    this.clear();
    return value;
  }

  clear(): void {
    this.#value = null;
  }

  dispose(): void {
    this.clear();
  }

  toJSON(): null {
    return null;
  }
}

export class EdgeEnrollmentResponseError extends Error {
  readonly name = "EdgeEnrollmentResponseError";

  constructor(readonly reason: string) {
    super(`Malformed edge enrollment response: ${reason}`);
  }
}
