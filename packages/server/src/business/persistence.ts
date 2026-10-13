import {workflowAccessSql} from '../workflows/access.js';
import type {AuthUser,WorkflowScope} from '@so7ob/contracts';
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
  let staff: Array<{ id: string; email: string; locale: string }> =
    await r.query(
      "SELECT id,email,locale FROM User WHERE status='active' AND roleKey IN (SELECT `key` FROM Role WHERE status='active' AND (`key`='super_admin' OR JSON_CONTAINS(permissions, '\"requests.view.all\"')))",
    );
  const target=link.match(/\/admin\/(requests|inquiries)\/([^/?]+)$/);
  if(target){const scope=target[1] as WorkflowScope;staff=await r.query(`SELECT u.id,u.email,u.locale,u.roleKey,ro.permissions FROM User u JOIN Role ro ON ro.\`key\`=u.roleKey WHERE u.status='active' AND ro.status='active' AND (u.roleKey='super_admin' OR JSON_CONTAINS(ro.permissions,?))`,[JSON.stringify(scope+'.view.all')]);const allowed=[];for(const user of staff){const actor={...user,permissions:JSON.parse((user as unknown as {permissions:string}).permissions)} as AuthUser;const [row]=await r.query(`SELECT p.id FROM ${scope==='requests'?'ProjectRequest':'Inquiry'} p WHERE p.id=? AND (${workflowAccessSql(actor,scope,'p')})`,[target[2]]);if(row)allowed.push(user);}staff=allowed;}
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
