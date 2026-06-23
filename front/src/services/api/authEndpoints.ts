import type { AuthSession, BackendRole, Role, User } from "@/types";
import { buildApiUrl, requestJson, requestNoContent } from "../apiClient";

interface AuthUserResponseDto {
  id: string;
  email?: string | null;
  nickname?: string | null;
  role?: string | null;
  facilityId?: string | null;
}

interface AuthSessionResponseDto {
  user?: AuthUserResponseDto | null;
}

export interface CreateFacilityInput {
  readonly facilityName: string;
  readonly businessRegistrationNumber?: string | null;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export function mapBackendRoleToFrontRole(
  role: BackendRole | string | null | undefined
): Role {
  switch (role) {
    case "SUPER_ADMIN":
      return "SUPER_ADMIN";
    case "ADMIN":
      return "FACILITY_ADMIN";
    case "CAREGIVER":
      return "STAFF";
    default:
      return "STAFF";
  }
}

export function kakaoLoginUrl(): string {
  return buildApiUrl("/auth/kakao/login", { apiPrefix: false });
}

export async function logoutEndpoint(): Promise<void> {
  await requestNoContent(
    "/auth/logout",
    {
      method: "POST",
      credentials: "include",
    },
    { apiPrefix: false }
  );
}

export async function loginEndpoint(input: LoginInput): Promise<AuthSession> {
  const body = await requestJson(
    "/auth/login",
    {
      method: "POST",
      credentials: "include",
      body: JSON.stringify(input),
    },
    { apiPrefix: false }
  );
  const session = parseAuthSessionResponse(body);
  if (!session) throw new Error("로그인 응답이 올바르지 않습니다.");
  return session;
}

export async function restoreSessionEndpoint(): Promise<AuthSession | null> {
  const body = await requestJson(
    "/auth/session",
    {
      credentials: "include",
    },
    { apiPrefix: false }
  );
  return parseAuthSessionResponse(body);
}

export async function createFacilityEndpoint(
  input: CreateFacilityInput
): Promise<AuthSession> {
  const body = await requestJson("/facilities", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify(input),
  });
  const session = parseAuthSessionResponse(body);
  if (!session) throw new Error("시설 생성 응답이 올바르지 않습니다.");
  return session;
}

export function parseAuthSessionResponse(body: unknown): AuthSession | null {
  if (
    !isAuthSessionResponseDto(body) ||
    body.user === null ||
    body.user === undefined
  ) {
    return null;
  }
  return {
    user: mapAuthUser(body.user),
    token: "",
  };
}

function mapAuthUser(dto: AuthUserResponseDto): User {
  return {
    id: dto.id,
    name: dto.nickname?.trim() || "사용자",
    email: dto.email?.trim() ?? "",
    role: mapBackendRoleToFrontRole(dto.role),
    facilityId: dto.facilityId ?? null,
  };
}

function isAuthUserResponseDto(value: unknown): value is AuthUserResponseDto {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (!isOptionalString(value.email)) return false;
  if (!isOptionalString(value.nickname)) return false;
  if (!isOptionalString(value.role)) return false;
  return isOptionalString(value.facilityId);
}

function isAuthSessionResponseDto(
  value: unknown
): value is AuthSessionResponseDto {
  return (
    isRecord(value) &&
    "user" in value &&
    (value.user === null ||
      value.user === undefined ||
      isAuthUserResponseDto(value.user))
  );
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
