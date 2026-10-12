import bcrypt from "bcryptjs";
import {
  can,
  PERMISSIONS,
  type AuthUser,
  type Permission,
} from "@so7ob/contracts";
import type { QueryRunner } from "typeorm";
import { AuthFault } from "../auth/persistence.js";
export function permissionList(raw: unknown): Permission[] {
  let value: unknown;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new AuthFault(403, "forbidden");
  }
  if (
    !Array.isArray(value) ||
    value.some((p) => typeof p !== "string" || !Object.hasOwn(PERMISSIONS, p))
  )
    throw new AuthFault(400, "invalid_permissions");
  return [...new Set(value)] as Permission[];
}
export async function currentIdentity(
  r: QueryRunner,
  actor: AuthUser,
  permission: Permission,
): Promise<AuthUser & { grantablePermissions: Permission[] }> {
  const [row] = await r.query(
    "SELECT u.*,r.permissions,r.grantablePermissions,r.status roleStatus FROM User u JOIN Role r ON r.`key`=u.roleKey WHERE u.id=?",
    [actor.id],
  );
  if (
    !row ||
    !["active", "pending_verification"].includes(row.status) ||
    row.roleStatus !== "active" ||
    row.credentialState !== "ready"
  )
    throw new AuthFault(401, "unauthorized");
  const current = {
    ...actor,
    roleKey: row.roleKey,
    status: row.status,
    permissions: permissionList(row.permissions),
    grantablePermissions: permissionList(row.grantablePermissions),
  };
  if (!can(current, permission)) throw new AuthFault(403, "forbidden");
  return current;
}
export async function freshIdentity(
  r: QueryRunner,
  actor: AuthUser,
  password: unknown,
) {
  const [row] = await r.query("SELECT passwordHash FROM User WHERE id=?", [
    actor.id,
  ]);
  if (
    typeof password !== "string" ||
    !row ||
    !(await bcrypt.compare(password, row.passwordHash))
  )
    throw new AuthFault(403, "reauth_required");
}
export async function assignableRole(
  r: QueryRunner,
  actor: AuthUser & { grantablePermissions: Permission[] },
  key: string,
  password?: unknown,
) {
  const [role] = await r.query("SELECT * FROM Role WHERE `key`=?", [key]);
  if (!role) throw new AuthFault(400, "invalid_role");
  if (role.status !== "active") throw new AuthFault(409, "role_disabled");
  if (key === "super_admin") {
    if (actor.roleKey !== "super_admin" || !can(actor, "users.protected"))
      throw new AuthFault(403, "role_not_assignable");
    await freshIdentity(r, actor, password);
  } else if (actor.roleKey !== "super_admin") {
    const powers = [
      ...permissionList(role.permissions),
      ...permissionList(role.grantablePermissions),
    ];
    if (
      powers.some(
        (p) => !can(actor, p) || !actor.grantablePermissions.includes(p),
      )
    )
      throw new AuthFault(403, "role_not_assignable");
  }
  return role;
}
export async function manageableTarget(
  r: QueryRunner,
  actor: AuthUser & { grantablePermissions: Permission[] },
  target: { id: string; roleKey: string },
  password?: unknown,
) {
  if (target.roleKey === "super_admin") {
    if (actor.roleKey !== "super_admin" || !can(actor, "users.protected"))
      throw new AuthFault(403, "protected_account");
    await freshIdentity(r, actor, password);
  } else if (actor.roleKey !== "super_admin") {
    const [role] = await r.query(
      "SELECT permissions,grantablePermissions FROM Role WHERE `key`=?",
      [target.roleKey],
    );
    if (
      !role ||
      [
        ...permissionList(role.permissions),
        ...permissionList(role.grantablePermissions),
      ].some((p) => !can(actor, p) || !actor.grantablePermissions.includes(p))
    )
      throw new AuthFault(403, "protected_account");
  }
}
