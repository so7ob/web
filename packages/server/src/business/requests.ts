import type { DataSource, QueryRunner } from "typeorm";
import {
  can,
  canAccessRequest,
  canTransition,
  isStaff,
  REQUEST_STATUSES,
  SERVICE_TYPES,
  type AuthUser,
} from "@so7ob/contracts";
import type { ProjectRequest, RequestMessage } from "../database/models.js";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { fingerprint } from "../auth/rate-policy.js";
import { insertRecord, notifyStaff } from "./persistence.js";
import { pageNumber } from "./account.js";
/** SQLite LIKE folds ASCII only. MariaDB's general_ci would also fold accents/Unicode. */
export function sqliteLike(
  column: string,
  query: string,
): { sql: string; value: string } {
  if (!/^[a-zA-Z.]+$/.test(column))
    throw new Error("Static SQL column required");
  let expression = column;
  for (let n = 65; n <= 90; n++)
    expression = `REPLACE(${expression},'${String.fromCharCode(n)}','${String.fromCharCode(n + 32)}')`;
  return {
    sql: expression + " LIKE ? ESCAPE '='",
    value:
      "%" +
      query.replaceAll("=", "==").replace(/[A-Z]/g, (c) => c.toLowerCase()) +
      "%",
  };
}
export class RequestService {
  constructor(private readonly db: DataSource) {}
  async list(
    actor: AuthUser,
    query: { q?: string; status?: string; awaiting?: string; page?: string },
  ) {
    const q = (query.q ?? "").trim().slice(0, 100),
      page = pageNumber(query.page),
      pageSize = 20;
    const params: unknown[] = [actor.id];
    let where =
      (actor.roleKey === "client" ? "r.clientId" : "r.assigneeId") + "=?";
    if (query.awaiting === "you")
      where +=
        " AND r.archivedAt IS NULL AND r.lastStaffReplyAt IS NOT NULL AND (r.lastClientReplyAt IS NULL OR r.lastStaffReplyAt>r.lastClientReplyAt)";
    else if (query.status) {
      where += " AND r.status=?";
      params.push(query.status);
    }
    if (q.length >= 2) {
      const like = sqliteLike("r.refCode", q.toUpperCase());
      const clauses = [like.sql];
      params.push(like.value);
      if ((SERVICE_TYPES as readonly string[]).includes(q)) {
        clauses.push("r.serviceType=?");
        params.push(q);
      }
      if ((REQUEST_STATUSES as readonly string[]).includes(q)) {
        clauses.push("r.status=?");
        params.push(q);
      }
      where += " AND (" + clauses.join(" OR ") + ")";
    }
    const [[count], rows] = await Promise.all([
      this.db.query(
        "SELECT COUNT(*) n FROM ProjectRequest r WHERE " + where,
        params,
      ),
      this.db.query(
        `SELECT r.id,r.refCode,r.serviceType,r.requestType,r.status,r.priority,r.createdAt,r.lastActivityAt,r.lastClientReplyAt,r.lastStaffReplyAt,r.archivedAt,u.name assigneeName,(SELECT COUNT(*) FROM RequestMessage m WHERE m.requestId=r.id AND m.kind='message') messageCount FROM ProjectRequest r LEFT JOIN User u ON u.id=r.assigneeId WHERE ${where} ORDER BY r.lastActivityAt DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      ),
    ]);
    return {
      ok: true,
      total: Number(count.n),
      page,
      pageSize,
      requests: rows.map((r: Record<string, unknown>) => {
        const { assigneeName, ...row } = r;
        return {
          ...row,
          messageCount: Number(r.messageCount),
          assignee: assigneeName === null ? null : { name: assigneeName },
          awaitingClientReply:
            r.lastStaffReplyAt !== null &&
            (r.lastClientReplyAt === null ||
              (r.lastStaffReplyAt as Date) > (r.lastClientReplyAt as Date)),
        };
      }),
    };
  }
  async detail(actor: AuthUser, id: string) {
    const [request]: ProjectRequest[] = await this.db.query(
      "SELECT * FROM ProjectRequest WHERE id=?",
      [id],
    );
    if (!request) throw new AuthFault(404, "not_found");
    if (!canAccessRequest(actor, request))
      throw new AuthFault(403, "forbidden");
    const staff = isStaff(actor);
    const [messages, history, attachments, assignees, claims, clients] =
      await Promise.all([
        this.db.query(
          `SELECT m.*${staff ? ",u.id authorUserId,u.name authorName,u.roleKey authorRole" : ""} FROM RequestMessage m ${staff ? "LEFT JOIN User u ON u.id=m.authorId" : ""} WHERE m.requestId=? ${staff ? "" : "AND m.kind<>'internal_note'"} ORDER BY m.createdAt ASC`,
          [id],
        ),
        this.db.query(
          "SELECT s.*,u.name changedByName FROM RequestStatusEvent s LEFT JOIN User u ON u.id=s.changedById WHERE s.requestId=? ORDER BY s.createdAt ASC",
          [id],
        ),
        this.db.query(
          `SELECT a.* FROM Attachment a WHERE a.requestId=? ${staff ? "" : "AND (a.messageId IS NULL OR NOT EXISTS(SELECT 1 FROM RequestMessage m WHERE m.id=a.messageId AND m.kind='internal_note'))"} ORDER BY a.createdAt ASC`,
          [id],
        ),
        this.db.query("SELECT id,name FROM User WHERE id=?", [
          request.assigneeId,
        ]),
        staff
          ? Promise.resolve([])
          : this.db.query("SELECT status FROM RequestClaim WHERE requestId=?", [
              id,
            ]),
        staff
          ? this.db.query(
              "SELECT id,name,email,phone,company,status FROM User WHERE id=?",
              [request.clientId],
            )
          : Promise.resolve([]),
      ]);
    const data = {
      ...request,
      messages: staff
        ? messages.map((m: Record<string, unknown>) => {
            const { authorUserId, authorName, authorRole, ...row } = m;
            return {
              ...row,
              author: authorUserId
                ? { id: authorUserId, name: authorName, roleKey: authorRole }
                : null,
            };
          })
        : messages,
      statusHistory: history.map((h: Record<string, unknown>) => {
        const { changedByName, ...row } = h;
        return {
          ...row,
          changedBy: changedByName === null ? null : { name: changedByName },
        };
      }),
      attachments,
      assignee: assignees[0] ?? null,
      ...(staff
        ? { client: clients[0] ?? null }
        : { claim: claims[0] ?? null }),
    };
    const side = actor.roleKey === "client" ? "clientReadAt" : "staffReadAt";
    if (
      side === "staffReadAt" ||
      (request.lastStaffReplyAt &&
        (request.clientReadAt === null ||
          request.lastStaffReplyAt > request.clientReadAt))
    )
      await this.db.query(
        `UPDATE ProjectRequest SET ${side}=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
        [id],
      );
    return { ok: true, request: data };
  }
  async patch(actor: AuthUser, id: string, body: Record<string, unknown>) {
    return transaction(this.db, async (r) => {
      const [request]: ProjectRequest[] = await r.query(
        "SELECT * FROM ProjectRequest WHERE id=? FOR UPDATE",
        [id],
      );
      if (!request) throw new AuthFault(404, "not_found");
      if (body.action === "cancel") {
        const side = actor.roleKey === "client" ? "client" : "staff";
        if (side === "staff" && !can(actor, "requests.status"))
          throw new AuthFault(403, "forbidden");
        if (side === "client" && !canAccessRequest(actor, request))
          throw new AuthFault(403, "forbidden");
        if (!canTransition(request.status, "cancelled", side))
          throw new AuthFault(409, "invalid_transition");
        const note = String(body.note ?? "").slice(0, 500) || null;
        await r.query(
          "UPDATE ProjectRequest SET status='cancelled',closedAt=UTC_TIMESTAMP(3),resolutionNote=?,lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
          [note, id],
        );
        await insertRecord(r, "RequestStatusEvent", {
          id: newId(),
          requestId: id,
          fromStatus: request.status,
          toStatus: "cancelled",
          changedById: actor.id,
          note,
        });
        await insertRecord(r, "RequestMessage", {
          id: newId(),
          requestId: id,
          authorType: "system",
          kind: "system",
          body: note ?? "",
        });
        await audit(r, "request.cancelled", actor, { note }, "request", id);
        return { ok: true };
      }
      if (actor.roleKey !== "client" || !canAccessRequest(actor, request))
        throw new AuthFault(403, "forbidden");
      if (!["new", "in_review", "awaiting_info"].includes(request.status))
        throw new AuthFault(409, "locked");
      const updates: Record<string, string> = {};
      for (const key of [
        "description",
        "referenceUrl",
        "phone",
        "company",
        "budget",
        "currency",
        "timeline",
        "preferredContact",
      ])
        if (typeof body[key] === "string")
          updates[key] = body[key].slice(0, 5000);
      if (
        typeof body.serviceType === "string" &&
        (SERVICE_TYPES as readonly string[]).includes(body.serviceType)
      )
        updates.serviceType = body.serviceType;
      if (!Object.keys(updates).length) throw new AuthFault(400, "invalid");
      await r.query(
        `UPDATE ProjectRequest SET ${Object.keys(updates)
          .map((k) => "`" + k + "`=?")
          .join(
            ",",
          )},lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
        [...Object.values(updates), id],
      );
      await insertRecord(r, "RequestMessage", {
        id: newId(),
        requestId: id,
        authorId: actor.id,
        authorType: "system",
        kind: "system",
        body: "request_updated",
      });
      await audit(
        r,
        "request.updated",
        actor,
        {
          before: JSON.stringify({
            description: request.description,
            referenceUrl: request.referenceUrl,
            serviceType: request.serviceType,
          }),
          after: JSON.stringify({
            description: updates.description ?? request.description,
            referenceUrl: updates.referenceUrl ?? request.referenceUrl,
            serviceType: updates.serviceType ?? request.serviceType,
          }),
          fields: Object.keys(updates),
        },
        "request",
        id,
      );
      return { ok: true };
    });
  }
  async message(
    actor: AuthUser,
    id: string,
    input: { body?: unknown; kind?: unknown },
    ip?: string,
  ) {
    const text = String(input.body ?? "")
        .trim()
        .slice(0, 8000),
      kind = input.kind === "internal_note" ? "internal_note" : "message";
    if (!text) throw new AuthFault(400, "empty");
    return transaction(this.db, async (r) => {
      const [request]: ProjectRequest[] = await r.query(
        "SELECT * FROM ProjectRequest WHERE id=? FOR UPDATE",
        [id],
      );
      if (!request) throw new AuthFault(404, "not_found");
      if (!canAccessRequest(actor, request))
        throw new AuthFault(403, "forbidden");
      const client = actor.roleKey === "client";
      if (client && kind !== "message") throw new AuthFault(403, "forbidden");
      if (client && ["closed", "cancelled"].includes(request.status))
        throw new AuthFault(409, "locked");
      if (
        !client &&
        !can(
          actor,
          kind === "message" ? "requests.reply" : "requests.internal_notes",
        )
      )
        throw new AuthFault(403, "forbidden");
      const [recent]: RequestMessage[] = await r.query(
        "SELECT * FROM RequestMessage WHERE requestId=? AND authorId=? AND createdAt>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) ORDER BY createdAt DESC LIMIT 1",
        [id, actor.id],
      );
      if (recent && fingerprint(recent.body) === fingerprint(text))
        return { ok: true, message: recent };
      const messageId = newId();
      await insertRecord(r, "RequestMessage", {
        id: messageId,
        requestId: id,
        authorId: actor.id,
        authorType: client ? "client" : "staff",
        kind,
        body: text,
      });
      const columns = [
        "lastActivityAt=UTC_TIMESTAMP(3)",
        "updatedAt=UTC_TIMESTAMP(3)",
      ];
      if (client) columns.push("lastClientReplyAt=UTC_TIMESTAMP(3)");
      if (!client && kind === "message")
        columns.push("lastStaffReplyAt=UTC_TIMESTAMP(3)");
      if (client && request.status === "awaiting_info") {
        columns.push("status='in_review'");
        await insertRecord(r, "RequestStatusEvent", {
          id: newId(),
          requestId: id,
          fromStatus: "awaiting_info",
          toStatus: "in_review",
          changedById: actor.id,
        });
      }
      await r.query(
        "UPDATE ProjectRequest SET " + columns.join(",") + " WHERE id=?",
        [id],
      );
      await audit(
        r,
        kind === "message" ? "request.replied" : "request.internal_note",
        actor,
        { kind, requestRef: request.refCode },
        "request",
        id,
        ip,
      );
      if (kind === "message") {
        if (!client && request.clientId)
          await this.notice(
            r,
            request.clientId,
            request.refCode,
            "/ar/account/requests/" + id,
          );
        else if (client) {
          if (request.assigneeId)
            await this.notice(
              r,
              request.assigneeId,
              request.refCode,
              "/ar/admin/requests/" + id,
            );
          else
            await notifyStaff(
              r,
              "reply_received",
              { ref: request.refCode },
              "/ar/admin/requests/" + id,
            );
        }
      }
      const [message] = await r.query(
        "SELECT * FROM RequestMessage WHERE id=?",
        [messageId],
      );
      return { ok: true, message };
    });
  }
  private async notice(
    r: QueryRunner,
    userId: string,
    ref: string,
    link: string,
  ) {
    await insertRecord(r, "Notification", {
      id: newId(),
      userId,
      type: "reply_received",
      payload: JSON.stringify({ ref }),
      link,
    });
  }
}
