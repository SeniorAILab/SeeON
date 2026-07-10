import type { AuthSession, Role, User } from "@/types";
import { requestJson, requestNoContent } from "../apiClient";

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
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly phone: string;
  readonly facilityName: string;
}

export function parseRole(role: string | null | undefined): Role | null {
  switch (role) {
    case "SUPER_ADMIN":
      return "SUPER_ADMIN";
    case "ADMIN":
      return "ADMIN";
    case "STAFF":
      return "STAFF";
    default:
      return null;
  }
}

export async function logoutEndpoint(): Promise<void> {
  await requestNoContent("/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

export async function loginEndpoint(input: LoginInput): Promise<AuthSession> {
  const body = await requestJson("/auth/login", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify(input),
  });
  const session = parseAuthSessionResponse(body);
  if (!session) throw new Error("로그인 응답이 올바르지 않습니다.");
  return session;
}

export async function registerEndpoint(
  input: RegisterInput
): Promise<AuthSession> {
  const body = await requestJson("/auth/register", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify(input),
  });
  const session = parseAuthSessionResponse(body);
  if (!session) throw new Error("회원가입 응답이 올바르지 않습니다.");
  return session;
}

export async function restoreSessionEndpoint(): Promise<AuthSession | null> {
  const body = await requestJson("/auth/me", {
    credentials: "include",
  });
  const user = parseAuthUserResponse(body);
  return user ? { user } : null;
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
  const user = mapAuthUser(body.user);
  return user ? { user } : null;
}

export function parseAuthUserResponse(body: unknown): User | null {
  return isAuthUserResponseDto(body) ? mapAuthUser(body) : null;
}

function mapAuthUser(dto: AuthUserResponseDto): User | null {
  const role = parseRole(dto.role);
  if (!role) return null;
  return {
    id: dto.id,
    name: dto.nickname?.trim() || "사용자",
    email: dto.email?.trim() ?? "",
    role,
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
