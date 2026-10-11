import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  open,
  rename,
  unlink,
  readFile,
  lstat,
  opendir,
} from "node:fs/promises";
import { resolve, join, isAbsolute, basename } from "node:path";
import type { DataSource } from "typeorm";
import { z } from "zod";
import {
  can,
  auditLabel,
  auditTerm,
  auditDisplayValue,
  type AuthUser,
  type AuditEventV1,
  type AuditValue,
} from "@so7ob/contracts";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { lockOperation } from "../business/persistence.js";
import { permit, project, AuditReader } from "./reader.js";
import { validateFilter, predicate } from "./query.js";
import { validated } from "./reviews.js";
export const AUDIT_REPORT_LIMITS = {
  events: 100000,
  bytes: 256 * 1024 * 1024,
  milliseconds: 300000,
  batch: 250,
  attempts: 3,
};
export const csvCell = (v: unknown) => {
  let s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  if (/^[\s\uFEFF]*[=+@-]/u.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function currentAuditActor(
  db: DataSource,
  id: string,
): Promise<AuthUser> {
  const [row] = await db.query(
    "SELECT u.id,u.name,u.email,u.roleKey,u.status,u.locale,r.permissions FROM User u JOIN Role r ON r.`key`=u.roleKey WHERE u.id=?",
    [id],
  );
  if (!row || row.status !== "active") throw new AuthFault(403, "forbidden");
  let permissions = [];
  try {
    permissions = JSON.parse(row.permissions);
  } catch {
    /* deny */
  }
  return {
    ...row,
    permissions: Array.isArray(permissions) ? permissions : [],
    emailVerified: true,
  };
}
export class AuditReports {
  constructor(
    readonly db: DataSource,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}
  async root() {
    if (!this.env.DATA_DIR || !isAbsolute(this.env.DATA_DIR))
      throw new Error("Private absolute DATA_DIR required for audit reports");
    const root = resolve(this.env.DATA_DIR, "audit-reports");
    await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await lstat(root)).isSymbolicLink())
      throw new Error("Report directory must not be a symbolic link");
    return root;
  }
  async create(actor: AuthUser, raw: unknown) {
    permit(actor, "audit.export");
    const input = validated(
      z
        .object({
          format: z.enum(["csv", "json", "html"]),
          scope: z.enum(["page", "selected", "all"]),
          locale: z.enum(["ar", "en"]),
          timezone: z.string().max(80),
          filters: z.unknown(),
        })
        .strict(),
      raw,
    );
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    } catch {
      throw new AuthFault(400, "invalid");
    }
    const filter = validateFilter(input.filters);
    delete filter.cursor;
    if (input.scope !== "all" && !filter.ids?.length)
      throw new AuthFault(400, "required");
    if (input.scope === "all") delete filter.ids;
    return transaction(this.db, async (r) => {
      await lockOperation(r, "audit-report:" + actor.id);
      const [count] = await r.query(
        "SELECT COUNT(*) n FROM AuditReport WHERE userId=? AND status IN ('queued','running')",
        [actor.id],
      );
      if (Number(count.n) >= 3) throw new AuthFault(429, "rate_limited");
      if (filter.ids) {
        const found = await new AuditReader(this.db).search(actor, {
          ...filter,
          limit: 1,
        });
        if (found.stats.events !== filter.ids.length)
          throw new AuthFault(404, "not_found");
      }
      const id = newId();
      await r.query(
        "INSERT INTO AuditReport(id,userId,format,locale,timezone,scope,filters,isSensitive) VALUES(?,?,?,?,?,?,?,?)",
        [
          id,
          actor.id,
          input.format,
          input.locale,
          input.timezone,
          input.scope,
          JSON.stringify(filter),
          can(actor, "audit.sensitive.view"),
        ],
      );
      await audit(
        r,
        "audit.report_requested",
        actor,
        { reportId: id, format: input.format, scope: input.scope },
        "audit_report",
        id,
      );
      return { ok: true, id, status: "queued" };
    });
  }
  async list(actor: AuthUser) {
    permit(actor, "audit.export");
    return {
      ok: true,
      reports: await this.db.query(
        "SELECT id,status,format,locale,timezone,scope,eventCount,resourceCount,bytes,errorCode,attempts,snapshotAt,createdAt,completedAt,expiresAt,checksum FROM AuditReport WHERE userId=? ORDER BY createdAt DESC,id DESC LIMIT 100",
        [actor.id],
      ),
    };
  }
  async cancel(actor: AuthUser, id: string) {
    permit(actor, "audit.export");
    return transaction(this.db, async (r) => {
      const result = await r.query(
        "UPDATE AuditReport SET status='cancelled',leaseToken=NULL,leaseUntil=NULL WHERE id=? AND userId=? AND status IN ('queued','running')",
        [id, actor.id],
      );
      if (!result.affectedRows) throw new AuthFault(409, "conflict");
      await audit(
        r,
        "audit.report_cancelled",
        actor,
        { reportId: id },
        "audit_report",
        id,
      );
      return { ok: true };
    });
  }
  async authorized(actor: AuthUser, id: string) {
    permit(actor, "audit.export");
    const fresh = await currentAuditActor(this.db, actor.id);
    permit(fresh, "audit.export");
    const [job] = await this.db.query(
      "SELECT * FROM AuditReport WHERE id=? AND userId=?",
      [id, actor.id],
    );
    if (!job) throw new AuthFault(404, "not_found");
    if (
      job.status !== "completed" ||
      !job.expiresAt ||
      job.expiresAt <= new Date()
    )
      throw new AuthFault(410, "expired");
    if (job.isSensitive && !can(fresh, "audit.sensitive.view"))
      throw new AuthFault(403, "forbidden");
    if (!job.fileName || basename(job.fileName) !== job.fileName)
      throw new AuthFault(404, "not_found");
    return job;
  }
  async download(actor: AuthUser, id: string, manifest = false) {
    const job = await this.authorized(actor, id);
    const path = join(
      await this.root(),
      job.fileName + (manifest ? ".manifest.json" : ""),
    );
    try {
      const file = await lstat(path);
      if (!file.isFile() || file.isSymbolicLink())
        throw new Error("Unavailable report file");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        await this.db.query(
          "UPDATE AuditReport SET status='expired',errorCode='file_unavailable' WHERE id=? AND status='completed'",
          [id],
        );
        throw new AuthFault(410, "expired");
      }
      throw error;
    }
    await transaction(this.db, (r) =>
      audit(
        r,
        "audit.report_downloaded",
        actor,
        {
          reportId: id,
          count: job.eventCount,
          resourceCount: job.resourceCount,
          format: manifest ? "manifest" : job.format,
        },
        "audit_report",
        id,
      ),
    );
    return { path, format: manifest ? "json" : job.format, id };
  }
  async claim() {
    return transaction(this.db, async (r) => {
      await r.query(
        "UPDATE AuditReport SET status=IF(attempts>=3,'failed','queued'),errorCode='worker_lost',leaseToken=NULL,leaseUntil=NULL WHERE status='running' AND leaseUntil<UTC_TIMESTAMP(3)",
      );
      const [job] = await r.query(
        "SELECT * FROM AuditReport WHERE status='queued' AND availableAt<=UTC_TIMESTAMP(3) AND attempts<3 ORDER BY createdAt,id LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      if (!job) return null;
      const token = randomBytes(32).toString("hex");
      await r.query(
        "UPDATE AuditReport SET status='running',attempts=attempts+1,leaseToken=?,leaseUntil=TIMESTAMPADD(SECOND,60,UTC_TIMESTAMP(3)) WHERE id=?",
        [token, job.id],
      );
      return { ...job, leaseToken: token, attempts: job.attempts + 1 };
    });
  }
  async processOne(): Promise<boolean> {
    const job = await this.claim();
    if (!job) return false;
    let staging: string | undefined, finalPath: string | undefined;
    const runner = this.db.createQueryRunner();
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const actor = await currentAuditActor(this.db, job.userId);
      permit(actor, "audit.export");
      if (job.isSensitive && !can(actor, "audit.sensitive.view"))
        throw new AuthFault(403, "forbidden");
      if (!job.isSensitive) {
        actor.roleKey = "audit_report_projection";
        actor.permissions = actor.permissions.filter(
          (p) => p !== "audit.sensitive.view",
        );
      }
      // Freeze the sensitivity selected at creation even if the owner is later promoted.
      const filter = validateFilter(JSON.parse(job.filters)),
        { sql, args } = predicate(filter, actor),
        root = await this.root(),
        filename = `${job.id}-${job.attempts}.${job.format}`;
      staging = join(root, filename + ".partial");
      finalPath = join(root, filename);
      file = await open(staging, "wx", 0o600);
      await runner.connect();
      await runner.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await runner.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
      const snapshotAt = new Date().toISOString(),
        stats = await new AuditReader(this.db).stats(runner, sql, args);
      if (stats.events > AUDIT_REPORT_LIMITS.events)
        throw new AuthFault(413, "export_limit");
      if (filter.ids && stats.events !== filter.ids.length)
        throw new AuthFault(409, "export_incomplete");
      const metadata = {
        reference: job.id,
        createdAt: new Date(job.createdAt).toISOString(),
        snapshotAt,
        timezone: job.timezone,
        source: "so7ob/web",
        scope: job.scope,
        filters: filter,
        eventCount: stats.events,
        resourceCount: stats.resources,
        locale: job.locale,
        schemaVersion: 1,
      };
      const hash = createHash("sha256"),
        ids: string[] = [];
      let bytes = 0,
        count = 0,
        last: { createdAt: Date; id: string } | undefined;
      const started = Date.now();
      const write = async (s: string) => {
        bytes += Buffer.byteLength(s);
        if (
          bytes > AUDIT_REPORT_LIMITS.bytes ||
          Date.now() - started > AUDIT_REPORT_LIMITS.milliseconds
        )
          throw new AuthFault(413, "export_limit");
        hash.update(s);
        await file!.writeFile(s);
      };
      if (job.format === "csv")
        await write(
          "\uFEFF" +
            [
              "eventId",
              "occurredAtUTC",
              "recordedAtUTC",
              "actor",
              "actorId",
              "roleAtEvent",
              "action",
              "resourceType",
              "resourceId",
              "reference",
              "outcome",
              "reason",
              "source",
              "correlationId",
              "batchId",
              "changes",
            ]
              .map(csvCell)
              .join(",") +
            "\r\n",
        );
      else if (job.format === "json")
        await write('{"report":' + JSON.stringify(metadata) + ',"events":[');
      else
        await write(
          `<!doctype html><html lang="${job.locale}" dir="${job.locale === "ar" ? "rtl" : "ltr"}"><meta charset="utf-8"><title>${escape(job.id)}</title><style>body{font:14px Arial,sans-serif;line-height:1.6;color:#152e42;margin:28px}article{break-inside:avoid;border-bottom:1px solid #bbb;padding:16px 0}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px;text-align:start;overflow-wrap:anywhere}code{direction:ltr;unicode-bidi:isolate}h1{font-size:24px}@page{size:A4;margin:16mm}</style><h1>${job.locale === "ar" ? "تقرير سجل التدقيق" : "Audit report"}</h1><p>${escape(job.id)} · ${escape(snapshotAt)} · ${escape(job.timezone)}</p><p>${job.locale === "ar" ? "عدد الأحداث" : "Events"}: ${stats.events}</p><pre dir="ltr">${escape(JSON.stringify(filter, null, 2))}</pre>`,
        );
      while (count < stats.events) {
        const owned = await this.db.query(
          "SELECT id FROM AuditReport WHERE id=? AND status='running' AND leaseToken=? AND leaseUntil>UTC_TIMESTAMP(3)",
          [job.id, job.leaseToken],
        );
        if (!owned.length) throw new AuthFault(409, "cancelled");
        await this.db.query(
          "UPDATE AuditReport SET leaseUntil=TIMESTAMPADD(SECOND,60,UTC_TIMESTAMP(3)) WHERE id=? AND leaseToken=?",
          [job.id, job.leaseToken],
        );
        const rows = await runner.query(
          `SELECT a.* FROM AuditLog a WHERE ${sql}${last ? " AND (a.createdAt<? OR (a.createdAt=? AND a.id<?))" : ""} ORDER BY a.createdAt DESC,a.id DESC LIMIT ?`,
          [
            ...args,
            ...(last ? [last.createdAt, last.createdAt, last.id] : []),
            AUDIT_REPORT_LIMITS.batch,
          ],
        );
        if (!rows.length) throw new AuthFault(503, "export_incomplete");
        for (const row of rows) {
          const e = project(row, actor);
          ids.push(e.id);
          if (job.format === "csv")
            await write(
              [
                e.id,
                e.occurredAt,
                e.recordedAt,
                e.actor.name,
                e.actor.id,
                e.actor.roleKey,
                e.action,
                e.resource.type,
                e.resource.id,
                e.resource.reference,
                e.outcome,
                e.reasonCode,
                e.source,
                e.correlationId,
                e.batchId,
                e.changes,
              ]
                .map(csvCell)
                .join(",") + "\r\n",
            );
          else if (job.format === "json")
            await write((count ? "," : "") + JSON.stringify(e));
          else await write(this.printEvent(e, job.locale, job.timezone));
          count++;
        }
        last = rows.at(-1);
      }
      if (count !== stats.events) throw new AuthFault(503, "export_incomplete");
      if (job.format === "json") await write("]}");
      else if (job.format === "html") await write("</html>");
      await runner.query("COMMIT");
      await file.sync();
      await file.close();
      file = undefined;
      const checksum = hash.digest("hex");
      const manifest = await open(finalPath + ".manifest.json", "wx", 0o600);
      try {
        await manifest.writeFile(
          JSON.stringify({
            ...metadata,
            eventIds: ids,
            bytes,
            checksum,
            checksumAlgorithm: "sha256",
            integrityClaim:
              "Detects file changes; does not authenticate event origins",
          }),
        );
        await manifest.sync();
      } finally {
        await manifest.close();
      }
      await rename(staging, finalPath);
      staging = undefined;
      await transaction(this.db, async (r) => {
        const result = await r.query(
          "UPDATE AuditReport SET status='completed',eventCount=?,resourceCount=?,bytes=?,checksum=?,fileName=?,snapshotAt=?,completedAt=UTC_TIMESTAMP(3),expiresAt=TIMESTAMPADD(HOUR,24,UTC_TIMESTAMP(3)),leaseToken=NULL,leaseUntil=NULL,errorCode=NULL WHERE id=? AND status='running' AND leaseToken=? AND leaseUntil>UTC_TIMESTAMP(3)",
          [
            count,
            stats.resources,
            bytes,
            checksum,
            filename,
            new Date(snapshotAt),
            job.id,
            job.leaseToken,
          ],
        );
        if (!result.affectedRows) throw new AuthFault(409, "cancelled");
        await audit(
          r,
          "audit.report_completed",
          actor,
          {
            reportId: job.id,
            count,
            resourceCount: stats.resources,
            format: job.format,
          },
          "audit_report",
          job.id,
          undefined,
          { source: "worker" },
        );
      });
      finalPath = undefined;
    } catch (error) {
      await runner.query("ROLLBACK").catch(() => {});
      const code = error instanceof AuthFault ? error.code : "storage";
      await transaction(this.db, async (r) => {
        const retry =
          !(error instanceof AuthFault) &&
          job.attempts < AUDIT_REPORT_LIMITS.attempts;
        const result = await r.query(
          "UPDATE AuditReport SET status=?,errorCode=?,availableAt=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)),leaseToken=NULL,leaseUntil=NULL WHERE id=? AND status='running' AND leaseToken=?",
          [
            retry ? "queued" : "failed",
            code,
            30 * job.attempts,
            job.id,
            job.leaseToken,
          ],
        );
        if (result.affectedRows && !retry)
          await audit(
            r,
            "audit.report_failed",
            null,
            { reportId: job.id },
            "audit_report",
            job.id,
            undefined,
            { source: "worker", outcome: "failure", reasonCode: code },
          );
      }).catch(() => {});
    } finally {
      await file?.close().catch(() => {});
      await runner.release();
      for (const path of [
        staging,
        finalPath,
        finalPath ? finalPath + ".manifest.json" : undefined,
      ])
        if (path) await unlink(path).catch(() => {});
    }
    return true;
  }
  private printEvent(e: AuditEventV1, locale: "ar" | "en", timezone: string) {
    const ar = locale === "ar",
      value = (v: AuditValue) => escape(auditDisplayValue(v, locale));
    return `<article><h2>${escape(auditLabel(e.action, locale))}</h2><p>${escape(e.actor.name ?? (ar ? "هوية غير مسجلة" : "Identity not recorded"))} · ${escape(e.resource.reference ?? e.resource.id)} · ${escape(new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: "full", timeStyle: "long" }).format(new Date(e.occurredAt)))}</p><p><code>${escape(e.id)}</code> · ${escape(auditTerm(e.outcome, locale))}</p><table><thead><tr><th>${ar ? "الحقل" : "Field"}</th><th>${ar ? "قبل" : "Before"}</th><th>${ar ? "بعد" : "After"}</th></tr></thead><tbody>${e.changes.map((c) => `<tr><td>${escape(auditTerm(c.path, locale))}</td><td>${value(c.before)}</td><td>${value(c.after)}</td></tr>`).join("")}</tbody></table></article>`;
  }
  async cleanup() {
    await this.cleanupAbandoned();
    const rows = await this.db.query(
      "SELECT id,fileName FROM AuditReport WHERE status IN ('completed','expired') AND fileName IS NOT NULL AND expiresAt<=UTC_TIMESTAMP(3) LIMIT 50",
    );
    for (const row of rows) {
      await this.db.query(
        "UPDATE AuditReport SET status='expired' WHERE id=? AND expiresAt<=UTC_TIMESTAMP(3)",
        [row.id],
      );
      if (row.fileName && basename(row.fileName) === row.fileName) {
        for (const suffix of ["", ".manifest.json"])
          await unlink(join(await this.root(), row.fileName + suffix)).catch(
            (error) => {
              if (error.code !== "ENOENT") throw error;
            },
          );
        await this.db.query(
          "UPDATE AuditReport SET fileName=NULL WHERE id=? AND status='expired'",
          [row.id],
        );
      }
    }
  }
  private async cleanupAbandoned() {
    const root = await this.root(),
      directory = await opendir(root);
    let processed = 0;
    for await (const entry of directory) {
      if (++processed > 500) break;
      if (!entry.isFile()) continue;
      const match =
        /^(c[a-f0-9]{30})-(\d+)\.(csv|json|html)(\.partial|\.manifest\.json)?$/.exec(
          entry.name,
        );
      if (!match) continue;
      const path = join(root, entry.name),
        stat = await lstat(path);
      if (Date.now() - stat.mtimeMs < 24 * 3600000) continue;
      const [job] = await this.db.query(
        "SELECT status,fileName FROM AuditReport WHERE id=?",
        [match[1]],
      );
      if (job && ["queued", "running"].includes(job.status)) continue;
      if (
        job?.status === "completed" &&
        (entry.name === job.fileName ||
          entry.name === job.fileName + ".manifest.json")
      )
        continue;
      await unlink(path).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
  async verify(actor: AuthUser, id: string) {
    const job = await this.authorized(actor, id);
    const manifest = JSON.parse(
      await readFile(
        join(await this.root(), job.fileName + ".manifest.json"),
        "utf8",
      ),
    );
    return { ok: true, manifest };
  }
}
