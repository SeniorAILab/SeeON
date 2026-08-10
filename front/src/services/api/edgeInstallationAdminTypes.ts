import type {
  EdgeOperationSummary,
  OneTimeCredential,
  OwnershipTransferKind,
} from "./edgeEnrollmentTypes";

type ReplacementBase = {
  readonly operation: EdgeOperationSummary;
  readonly edgeInstallationId: string;
  readonly previousEnrollmentGeneration: number;
  readonly enrollmentGeneration: number;
  readonly installationState: "PENDING_CLAIM";
};

export type ReplacedEdgeInstallation =
  | (ReplacementBase & {
      readonly kind: "initial";
      readonly oneTimeCredential: OneTimeCredential;
    })
  | (ReplacementBase & {
      readonly kind: "replay";
      readonly replacementTokenId: string;
      readonly replacementPrefix: string;
    });

export type EdgeValidationRun = {
  readonly operation: EdgeOperationSummary;
  readonly validationRunId: string;
  readonly edgeInstallationId: string;
  readonly enrollmentGeneration: number;
  readonly status: "ACTIVE";
  readonly createdAt: string;
  readonly expiresAt: string;
};

export type EdgeValidationEventSummary = {
  readonly id: string;
  readonly detectedAt: string;
};

export type OwnershipTransferManifestItem = {
  readonly kind: OwnershipTransferKind;
  readonly edgeRef: string;
  readonly canonicalId: string;
  readonly parentCanonicalId: string | null;
};

export type EdgeOwnershipTransfer = {
  readonly operation: EdgeOperationSummary;
  readonly edgeInstallationId: string;
  readonly enrollmentGeneration: number;
  readonly serverRevision: number;
  readonly transferred: {
    readonly floors: number;
    readonly rooms: number;
    readonly cameras: number;
  };
  readonly appliedAt: string;
};
