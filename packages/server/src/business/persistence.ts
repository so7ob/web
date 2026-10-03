import type { QueryRunner } from "typeorm";
import type { Models } from "../database/models.js";
import { schema, identifier } from "../database/schema.js";
import { sha256, newId } from "../auth/persistence.js";
/** Internal scalar writes only. Identifiers come from the frozen schema, values are bound parameters. */
export async function insertRecord<K extends keyof Models>(
  r: QueryRunner,
  table: K,
  data: Partial<Models[K]>,
): Promise<void> {
  const columns = Object.keys(data);
  if (!columns.length || columns.some((c) => !schema[table].columns[c]))
    throw new Error("Unknown persistence field");
  await r.query(
    `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
    Object.values(data),
  );
}
export async function lockOperation(
  r: QueryRunner,
  key: string,
): Promise<void> {
  const hashed = sha256(key);
  await r.query(
    "INSERT INTO OperationLock(lockKey) VALUES(?) ON DUPLICATE KEY UPDATE lockKey=lockKey",
    [hashed],
  );
  await r.query(
    "SELECT lockKey FROM OperationLock WHERE lockKey=? FOR UPDATE",
    [hashed],
  );
}
export async function notifyStaff(
  r: QueryRunner,
  type: string,
  payload: Record<string, string>,
  link: string,
): Promise<Array<{ id: string; email: string; locale: string }>> {
  const staff: Array<{ id: string; email: string; locale: string }> =
    await r.query(
      "SELECT id,email,locale FROM User WHERE status='active' AND roleKey IN ('super_admin','ops_manager','support')",
    );
  if (staff.length)
    await r.query(
      "INSERT INTO Notification(id,userId,type,payload,link) VALUES " +
        staff.map(() => "(?,?,?,?,?)").join(","),
      staff.flatMap((user) => [
        newId(),
        user.id,
        type,
        JSON.stringify(payload),
        link,
      ]),
    );
  return staff;
}
