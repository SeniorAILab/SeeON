export type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'CAREGIVER';

export type BindOptions = {
  readonly dryRun: boolean;
  readonly emails: readonly string[];
  readonly kakaoIds: readonly string[];
};

export type BindChange = {
  readonly email: string | null;
  readonly id: string;
  readonly kakaoId: string;
  readonly nextFacilityId: string;
  readonly nextRole: 'SUPER_ADMIN';
  readonly previousFacilityId: string | null;
  readonly previousRole: RoleName;
};

export type FoundUser = {
  readonly email: string | null;
  readonly facilityId: string | null;
  readonly id: string;
  readonly kakaoId: string | null;
  readonly role: RoleName;
};

export type UserWhereClause =
  | { kakaoId: { in: string[] } }
  | {
      email: { in: string[] };
      kakaoId: { not: null };
    };

export type BindPrisma = {
  readonly facility: {
    readonly findUnique: (args: {
      readonly where: { readonly id: string };
    }) => Promise<unknown>;
  };
  readonly user: {
    readonly findMany: (args: {
      readonly where: { readonly OR: UserWhereClause[] };
      readonly select: {
        readonly email: true;
        readonly facilityId: true;
        readonly id: true;
        readonly kakaoId: true;
        readonly role: true;
      };
    }) => Promise<FoundUser[]>;
    readonly update: (args: {
      readonly where: { readonly id: string };
      readonly data: {
        readonly facilityId: string;
        readonly role: 'SUPER_ADMIN';
        readonly sessionVersion: { readonly increment: 1 };
      };
    }) => Promise<unknown>;
  };
  readonly kakaoIdentity: {
    readonly updateMany: (args: {
      readonly where: { readonly userId: string };
      readonly data: { readonly facilityId: string };
    }) => Promise<unknown>;
  };
  readonly $transaction: <T>(operations: Promise<T>[]) => Promise<T[]>;
};
