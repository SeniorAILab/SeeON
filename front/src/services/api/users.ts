import { requestJson } from "@/services/apiClient";
import type { Role, User } from "@/types";

interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  facilityId?: string | null;
}

interface CreateUserInput {
  name: string;
  email: string;
  role: Exclude<Role, "SUPER_ADMIN">;
}

function isRole(value: unknown): value is Role {
  return value === "SUPER_ADMIN" || value === "ADMIN" || value === "STAFF";
}

function mapUser(value: unknown): User {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as UserDto).id !== "string" ||
    typeof (value as UserDto).name !== "string" ||
    typeof (value as UserDto).email !== "string" ||
    !isRole((value as UserDto).role)
  ) {
    throw new Error("Invalid user response");
  }
  const dto = value as UserDto;
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.role,
    facilityId: dto.facilityId ?? null,
  };
}

export async function listUsers(): Promise<User[]> {
  const body = await requestJson("/users");
  if (!Array.isArray(body)) throw new Error("Invalid users response");
  return body.map(mapUser);
}

export interface CreateUserResult {
  user: User;
  initialPassword: string;
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const body = await requestJson("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    typeof (body as { initialPassword?: unknown }).initialPassword !== "string"
  ) {
    throw new Error("Invalid create user response");
  }
  return {
    user: mapUser((body as { user?: unknown }).user),
    initialPassword: (body as { initialPassword: string }).initialPassword,
  };
}

export async function updateUserRole(id: string, role: Exclude<Role, "SUPER_ADMIN">): Promise<User> {
  return mapUser(
    await requestJson(`/users/${encodeURIComponent(id)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  );
}
