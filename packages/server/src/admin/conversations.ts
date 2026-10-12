import {responsePolicy,responseDueSql,responseDeadline} from "./response-policy.js";
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enqueueTrackStaffReply } from "../track/notify.js";
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
export const CSV_LIMITS = { rows:100000, bytes:32*1024*1024, batch:250, milliseconds:30000, concurrent:2 } as const;
let activeExports=0;
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
  constructor(private readonly db: DataSource, private readonly env: NodeJS.ProcessEnv = process.env) {}
  private filters(kind: Kind, query: Query, hours=24) {
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
    if (request && query.from) {
      const date = new Date(query.from);
      if (!Number.isFinite(date.getTime())) throw new AuthFault(400, "invalid");
      conditions.push("p.createdAt>=?");
      values.push(date);
    }
    if (request && query.overdue === "1") {conditions.push(responseDueSql('p')+'<UTC_TIMESTAMP(3)');values.push(hours);}
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
    const policy=await responsePolicy(this.db);
    const { where, values } = this.filters(kind, query,policy.hours),
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
            "SELECT id,name FROM User WHERE roleKey IN (SELECT `key` FROM Role WHERE status='active' AND (`key`='super_admin' OR JSON_CONTAINS(permissions, '\"requests.view.all\"'))) AND status='active' ORDER BY name",
          )
        : [],
    ]);
    const messages: Array<{
      parentId: string;
      authorType: string;
      createdAt: Date;
    }> = !request && rows.length
      ? await this.db.query(
          // The existing (inquiryId, createdAt) index supports the backward lookup.
          // Requests already have persisted last-reply timestamps; no history read is needed.
          `SELECT m.${fk} parentId,m.authorType,m.createdAt FROM ${table} p JOIN ${mt} m ON m.id=(SELECT recent.id FROM ${mt} recent WHERE recent.${fk}=p.id AND recent.kind='message' ORDER BY recent.createdAt DESC,recent.id DESC LIMIT 1) WHERE p.id IN (${rows.map(() => "?").join(",")})`,
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
                ...responseDeadline(row,policy.hours),
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
    // Exactly one mutation per PATCH. Presence is not truthiness: null/false/0/""
    // remain supplied values and are validated by the selected operation.
    const operations = ["assigneeId", "priority", "status", "action"].filter(
      key => Object.hasOwn(body, key) && body[key] !== undefined,
    );
    if (operations.length !== 1 || (!request && operations[0] === "priority") ||
        (body.note !== undefined && operations[0] !== "status"))
      throw new AuthFault(400, "invalid");
    const operation = operations[0], value = body[operation];
    if ((operation === "assigneeId" ? value !== null && typeof value !== "string" : typeof value !== "string") ||
        (body.note !== undefined && body.note !== null && typeof body.note !== "string"))
      throw new AuthFault(400, "invalid");
    return transaction(this.db, async (r) => {
      const [record]: Array<ProjectRequest & Inquiry> = await r.query(
        `SELECT * FROM ${table} WHERE id=? FOR UPDATE`,
        [id],
      );
      if (!record) throw new AuthFault(404, "not_found");
      // Compiled DTOs have own undefined fields even when omitted from JSON.
      // Only supplied values select an operation; explicit null still unassigns.
      if (Object.hasOwn(body, "assigneeId") && body.assigneeId !== undefined) {
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
            "SELECT u.status,u.roleKey,r.permissions,r.status roleStatus FROM User u JOIN Role r ON r.`key`=u.roleKey WHERE u.id=?",
            [assigneeId],
          );
          if (
            !assignee ||
            assignee.status !== "active" ||
            assignee.roleStatus !== "active" || !(assignee.roleKey === "super_admin" || JSON.parse(assignee.permissions).includes(request ? "requests.view.all" : "inquiries.view.all"))
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
            : { from: record.assigneeId, to: assigneeId, ref: record.refCode },
          request ? "request" : "inquiry",
          id,
        );
        return { ok: true };
      }
      if (request && Object.hasOwn(body, "priority") && body.priority !== undefined) {
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
          { from: record.priority, to: priority, ref: record.refCode },
          "request",
          id,
        );
        return { ok: true };
      }
      if (request && (body.action === "archive" || body.action === "restore"))
        return this.archiveOne(r, actor, kind, id, body.action);
      if (Object.hasOwn(body, "status") && body.status !== undefined) {
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
            : { from: record.status, to, ref: record.refCode },
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
    const [before] = await r.query(`SELECT archivedAt,refCode FROM ${tableFor(kind)} WHERE id=? FOR UPDATE`,[id]);
    if(!before)throw new AuthFault(404,'not_found');
    const after=action==='archive'?(before.archivedAt??new Date()):null;
    const unchanged=Boolean(before.archivedAt)===Boolean(after);
    if(!unchanged)await r.query(`UPDATE ${tableFor(kind)} SET archivedAt=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,[after,id]);
    await audit(r,`${kind==='requests'?'request':'inquiry'}.${action==='archive'?'archived':'restored'}`,actor,{ref:before.refCode},kind==='requests'?'request':'inquiry',id,undefined,{before:{archivedAt:before.archivedAt},after:{archivedAt:after},...(unchanged?{reasonCode:'no_change'}:{})});
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
        `SELECT id,refCode,archivedAt FROM ${table} WHERE ${where} ORDER BY id FOR UPDATE`,
        ids,
      );
      const batchId=newId(),after=action==='archive'?new Date():null;
      if(rows.length)await r.query(`UPDATE ${table} SET archivedAt=?,updatedAt=UTC_TIMESTAMP(3) WHERE ${where}`,[after,...ids]);
      for(const row of rows)await audit(r,`${kind==='requests'?'request':'inquiry'}.${action==='archive'?'archived':'restored'}`,actor,{ref:row.refCode},kind==='requests'?'request':'inquiry',row.id,undefined,{batchId,before:{archivedAt:row.archivedAt},after:{archivedAt:after}});
      await audit(r,'batch.completed',actor,{count:rows.length,requested:ids.length,unchanged:ids.length-rows.length,operation:action},'batch',batchId,undefined,{batchId});
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
      if (kind === "message") await enqueueTrackStaffReply(this.db,r,"inquiry",inquiry,messageId,text,this.env);
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
    const policy=await responsePolicy(this.db);
    const { where, values } = this.filters(kind, query,policy.hours),
      request = kind === "requests";
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
    const line = (r: Record<string, unknown>) =>
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
        .join(",") + "\r\n";
    if (activeExports >= CSV_LIMITS.concurrent) throw new AuthFault(503,'export_busy');
    activeExports++;
    let directory: string | undefined;
    let handedOff=false;
    const runner = this.db.createQueryRunner();
    try {
      directory = await mkdtemp(join(tmpdir(),'so7ob-csv-'));
      const path = join(directory,'export.csv');
      const file = await open(path,'wx',0o600);
      let count=0, bytes=0;
      const started=Date.now();
      try {
        await runner.connect(); await runner.startTransaction('REPEATABLE READ');
        const [total] = await runner.query(`SELECT COUNT(*) n FROM ${tableFor(kind)} p WHERE ${where}`,values);
        if(Number(total.n)>CSV_LIMITS.rows) throw new AuthFault(413,'export_limit',{count:Number(total.n),maxRows:CSV_LIMITS.rows});
        const write = async (chunk:string) => {
          bytes+=Buffer.byteLength(chunk);
          if(bytes>CSV_LIMITS.bytes) throw new AuthFault(413,'export_limit',{count:Number(total.n),maxBytes:CSV_LIMITS.bytes});
          if(Date.now()-started>CSV_LIMITS.milliseconds) throw new AuthFault(503,'export_timeout');
          await file.writeFile(chunk);
        };
        await write('\uFEFF'+columns.join(',')+'\r\n');
        const selected = request
          ? 'p.refCode,p.status,p.priority,p.serviceType,p.name,p.email,p.budget,p.currency,p.timeline,p.preferredContact,p.createdAt,p.lastActivityAt,p.resolutionNote,p.archivedAt'
          : 'p.refCode,p.id,p.subject,p.category,p.status,p.name,p.email,p.createdAt,p.updatedAt,p.archivedAt,(SELECT m.createdAt FROM InquiryMessage m WHERE m.inquiryId=p.id ORDER BY m.createdAt DESC LIMIT 1) lastMessageAt';
        // Evaluate Unicode-preserving search once in the snapshot; page bounded rows by ordinal.
        await runner.query('CREATE TEMPORARY TABLE so7ob_export_selection (ordinal BIGINT PRIMARY KEY,id VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin');
        await runner.query(`INSERT INTO so7ob_export_selection(ordinal,id) SELECT ROW_NUMBER() OVER (ORDER BY ${request?'p.lastActivityAt':'p.createdAt'} DESC,p.id DESC),p.id FROM ${tableFor(kind)} p WHERE ${where}`,values);
        while(count<Number(total.n)) {
          const rows:Array<Record<string,unknown>> = await runner.query(
            `SELECT ${selected},u.email assigneeEmail FROM so7ob_export_selection selection JOIN ${tableFor(kind)} p ON p.id=selection.id LEFT JOIN User u ON u.id=p.assigneeId WHERE selection.ordinal>? AND selection.ordinal<=? ORDER BY selection.ordinal`,
            [count,count+CSV_LIMITS.batch]);
          if(!rows.length) throw new AuthFault(503,'export_incomplete');
          // One bounded write per database batch; retain byte/time/row limits.
          await write(rows.map(line).join(''));
          count+=rows.length;
        }
        await audit(runner,request?'requests.exported':'inquiries.exported',actor,{count,resourceCount:count},'export',null);
        await runner.commitTransaction();
      } finally { await file.close(); }
      const completedDirectory=directory;
      let disposed=false;
      const dispose=async()=>{if(disposed)return;disposed=true;clearTimeout(expiry);try{await rm(completedDirectory,{recursive:true,force:true});}finally{activeExports--;}};
      const expiry=setTimeout(()=>{void dispose();},60000);expiry.unref();
      handedOff=true;
      return {path,count,bytes,dispose};
    } catch(error) {
      if(runner.isTransactionActive) await runner.rollbackTransaction();
      if(directory) await rm(directory,{recursive:true,force:true});
      throw error;
    } finally { try { if(!runner.isReleased)await runner.query('DROP TEMPORARY TABLE IF EXISTS so7ob_export_selection'); } finally { await runner.release();if(!handedOff)activeExports--; } }

  }
}
