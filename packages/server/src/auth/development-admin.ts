import type { DataSource } from "typeorm";
import bcrypt from "bcryptjs";
import { SYSTEM_ROLES } from "@so7ob/contracts";
import { AuthFault, audit, newId, transaction } from "./persistence.js";
import { validPassword } from "./service.js";
import { insertRecord, lockOperation } from "../business/persistence.js";
/** Also called by the CLI before opening a connection or reading a password. */
export function assertDevelopmentDatabase(
  database: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (
    env.NODE_ENV !== "development" ||
    !["127.0.0.1", "localhost"].includes(env.DATABASE_HOST ?? "") ||
    database !== env.DATABASE_NAME
  )
    throw new Error(
      "Administrator bootstrap is restricted to the explicitly named local development database",
    );
}
/** Explicit CLI bootstrap only. There is no HTTP endpoint or default administrator/password. */
export async function createDevelopmentAdmin(
  db: DataSource,
  input: { database: string; email: string; name: string; password: string },
  env: NodeJS.ProcessEnv = process.env,
) {
  assertDevelopmentDatabase(input.database, env);
  const email = input.email.trim().toLowerCase(),
    name = input.name.trim().slice(0, 100);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
    email.length > 200 ||
    name.length < 2 ||
    !validPassword(input.password)
  )
    throw new AuthFault(400, "invalid");
  const passwordHash = await bcrypt.hash(input.password, 12);
  return transaction(db, async (r) => {
    await lockOperation(r, "user-administration");
    if (
      (await r.query("SELECT id FROM User WHERE roleKey='super_admin' LIMIT 1"))
        .length
    )
      throw new Error(
        "An administrator already exists; use authenticated user administration/invitations. No account was changed.",
      );
    if ((await r.query("SELECT id FROM User WHERE email=?", [email])).length)
      throw new Error(
        "Email already belongs to an account; no existing password or role was overwritten.",
      );
    for (const role of SYSTEM_ROLES)
      await r.query(
        "INSERT INTO Role(`key`,nameAr,nameEn,descriptionAr,descriptionEn,permissions,isSystem) VALUES(?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE `key`=`key`",
        [
          role.key,
          role.nameAr,
          role.nameEn,
          role.descriptionAr,
          role.descriptionEn,
          JSON.stringify(role.permissions),
        ],
      );
    const id = newId();
    await insertRecord(r, "User", {
      id,
      email,
      name,
      passwordHash,
      roleKey: "super_admin",
      status: "active",
      emailVerifiedAt: new Date(),
      locale: "ar",
    });
    await audit(
      r,
      "user.development_admin_created",
      { id, email },
      { environment: "local-development" },
      "user",
      id,
    );
    return { id, email, roleKey: "super_admin" };
  });
}
