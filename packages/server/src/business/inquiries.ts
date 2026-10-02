import type { DataSource } from "typeorm";
import type { AuthUser } from "@so7ob/contracts";
import type { Inquiry, InquiryMessage } from "../database/models.js";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { fingerprint } from "../auth/rate-policy.js";
import { insertRecord, notifyStaff } from "./persistence.js";
import { pageNumber } from "./account.js";
import { sqliteLike } from "./requests.js";
export class InquiryService {
  constructor(private readonly db: DataSource) {}
  private owns(actor: AuthUser, row: Inquiry) {
    return actor.roleKey === "client"
      ? row.clientId === actor.id
      : row.assigneeId === actor.id;
  }
  async list(
    actor: AuthUser,
    query: { q?: string; status?: string; page?: string },
  ) {
    const q = (query.q ?? "").trim().slice(0, 100),
      page = pageNumber(query.page),
      pageSize = 20;
    const values: unknown[] = [actor.id];
    let where =
      (actor.roleKey === "client" ? "i.clientId" : "i.assigneeId") +
      "=? AND i.archivedAt IS NULL";
    if (query.status === "open")
      where +=
        " AND i.status IN ('new','in_review','awaiting_info','responded')";
    else if (
      query.status &&
      ["new", "in_review", "awaiting_info", "responded", "closed"].includes(
        query.status,
      )
    ) {
      where += " AND i.status=?";
      values.push(query.status);
    }
    if (q.length >= 2) {
      const ref = sqliteLike("i.refCode", q.toUpperCase()),
        subject = sqliteLike("i.subject", q);
      where += " AND (" + ref.sql + " OR " + subject.sql + ")";
      values.push(ref.value, subject.value);
    }
    const [[count], rows] = await Promise.all([
      this.db.query("SELECT COUNT(*) n FROM Inquiry i WHERE " + where, values),
      this.db.query(
        `SELECT i.id,i.refCode,i.subject,i.category,i.status,i.locale,i.createdAt,i.lastActivityAt,i.closedAt,u.name assigneeName,(SELECT COUNT(*) FROM InquiryMessage m WHERE m.inquiryId=i.id AND m.kind='message') messageCount FROM Inquiry i LEFT JOIN User u ON u.id=i.assigneeId WHERE ${where} ORDER BY i.lastActivityAt DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
    ]);
    return {
      ok: true,
      total: Number(count.n),
      page,
      pageSize,
      inquiries: rows.map((r: Record<string, unknown>) => ({
        ...r,
        messageCount: Number(r.messageCount),
      })),
    };
  }
  async detail(actor: AuthUser, id: string) {
    const [inquiry]: Inquiry[] = await this.db.query(
      "SELECT * FROM Inquiry WHERE id=?",
      [id],
    );
    if (!inquiry || !this.owns(actor, inquiry))
      throw new AuthFault(404, "not_found");
    const client = actor.roleKey === "client";
    const [messages, attachments, assignees] = await Promise.all([
      this.db.query(
        `SELECT m.*,u.name authorName,u.roleKey authorRole FROM InquiryMessage m LEFT JOIN User u ON u.id=m.authorId WHERE m.inquiryId=? ${client ? "AND m.kind<>'internal_note'" : ""} ORDER BY m.createdAt ASC`,
        [id],
      ),
      this.db.query(
        `SELECT a.* FROM Attachment a WHERE a.inquiryId=? ${client ? "AND (a.messageId IS NULL OR NOT EXISTS(SELECT 1 FROM InquiryMessage m WHERE m.id=a.messageId AND m.kind='internal_note'))" : ""}`,
        [id],
      ),
      this.db.query("SELECT id,name FROM User WHERE id=?", [
        inquiry.assigneeId,
      ]),
    ]);
    return {
      ok: true,
      inquiry: {
        ...inquiry,
        messages: messages.map((m: Record<string, unknown>) => {
          const { authorName, authorRole, ...row } = m;
          return {
            ...row,
            author:
              authorName === null
                ? null
                : { name: authorName, roleKey: authorRole },
          };
        }),
        attachments,
        assignee: assignees[0] ?? null,
      },
    };
  }
  async message(actor: AuthUser, id: string, body: unknown) {
    return transaction(this.db, async (r) => {
      const [inquiry]: Inquiry[] = await r.query(
        "SELECT * FROM Inquiry WHERE id=? FOR UPDATE",
        [id],
      );
      if (!inquiry || !this.owns(actor, inquiry))
        throw new AuthFault(404, "not_found");
      if (inquiry.status === "closed") throw new AuthFault(400, "closed");
      const text = String(body ?? "")
        .trim()
        .slice(0, 8000);
      if (!text) throw new AuthFault(400, "empty");
      const [recent]: InquiryMessage[] = await r.query(
        "SELECT * FROM InquiryMessage WHERE inquiryId=? AND authorId=? AND createdAt>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) ORDER BY createdAt DESC LIMIT 1",
        [id, actor.id],
      );
      if (recent && fingerprint(recent.body) === fingerprint(text))
        return { status: 200, result: { ok: true, message: recent } };
      const messageId = newId();
      await insertRecord(r, "InquiryMessage", {
        id: messageId,
        inquiryId: id,
        authorId: actor.id,
        authorType: "client",
        kind: "message",
        body: text,
      });
      await r.query(
        "UPDATE Inquiry SET lastActivityAt=UTC_TIMESTAMP(3),status='in_review',updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
        [id],
      );
      await audit(
        r,
        "inquiry.replied",
        actor,
        { side: "client", ref: inquiry.refCode },
        "inquiry",
        id,
      );
      const link = `/${inquiry.locale}/admin/inquiries/${id}`,
        payload = { ref: inquiry.refCode };
      if (inquiry.assigneeId)
        await insertRecord(r, "Notification", {
          id: newId(),
          userId: inquiry.assigneeId,
          type: "reply_received",
          payload: JSON.stringify(payload),
          link,
        });
      else await notifyStaff(r, "reply_received", payload, link);
      const [message] = await r.query(
        "SELECT * FROM InquiryMessage WHERE id=?",
        [messageId],
      );
      return { status: 201, result: { ok: true, message } };
    });
  }
}
