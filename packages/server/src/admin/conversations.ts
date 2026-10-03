import type { DataSource, QueryRunner } from "typeorm";
import {
  canTransition,
  REQUEST_STATUSES,
  REQUEST_PRIORITIES,
  type AuthUser,
  type AdministrativeList,
} from "@so7ob/contracts";
import type { ProjectRequest, Inquiry } from "../database/models.js";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { fingerprint } from "../auth/rate-policy.js";
import { insertRecord } from "../business/persistence.js";
import { RequestService, sqliteLike } from "../business/requests.js";
import { pageNumber, requirePermission } from "./operations.js";
type Kind = "requests" | "inquiries";

type Query = {
  q?: string;
  status?: string;
  service?: string;
  priority?: string;
  assignee?: string;
  archived?: string;
  from?: string;
  overdue?: string;
  category?: string;
  page?: string;
};
const tableFor = (kind: Kind) =>
  kind === "requests" ? "ProjectRequest" : "Inquiry";
const messageFor = (kind: Kind) =>
  kind === "requests" ? "RequestMessage" : "InquiryMessage";
const keyFor = (kind: Kind) =>
  kind === "requests" ? "requestId" : "inquiryId";
const inquiryStatuses = [
  "new",
  "in_review",
  "awaiting_info",
  "responded",
  "closed",
];
export class AdminConversationService {
  constructor(private readonly db: DataSource) {}
  private filters(kind: Kind, query: Query, exporting = false) {
    const request = kind === "requests",
      conditions = [
        query.archived === "1"
          ? "p.archivedAt IS NOT NULL"
          : "p.archivedAt IS NULL",
      ],
      values: unknown[] = [],
      q = (query.q ?? "").trim().toLowerCase().slice(0, 100);
    if (!request && query.status === "open")
      conditions.push(
        "p.status IN ('new','in_review','awaiting_info','responded')",
      );
    else if (
      query.status &&
      (request
        ? (REQUEST_STATUSES as readonly string[])
        : inquiryStatuses
      ).includes(query.status)
    ) {
      conditions.push("p.status=?");
      values.push(query.status);
    }
    for (const [param, column] of (request
      ? [
          ["service", "serviceType"],
          ["priority", "priority"],
        ]
      : [["category", "category"]]) as Array<[keyof Query, string]>)
      if (query[param]) {
        conditions.push("p.`" + column + "`=?");
        values.push(query[param]);
      }
    if (request && query.assignee) {
      conditions.push(
        query.assignee === "none" ? "p.assigneeId IS NULL" : "p.assigneeId=?",
      );
      if (query.assignee !== "none") values.push(query.assignee);
    }
    if (request && !exporting && query.from) {
      const date = new Date(query.from);
      if (!Number.isFinite(date.getTime())) throw new AuthFault(400, "invalid");
      conditions.push("p.createdAt>=?");
      values.push(date);
    }
    if (request && query.overdue === "1")
      conditions.push(
        "p.status IN ('new','in_review','awaiting_info','in_progress','responded') AND p.archivedAt IS NULL AND ((p.lastClientReplyAt<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR) AND (p.lastStaffReplyAt IS NULL OR p.lastClientReplyAt>p.lastStaffReplyAt)) OR (p.lastClientReplyAt IS NULL AND p.lastStaffReplyAt IS NULL AND p.createdAt<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 24 HOUR)))",
      );
    if (q) {
      const terms = (
        request
          ? ["refCode", "name", "email", "description"]
          : ["subject", "email", "name", "refCode"]
      ).map((f) => sqliteLike("p." + f, q));
      conditions.push("(" + terms.map((t) => t.sql).join(" OR ") + ")");
      values.push(...terms.map((t) => t.value));
    }
    return { where: conditions.join(" AND "), values };
  }
  async list(
    actor: AuthUser,
    kind: Kind,
    query: Query,
  ): Promise<AdministrativeList> {
    requirePermission(
      actor,
      kind === "requests" ? "requests.view.all" : "inquiries.view.all",
    );
    const { where, values } = this.filters(kind, query),
      table = tableFor(kind),
      mt = messageFor(kind),
      fk = keyFor(kind),
      page = pageNumber(query.page),
      request = kind === "requests";
    const columns = request
      ? "p.id,p.refCode,p.requestType,p.serviceType,p.status,p.priority,COALESCE(c.name,p.name) name,COALESCE(c.email,p.email) email,p.clientId,p.assigneeId,p.createdAt,p.lastActivityAt,p.lastClientReplyAt,p.lastStaffReplyAt,p.archivedAt"
      : "p.id,p.refCode,p.subject,p.category,p.status,p.name,p.email,p.clientId,p.assigneeId,p.createdAt,p.lastActivityAt,p.archivedAt";
    const [count, rows, staff] = await Promise.all([
      this.db.query(`SELECT COUNT(*) n FROM ${table} p WHERE ${where}`, values),
      this.db.query(
        `SELECT ${columns},u.name assigneeName,(SELECT COUNT(*) FROM ${mt} m WHERE m.${fk}=p.id) messageCount FROM ${table} p LEFT JOIN User u ON u.id=p.assigneeId ${request ? "LEFT JOIN User c ON c.id=p.clientId" : ""} WHERE ${where} ORDER BY p.lastActivityAt DESC LIMIT 20 OFFSET ?`,
        [...values, (page - 1) * 20],
      ),
      request
        ? this.db.query(
            "SELECT id,name FROM User WHERE roleKey IN ('super_admin','ops_manager','support') AND status='active' ORDER BY name",
          )
        : [],
    ]);
    const messages: Array<{
      parentId: string;
      authorType: string;
      createdAt: Date;
    }> = rows.length
      ? await this.db.query(
          `SELECT ${fk} parentId,authorType,createdAt FROM ${mt} WHERE kind='message' AND ${fk} IN (${rows.map(() => "?").join(",")}) ORDER BY createdAt ASC`,
          rows.map((r: { id: string }) => r.id),
        )
      : [];
    const last = new Map(messages.map((m) => [m.parentId, m]));
    const result = rows.map(
      (row: {
        id: string;
        status: string;
        archivedAt: Date | null;
        createdAt: Date;
        messageCount: number | string;
        lastStaffReplyAt?: Date | null;
        lastClientReplyAt?: Date | null;
      }) => {
        const message = last.get(row.id),
          open =
            row.status !== "closed" &&
            row.status !== "cancelled" &&
            (request || row.archivedAt === null);
        const awaitingSince = open
          ? message
            ? message.authorType === "client"
              ? message.createdAt.toISOString()
              : null
            : !request || row.lastStaffReplyAt === null
              ? row.createdAt.toISOString()
              : null
          : null;
        return {
          ...row,
          messageCount: Number(row.messageCount),
          awaitingSince,
          ...(request
            ? {
                needsStaffReply:
                  row.lastStaffReplyAt === null ||
                  (row.lastClientReplyAt !== null &&
                    (row.lastClientReplyAt ?? new Date(0)) >
                      (row.lastStaffReplyAt ?? new Date(0))),
              }
            : {}),
        };
      },
    );
    return {
      ok: true,
      total: Number(count[0].n),
      page,
      pageSize: 20,
      ...(request ? { requests: result, staff } : { inquiries: result }),
    };
  }
  async detail(
    actor: AuthUser,
    kind: Kind,
    id: string,
  ): Promise<Record<string, unknown>> {
    requirePermission(
      actor,
      kind === "requests" ? "requests.view.all" : "inquiries.view.all",
    );
    if (kind === "requests")
      return new RequestService(this.db).detail(actor, id);
    const [inquiry]: Inquiry[] = await this.db.query(
      "SELECT * FROM Inquiry WHERE id=?",
      [id],
    );
    if (!inquiry) throw new AuthFault(404, "not_found");
    const [messages, attachments, clients, assignees] = await Promise.all([
      this.db.query(
        "SELECT m.*,u.name authorName,u.roleKey authorRole FROM InquiryMessage m LEFT JOIN User u ON u.id=m.authorId WHERE m.inquiryId=? ORDER BY m.createdAt ASC",
        [id],
      ),
      this.db.query("SELECT * FROM Attachment WHERE inquiryId=?", [id]),
      this.db.query("SELECT id,name,email FROM User WHERE id=?", [
        inquiry.clientId,
      ]),
      this.db.query("SELECT id,name FROM User WHERE id=?", [
        inquiry.assigneeId,
      ]),
    ]);
    return {
      ok: true,
      inquiry: {
        ...inquiry,
        messages: messages.map((m: Record<string, unknown>) => {
          const { authorName, authorRole, ...safe } = m;
          return {
            ...safe,
            author:
              authorName === null
                ? null
                : { name: authorName, roleKey: authorRole },
          };
        }),
        attachments,
        client: clients[0] ?? null,
        assignee: assignees[0] ?? null,
      },
    };
  }
  private async notice(
    r: QueryRunner,
    userId: string,
    type: string,
    payload: Record<string, string>,
    link: string,
  ) {
    await insertRecord(r, "Notification", {
      id: newId(),
      userId,
      type,
      payload: JSON.stringify(payload),
      link,
    });
  }
  async patch(
    actor: AuthUser,
    kind: Kind,
    id: string,
    body: Record<string, unknown>,
  ) {
    const table = tableFor(kind),
      request = kind === "requests";
    return transaction(this.db, async (r) => {
      const [record]: Array<ProjectRequest & Inquiry> = await r.query(
        `SELECT * FROM ${table} WHERE id=? FOR UPDATE`,
        [id],
      );
      if (!record) throw new AuthFault(404, "not_found");
      if ("assigneeId" in body) {
        requirePermission(
          actor,
          request ? "requests.assign" : "inquiries.assign",
        );
        const assigneeId =
          body.assigneeId === null || body.assigneeId === ""
            ? null
            : String(body.assigneeId);
        if (assigneeId) {
          const [assignee] = await r.query(
            "SELECT status,roleKey FROM User WHERE id=?",
            [assigneeId],
          );
          if (
            !assignee ||
            assignee.status !== "active" ||
            assignee.roleKey === "client"
          )
            throw new AuthFault(400, "invalid_assignee");
          if (request)
            await this.notice(
              r,
              assigneeId,
              "request_assigned",
              { ref: record.refCode },
              "/ar/admin/requests/" + id,
            );
        }
        await r.query(
          `UPDATE ${table} SET assigneeId=?,lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
          [assigneeId, id],
        );
        await audit(
          r,
          request ? "request.assigned" : "inquiry.assigned",
          actor,
          request
            ? { from: record.assigneeId, to: assigneeId, ref: record.refCode }
            : { to: assigneeId },
          request ? "request" : "inquiry",
          id,
        );
        return { ok: true };
      }
      if (request && "priority" in body) {
        requirePermission(actor, "requests.status");
        const priority = String(body.priority);
        if (!(REQUEST_PRIORITIES as readonly string[]).includes(priority))
          throw new AuthFault(400, "invalid");
        await r.query(
          "UPDATE ProjectRequest SET priority=?,lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
          [priority, id],
        );
        await audit(
          r,
          "request.priority_changed",
          actor,
          { from: record.priority, to: priority },
          "request",
          id,
        );
        return { ok: true };
      }
      if (request && (body.action === "archive" || body.action === "restore"))
        return this.archiveOne(r, actor, kind, id, body.action);
      if ("status" in body) {
        requirePermission(
          actor,
          request ? "requests.status" : "inquiries.status",
        );
        const to = String(body.status);
        if (
          !(
            request ? (REQUEST_STATUSES as readonly string[]) : inquiryStatuses
          ).includes(to)
        )
          throw new AuthFault(400, "invalid");
        if (request && !canTransition(record.status, to, "staff"))
          throw new AuthFault(409, "invalid_transition");
        const closed = to === "closed" || to === "cancelled",
          note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
        if (request) {
          await r.query(
            "UPDATE ProjectRequest SET status=?,lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3),closedAt=?,resolutionNote=? WHERE id=?",
            [
              to,
              closed ? new Date() : null,
              closed ? note : record.resolutionNote,
              id,
            ],
          );
          await insertRecord(r, "RequestStatusEvent", {
            id: newId(),
            requestId: id,
            fromStatus: record.status,
            toStatus: to,
            changedById: actor.id,
            note,
          });
          await insertRecord(r, "RequestMessage", {
            id: newId(),
            requestId: id,
            authorId: actor.id,
            authorType: "system",
            kind: "system",
            body: `status:${to}${note ? ": " + note : ""}`,
          });
        } else {
          await r.query(
            "UPDATE Inquiry SET status=?,lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3),closedAt=? WHERE id=?",
            [to, to === "closed" ? new Date() : record.closedAt, id],
          );
          await insertRecord(r, "InquiryMessage", {
            id: newId(),
            inquiryId: id,
            authorId: actor.id,
            authorType: "system",
            kind: "system",
            body: "status:" + to,
          });
        }
        await audit(
          r,
          request ? "request.status_changed" : "inquiry.status_changed",
          actor,
          request
            ? { from: record.status, to, note, ref: record.refCode }
            : { from: record.status, to },
          request ? "request" : "inquiry",
          id,
        );
        if (record.clientId)
          await this.notice(
            r,
            record.clientId,
            to === "awaiting_info" ? "info_requested" : "status_changed",
            { ref: record.refCode, status: to },
            `/${request ? "ar" : record.locale}/account/${kind}/${id}`,
          );
        return { ok: true };
      }
      if (!request && (body.action === "archive" || body.action === "restore"))
        return this.archiveOne(r, actor, kind, id, body.action);
      throw new AuthFault(400, "invalid");
    });
  }
  private async archiveOne(
    r: QueryRunner,
    actor: AuthUser,
    kind: Kind,
    id: string,
    action: "archive" | "restore",
  ) {
    requirePermission(
      actor,
      kind === "requests" ? "requests.archive" : "inquiries.archive",
    );
    await r.query(
      `UPDATE ${tableFor(kind)} SET archivedAt=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
      [action === "archive" ? new Date() : null, id],
    );
    if (kind === "requests")
      await audit(
        r,
        action === "archive" ? "request.archived" : "request.restored",
        actor,
        {},
        "request",
        id,
      );
    return { ok: true };
  }
  async bulk(actor: AuthUser, kind: Kind, body: Record<string, unknown>) {
    requirePermission(
      actor,
      kind === "requests" ? "requests.archive" : "inquiries.archive",
    );
    const ids = Array.isArray(body.ids)
        ? [...new Set(body.ids.map(String).slice(0, 100))].sort()
        : [],
      action = String(body.action ?? "");
    if (!ids.length || !["archive", "restore"].includes(action))
      throw new AuthFault(400, "invalid");
    return transaction(this.db, async (r) => {
      const table = tableFor(kind),
        where = `id IN (${ids.map(() => "?").join(",")}) AND archivedAt IS ${action === "archive" ? "" : "NOT "}NULL`;
      const rows = await r.query(
        `SELECT id FROM ${table} WHERE ${where} ORDER BY id FOR UPDATE`,
        ids,
      );
      if (rows.length)
        await r.query(
          `UPDATE ${table} SET archivedAt=?,updatedAt=UTC_TIMESTAMP(3) WHERE ${where}`,
          [action === "archive" ? new Date() : null, ...ids],
        );
      await audit(
        r,
        `${kind === "requests" ? "request" : "inquiry"}.${action === "archive" ? "archived" : "restored"}`,
        actor,
        { bulk: true, count: rows.length },
        kind === "requests" ? "request" : "inquiry",
      );
      return { ok: true, count: rows.length };
    });
  }
  async inquiryMessage(
    actor: AuthUser,
    id: string,
    input: Record<string, unknown>,
  ) {
    requirePermission(actor, "inquiries.reply");
    const text = String(input.body ?? "")
        .trim()
        .slice(0, 8000),
      kind = input.kind === "internal_note" ? "internal_note" : "message";
    if (!text) throw new AuthFault(400, "empty");
    return transaction(this.db, async (r) => {
      const [inquiry]: Inquiry[] = await r.query(
        "SELECT * FROM Inquiry WHERE id=? FOR UPDATE",
        [id],
      );
      if (!inquiry) throw new AuthFault(404, "not_found");
      const [recent] = await r.query(
        "SELECT * FROM InquiryMessage WHERE inquiryId=? AND authorId=? AND createdAt>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) ORDER BY createdAt DESC LIMIT 1",
        [id, actor.id],
      );
      if (recent && fingerprint(recent.body) === fingerprint(text))
        return { ok: true, message: recent };
      const messageId = newId();
      await insertRecord(r, "InquiryMessage", {
        id: messageId,
        inquiryId: id,
        authorId: actor.id,
        authorType: "staff",
        kind,
        body: text,
      });
      await r.query(
        `UPDATE Inquiry SET lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3)${kind === "message" ? ",status='responded'" : ""} WHERE id=?`,
        [id],
      );
      await audit(
        r,
        "inquiry.replied",
        actor,
        { kind, ref: inquiry.refCode },
        "inquiry",
        id,
      );
      if (kind === "message" && inquiry.clientId)
        await this.notice(
          r,
          inquiry.clientId,
          "reply_received",
          { ref: inquiry.refCode },
          `/${inquiry.locale}/account/inquiries/${id}`,
        );
      const [message] = await r.query(
        "SELECT * FROM InquiryMessage WHERE id=?",
        [messageId],
      );
      return { ok: true, message };
    });
  }
  async csv(actor: AuthUser, kind: Kind, query: Query) {
    requirePermission(
      actor,
      kind === "requests" ? "requests.export" : "inquiries.export",
    );
    const { where, values } = this.filters(kind, query, true),
      request = kind === "requests";
    const rows = await this.db.query(
      `SELECT p.*,u.email assigneeEmail ${request ? "" : ",(SELECT m.createdAt FROM InquiryMessage m WHERE m.inquiryId=p.id ORDER BY m.createdAt DESC LIMIT 1) lastMessageAt"} FROM ${tableFor(kind)} p LEFT JOIN User u ON u.id=p.assigneeId WHERE ${where} ORDER BY ${request ? "p.lastActivityAt" : "p.createdAt"} DESC LIMIT 5000`,
      values,
    );
    const columns = request
      ? [
          "refCode",
          "status",
          "priority",
          "service",
          "clientName",
          "clientEmail",
          "assigneeEmail",
          "budget",
          "currency",
          "timeline",
          "contactPref",
          "createdAt",
          "lastMessageAt",
          "closedReason",
          "archived",
        ]
      : [
          "refCode",
          "id",
          "subject",
          "category",
          "status",
          "name",
          "email",
          "assignedTo",
          "createdAt",
          "lastMessageAt",
          "archived",
        ];
    const value = (v: unknown) => {
      let s =
        v instanceof Date
          ? v.toISOString()
          : v === null || v === undefined
            ? ""
            : String(v);
      if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
    };
    const lines = rows.map((r: Record<string, unknown>) =>
      (request
        ? [
            r.refCode,
            r.status,
            r.priority,
            r.serviceType,
            r.name,
            r.email,
            r.assigneeEmail,
            r.budget,
            r.currency,
            r.timeline,
            r.preferredContact,
            r.createdAt,
            r.lastActivityAt,
            r.resolutionNote,
            r.archivedAt ? "1" : "0",
          ]
        : [
            r.refCode,
            r.id,
            r.subject,
            r.category,
            r.status,
            r.name,
            r.email,
            r.assigneeEmail,
            r.createdAt,
            r.lastMessageAt ?? r.updatedAt,
            r.archivedAt ? "1" : "0",
          ]
      )
        .map(value)
        .join(","),
    );
    await transaction(this.db, (r) =>
      audit(
        r,
        request ? "requests.exported" : "inquiries.exported",
        actor,
        { count: rows.length, filters: query },
        request ? "project_request" : "inquiry",
      ),
    );
    return "\uFEFF" + [columns.join(","), ...lines].join("\r\n") + "\r\n";
  }
}
