import type { DataSource } from "typeorm";
import {
  can,
  canAccessRequest,
  canAccessInquiry,
  type AuthUser,
} from "@so7ob/contracts";
import type {
  Attachment,
  MediaItem,
  ProjectRequest,
  Inquiry,
} from "../database/models.js";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { insertRecord, notifyStaff } from "../business/persistence.js";
import { pageNumber } from "../business/account.js";
import { FileStore, type StoredUpload } from "./storage.js";
import { MEDIA_MIME } from "./upload-validation.js";
import { FileCleanupQueue } from "./cleanup.js";
import type { TrackService, TrackContext } from "../track/service.js";
export class FileService {
  constructor(
    private readonly db: DataSource,
    private readonly files = new FileStore(),
  ) {}
  private permission(user: AuthUser, key: "media.upload" | "media.manage") {
    if (!can(user, key)) throw new AuthFault(403, "forbidden");
  }
  private async persisted<T>(
    stored: StoredUpload,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      // A commit acknowledgement can be lost. Never unlink a file based only on a transaction exception.
      // The durable cleanup worker rechecks all live metadata before removal. If DB is unavailable, retain bytes for reconciliation.
      try {
        await transaction(this.db, (r) =>
          new FileCleanupQueue(this.db, this.files).enqueue(
            r,
            stored.storedName,
          ),
        );
      } catch {
        process.stderr.write("upload_cleanup_deferred: database_unavailable\n");
      }
      throw error;
    }
  }
  async uploadAttachment(user: AuthUser, requestId: string, file: File) {
    const [request]: ProjectRequest[] = await this.db.query(
      "SELECT * FROM ProjectRequest WHERE id=?",
      [requestId],
    );
    this.canUpload(user, request);
    const stored = await this.files.store(file, "attachment");
    if ("error" in stored) throw new AuthFault(400, stored.error);
    return this.persisted(stored, () =>
      transaction(this.db, async (r) => {
        const [locked]: ProjectRequest[] = await r.query(
          "SELECT * FROM ProjectRequest WHERE id=? FOR UPDATE",
          [requestId],
        );
        this.canUpload(user, locked);
        const id = newId();
        await insertRecord(r, "Attachment", {
          id,
          ...stored,
          kind: "request_attachment",
          uploaderId: user.id,
          requestId,
        });
        await r.query(
          "UPDATE ProjectRequest SET lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
          [requestId],
        );
        await audit(
          r,
          "attachment.uploaded",
          user,
          { requestId, filename: stored.filename, size: stored.size },
          "attachment",
          id,
        );
        const payload = { ref: locked.refCode, attachment: stored.filename };
        if (user.roleKey === "client") {
          if (locked.assigneeId)
            await insertRecord(r, "Notification", {
              id: newId(),
              userId: locked.assigneeId,
              type: "reply_received",
              payload: JSON.stringify(payload),
              link: "/ar/admin/requests/" + requestId,
            });
          else
            await notifyStaff(
              r,
              "reply_received",
              payload,
              "/ar/admin/requests/" + requestId,
            );
        } else if (locked.clientId)
          await insertRecord(r, "Notification", {
            id: newId(),
            userId: locked.clientId,
            type: "reply_received",
            payload: JSON.stringify(payload),
            link: "/ar/account/requests/" + requestId,
          });
        return {
          ok: true,
          attachment: {
            id,
            filename: stored.filename,
            size: stored.size,
            mimeType: stored.mimeType,
          },
        };
      }),
    );
  }
  private canUpload(user: AuthUser, request: ProjectRequest | undefined) {
    if (!request) throw new AuthFault(404, "not_found");
    if (!canAccessRequest(user, request)) throw new AuthFault(403, "forbidden");
    if (
      user.roleKey === "client" &&
      ["closed", "cancelled"].includes(request.status)
    )
      throw new AuthFault(409, "locked");
  }
  async attachment(user: AuthUser, id: string) {
    const [record]: Attachment[] = await this.db.query(
      "SELECT * FROM Attachment WHERE id=?",
      [id],
    );
    if (!record) throw new AuthFault(404, "not_found");
    let allowed = false;
    if (record.requestId) {
      const [request]: ProjectRequest[] = await this.db.query(
        "SELECT clientId,assigneeId FROM ProjectRequest WHERE id=?",
        [record.requestId],
      );
      allowed = !!request && canAccessRequest(user, request);
    } else if (record.inquiryId) {
      const [inquiry]: Inquiry[] = await this.db.query(
        "SELECT clientId FROM Inquiry WHERE id=?",
        [record.inquiryId],
      );
      allowed = !!inquiry && canAccessInquiry(user, inquiry);
    } else allowed = record.uploaderId === user.id;
    if (!allowed) throw new AuthFault(403, "forbidden");
    if (user.roleKey === "client" && record.messageId) {
      const internal = await this.db.query(
        "SELECT id FROM RequestMessage WHERE id=? AND kind='internal_note' UNION ALL SELECT id FROM InquiryMessage WHERE id=? AND kind='internal_note' LIMIT 1",
        [record.messageId, record.messageId],
      );
      if (internal.length) throw new AuthFault(403, "forbidden");
    }
    const file = await this.files.read(record.storedName);
    if (!file) throw new AuthFault(404, "not_found");
    return { ...file, mimeType: record.mimeType, filename: record.filename };
  }
  async trackedAttachment(tracks: TrackService, context: TrackContext, id: string) {
    if (!await tracks.guestAttachment(id, context)) throw new AuthFault(403, "forbidden");
    const [record]: Attachment[] = await this.db.query("SELECT * FROM Attachment WHERE id=?", [id]);
    if (!record) throw new AuthFault(404, "not_found");
    const file = await this.files.read(record.storedName);
    if (!file) throw new AuthFault(404, "not_found");
    return { ...file, mimeType: record.mimeType, filename: record.filename };
  }
  async media(id: string) {
    const [record]: MediaItem[] = await this.db.query(
      "SELECT * FROM MediaItem WHERE id=?",
      [id],
    );
    if (!record || !Object.hasOwn(MEDIA_MIME, record.mimeType))
      throw new AuthFault(404, "not_found");
    const file = await this.files.read(record.storedName);
    if (!file) throw new AuthFault(404, "not_found");
    return { ...file, mimeType: record.mimeType, filename: record.filename };
  }
  async listMedia(user: AuthUser, rawPage?: string) {
    this.permission(user, "media.manage");
    const page = pageNumber(rawPage),
      pageSize = 24;
    const [[count], rows] = await Promise.all([
      this.db.query("SELECT COUNT(*) n FROM MediaItem"),
      this.db.query(
        "SELECT m.id,m.filename,m.mimeType,m.size,m.altText,m.title,m.createdAt,u.name uploadedBy FROM MediaItem m LEFT JOIN User u ON u.id=m.uploadedById ORDER BY m.createdAt DESC LIMIT ? OFFSET ?",
        [pageSize, (page - 1) * pageSize],
      ),
    ]);
    return {
      ok: true,
      total: Number(count.n),
      page,
      pageSize,
      media: rows.map((m: Record<string, unknown>) => ({
        ...m,
        url: "/api/media/" + m.id,
        uploadedBy: m.uploadedBy ?? "—",
      })),
    };
  }
  async uploadMedia(user: AuthUser, file: File, altText: string) {
    this.permission(user, "media.upload");
    const stored = await this.files.store(file, "media");
    if ("error" in stored) throw new AuthFault(400, stored.error);
    return this.persisted(stored, () =>
      transaction(this.db, async (r) => {
        const id = newId();
        await insertRecord(r, "MediaItem", {
          id,
          ...stored,
          altText: altText.slice(0, 300) || null,
          uploadedById: user.id,
        });
        await audit(
          r,
          "media.uploaded",
          user,
          { filename: stored.filename, size: stored.size },
          "media",
          id,
        );
        return {
          ok: true,
          media: { id, url: "/api/media/" + id, filename: stored.filename },
        };
      }),
    );
  }
  async updateMedia(
    user: AuthUser,
    id: string,
    body: { altText?: unknown; title?: unknown },
  ) {
    this.permission(user, "media.manage");
    const updates: Record<string, string | null> = {};
    if (typeof body.altText === "string")
      updates.altText = body.altText.slice(0, 300) || null;
    if (typeof body.title === "string")
      updates.title = body.title.slice(0, 200) || null;
    if (!Object.keys(updates).length) throw new AuthFault(400, "invalid");
    return transaction(this.db, async (r) => {
      const [row] = await r.query(
        "SELECT id FROM MediaItem WHERE id=? FOR UPDATE",
        [id],
      );
      if (!row) throw new AuthFault(404, "not_found");
      await r.query(
        "UPDATE MediaItem SET " +
          Object.keys(updates)
            .map((k) => "`" + k + "`=?")
            .join(",") +
          " WHERE id=?",
        [...Object.values(updates), id],
      );
      const [media] = await r.query(
        "SELECT id,altText,title FROM MediaItem WHERE id=?",
        [id],
      );
      return { ok: true, media };
    });
  }
  async deleteMedia(user: AuthUser, id: string) {
    this.permission(user, "media.manage");
    return transaction(this.db, async (r) => {
      const [item]: MediaItem[] = await r.query(
        "SELECT * FROM MediaItem WHERE id=? FOR UPDATE",
        [id],
      );
      if (!item) throw new AuthFault(404, "not_found");
      await r.query("DELETE FROM MediaItem WHERE id=?", [id]);
      await new FileCleanupQueue(this.db, this.files).enqueue(
        r,
        item.storedName,
      );
      await audit(
        r,
        "media.deleted",
        user,
        { filename: item.filename },
        "media",
        id,
      );
      return { ok: true };
    });
  }
}
