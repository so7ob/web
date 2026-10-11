import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { DataSource, QueryRunner } from "typeorm";
import { AUDIT_SENSITIVE_PERMISSIONS } from "@so7ob/contracts";
import type { AuthUser } from "@so7ob/contracts";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { lockOperation } from "../business/persistence.js";
import { permit } from "./reader.js";
import { validated } from "./reviews.js";
import { auditWriterHealth } from "./context.js";
interface Rule {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  thresholdValue: number;
  windowSeconds: number;
  cooldownSeconds: number;
  severity: string;
  rationale: string;
  scope: string;
  revision: number;
  activatedAt: Date | null;
}
// Evidence IDs use exact, case-sensitive, no-padding comparisons. Existing
// auxiliary tables may still use utf8mb4_bin; collate their side of each join
// explicitly while preserving the canonical AuditLog primary-key lookup.
export class AuditOperations {
  private lastFailureCount = 0;
  constructor(readonly db: DataSource) {}
  async rules(actor: AuthUser) {
    permit(actor, "audit.rules.manage");
    return {
      ok: true,
      rules: await this.db.query("SELECT * FROM AuditRule ORDER BY id"),
    };
  }
  async updateRule(actor: AuthUser, id: string, raw: unknown) {
    permit(actor, "audit.rules.manage");
    const data = validated(
      z
        .object({
          revision: z.number().int().positive(),
          enabled: z.boolean(),
          thresholdValue: z.number().int().min(1).max(100000),
          windowSeconds: z.number().int().min(60).max(86400),
          cooldownSeconds: z.number().int().min(0).max(86400),
          severity: z.enum(["low", "medium", "high"]),
          rationale: z.string().trim().min(1).max(500),
          scope: z.enum([
            "all",
            "security",
            "identity",
            "requests",
            "inquiries",
            "content",
            "audit",
          ]),
        })
        .strict(),
      raw,
    );
    return transaction(this.db, async (r) => {
      const [old] = await r.query(
        "SELECT * FROM AuditRule WHERE id=? FOR UPDATE",
        [id],
      );
      if (!old) throw new AuthFault(404, "not_found");
      if (old.revision !== data.revision) throw new AuthFault(409, "conflict");
      await r.query(
        "UPDATE AuditRule SET enabled=?,thresholdValue=?,windowSeconds=?,cooldownSeconds=?,severity=?,rationale=?,scope=?,revision=revision+1,activatedAt=IF(?,UTC_TIMESTAMP(3),NULL),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
        [
          data.enabled,
          data.thresholdValue,
          data.windowSeconds,
          data.cooldownSeconds,
          data.severity,
          data.rationale,
          data.scope,
          data.enabled,
          id,
        ],
      );
      await audit(
        r,
        "audit.rule_changed",
        actor,
        { ruleId: id, policyVersion: data.revision + 1 },
        "audit_rule",
        id,
        undefined,
        {
          before: old,
          after: { ...old, ...data, revision: data.revision + 1 },
        },
      );
      return { ok: true };
    });
  }
  async alerts(actor: AuthUser) {
    permit(actor);
    return {
      ok: true,
      alerts: await this.db.query(
        "SELECT a.*,r.name FROM AuditAlert a JOIN AuditRule r ON r.id=a.ruleId ORDER BY a.createdAt DESC,a.id DESC LIMIT 100",
      ),
    };
  }
  async alertEvents(actor: AuthUser, id: string) {
    permit(actor);
    return {
      ok: true,
      events: await this.db.query(
        "SELECT eventId FROM AuditAlertEvent WHERE alertId=? ORDER BY eventId LIMIT 1000",
        [id],
      ),
    };
  }
  private async match(
    r: DataSource | QueryRunner,
    rule: Rule,
    event: Record<string, unknown>,
  ) {
    if (rule.scope !== "all" && rule.scope !== event.category) return null;
    const at =
        event.createdAt instanceof Date
          ? event.createdAt
          : new Date(String(event.createdAt)),
      seconds = Math.floor(at.getTime() / 1000),
      bucket = Math.floor(seconds / rule.windowSeconds) * rule.windowSeconds;
    let ids = [String(event.id)],
      scope = String(event.actorId ?? event.ipHash ?? "unattributed"),
      matched = false;
    if (rule.kind === "privilege") {
      let details: Record<string, unknown> = {};
      try {
        details = JSON.parse(String(event.details));
      } catch {
        /* redacted historical data */
      }
      matched =
        event.outcome === "success" &&
        String(event.action).startsWith("user.") &&
        ((["user.role_changed", "user.invite_accepted"].includes(
          String(event.action),
        ) &&
          ["super_admin", "ops_manager"].includes(
            String(details.toRole ?? details.roleKey),
          )) ||
          (Array.isArray(details.grantedPermissions) &&
            details.grantedPermissions.some((permission) =>
              AUDIT_SENSITIVE_PERMISSIONS.some(
                (allowed) => allowed === permission,
              ),
            )));
    }
    if (rule.kind === "export") {
      let details: Record<string, unknown> = {};
      try {
        details = JSON.parse(String(event.details));
      } catch {
        /* invalid historical details */
      }
      matched =
        [
          "requests.exported",
          "inquiries.exported",
          "audit.report_completed",
        ].includes(String(event.action)) &&
        Number(details.resourceCount ?? details.count) >= rule.thresholdValue;
    }
    if (
      rule.kind === "security" &&
      (event.category === "security" || event.action === "user.login_failed") &&
      ["denied", "failure"].includes(String(event.outcome))
    ) {
      const where =
        "schemaVersion=1 AND (category='security' OR action='user.login_failed') AND outcome IN ('denied','failure') AND COALESCE(actorId,ipHash,'unattributed')=? AND createdAt>=? AND createdAt<? AND (?='all' OR category=?) AND (createdAt<? OR (createdAt=? AND id<=?))";
      const args = [
        scope,
        new Date(bucket * 1000),
        new Date((bucket + rule.windowSeconds) * 1000),
        rule.scope,
        rule.scope,
        at,
        at,
        event.id,
      ];
      const [count] = await r.query(
        `SELECT COUNT(DISTINCT COALESCE(correlationId,id)) n FROM AuditLog WHERE ${where}`,
        args,
      );
      matched = Number(count.n) >= rule.thresholdValue;
      if (matched) {
        const rows = await r.query(
          `SELECT id FROM AuditLog WHERE ${where} ORDER BY createdAt,id LIMIT 1000`,
          args,
        );
        ids = rows.map((row: { id: string }) => row.id);
      }
    }
    if (!matched) return null;
    if (rule.kind !== "security") scope = String(event.id);
    return {
      ids,
      scope,
      bucket: rule.kind === "security" ? String(bucket) : String(event.id),
    };
  }
  async simulate(actor: AuthUser, id: string, raw: unknown) {
    permit(actor, "audit.rules.manage");
    const data = validated(
      z
        .object({ from: z.string().datetime(), to: z.string().datetime() })
        .strict(),
      raw,
    );
    if (
      data.from >= data.to ||
      Date.parse(data.to) - Date.parse(data.from) > 7 * 86400000
    )
      throw new AuthFault(400, "invalid");
    const [rule]: Rule[] = await this.db.query(
      "SELECT * FROM AuditRule WHERE id=?",
      [id],
    );
    if (!rule) throw new AuthFault(404, "not_found");
    if (rule.kind === "health")
      return {
        ok: true,
        matches: [],
        health: await this.health(actor),
        scope: "current_health_only",
      };
    const events = await this.db.query(
      "SELECT * FROM AuditLog WHERE schemaVersion=1 AND createdAt>=? AND createdAt<? ORDER BY createdAt,id LIMIT 1001",
      [new Date(data.from), new Date(data.to)],
    );
    if (events.length > 1000) throw new AuthFault(413, "export_limit");
    const matches: unknown[] = [],
      seen = new Set<string>(),
      lastByScope = new Map<string, number>();
    for (const event of events) {
      const match = await this.match(this.db, rule, event);
      if (
        match &&
        !seen.has(match.scope + match.bucket) &&
        new Date(event.createdAt).getTime() -
          (lastByScope.get(match.scope) ?? -Infinity) >=
          rule.cooldownSeconds * 1000
      ) {
        lastByScope.set(match.scope, new Date(event.createdAt).getTime());
        seen.add(match.scope + match.bucket);
        matches.push(match);
      }
    }
    return { ok: true, matches, evaluated: events.length };
  }
  async processOne() {
    const token = randomBytes(32).toString("hex");
    const job = await transaction(this.db, async (r) => {
      await r.query(
        "UPDATE AuditWork SET status=IF(attempts>=3,'failed','queued'),leaseToken=NULL,leaseUntil=NULL,lastError='worker_lost' WHERE status='running' AND leaseUntil<UTC_TIMESTAMP(3)",
      );
      const [row] = await r.query(
        "SELECT w.eventId FROM AuditWork w JOIN AuditLog a ON a.id=w.eventId COLLATE utf8mb4_nopad_bin WHERE w.status='queued' AND w.availableAt<=UTC_TIMESTAMP(3) ORDER BY w.availableAt,w.eventId LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      if (!row) return null;
      await r.query(
        "UPDATE AuditWork SET status='running',attempts=attempts+1,leaseToken=?,leaseUntil=TIMESTAMPADD(SECOND,60,UTC_TIMESTAMP(3)) WHERE eventId=?",
        [token, row.eventId],
      );
      return row;
    });
    if (!job) return false;
    try {
      await transaction(this.db, async (r) => {
        const [owned] = await r.query(
          "SELECT eventId FROM AuditWork WHERE eventId=? AND leaseToken=? AND status='running' AND leaseUntil>UTC_TIMESTAMP(3) FOR UPDATE",
          [job.eventId, token],
        );
        if (!owned) return;
        const [event] = await r.query("SELECT * FROM AuditLog WHERE id=?", [
          job.eventId,
        ]);
        if (event) {
          const rules: Rule[] = await r.query(
            "SELECT * FROM AuditRule WHERE enabled=1 AND kind<>'health' AND activatedAt<=? FOR UPDATE",
            [event.createdAt],
          );
          for (const rule of rules) {
            await lockOperation(r, "audit-rule:" + rule.id);
            const match = await this.match(r, rule, event);
            if (!match) continue;
            const [recent] = await r.query(
              "SELECT id FROM AuditAlert WHERE ruleId=? AND ruleRevision=? AND scopeKey=? AND createdAt>TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3)) LIMIT 1",
              [rule.id, rule.revision, match.scope, -rule.cooldownSeconds],
            );
            if (recent) continue;
            const id = newId();
            const inserted = await r.query(
              "INSERT IGNORE INTO AuditAlert(id,ruleId,ruleRevision,scopeKey,windowKey,severity,reason) VALUES(?,?,?,?,?,?,?)",
              [
                id,
                rule.id,
                rule.revision,
                match.scope,
                match.bucket,
                rule.severity,
                rule.rationale,
              ],
            );
            if (inserted.affectedRows)
              for (const eventId of match.ids)
                await r.query(
                  "INSERT IGNORE INTO AuditAlertEvent(alertId,eventId) VALUES(?,?)",
                  [id, eventId],
                );
          }
        }
        await r.query(
          "UPDATE AuditWork SET status='completed',leaseToken=NULL,leaseUntil=NULL WHERE eventId=? AND leaseToken=?",
          [job.eventId, token],
        );
      });
    } catch {
      await this.db.query(
        "UPDATE AuditWork SET status=IF(attempts>=3,'failed','queued'),availableAt=TIMESTAMPADD(SECOND,30,UTC_TIMESTAMP(3)),lastError='processing_failed',leaseToken=NULL,leaseUntil=NULL WHERE eventId=? AND leaseToken=?",
        [job.eventId, token],
      );
    }
    return true;
  }
  async probe(component = "worker") {
    let status = "healthy";
    const newFailures = auditWriterHealth.failures > this.lastFailureCount;
    const r = this.db.createQueryRunner();
    try {
      await r.connect();
      await r.startTransaction();
      await audit(
        r,
        "audit.health_probe",
        null,
        null,
        "audit",
        null,
        undefined,
        { source: component === "api" ? "api" : "worker" },
      );
      await r.rollbackTransaction();
    } catch {
      status = "degraded";
      if (r.isTransactionActive) await r.rollbackTransaction().catch(() => {});
    } finally {
      await r.release();
    }
    await this.db.query(
      "INSERT INTO AuditHealth(component,checkedAt,status,failures,lastFailureAt) VALUES(?,UTC_TIMESTAMP(3),?,?,?) ON DUPLICATE KEY UPDATE checkedAt=VALUES(checkedAt),status=VALUES(status),failures=VALUES(failures),lastFailureAt=COALESCE(VALUES(lastFailureAt),lastFailureAt)",
      [
        component,
        status,
        auditWriterHealth.failures,
        auditWriterHealth.lastFailureAt
          ? new Date(auditWriterHealth.lastFailureAt)
          : null,
      ],
    );
    this.lastFailureCount = auditWriterHealth.failures;
    const rules: Rule[] = await this.db.query(
      "SELECT * FROM AuditRule WHERE enabled=1 AND kind='health'",
    );
    const [pending] = await this.db.query(
      "SELECT MAX(TIMESTAMPDIFF(SECOND,w.availableAt,UTC_TIMESTAMP(3))) age FROM AuditWork w JOIN AuditLog a ON a.id=w.eventId COLLATE utf8mb4_nopad_bin WHERE w.status IN ('queued','running','failed')",
    );
    for (const rule of rules)
      if (
        newFailures ||
        status !== "healthy" ||
        Number(pending.age) > rule.thresholdValue
      )
        await transaction(this.db, async (runner) => {
          await lockOperation(runner, "audit-rule:" + rule.id);
          const [recent] = await runner.query(
            "SELECT id FROM AuditAlert WHERE ruleId=? AND createdAt>TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(3))",
            [rule.id, -rule.cooldownSeconds],
          );
          if (!recent)
            await runner.query(
              "INSERT IGNORE INTO AuditAlert(id,ruleId,ruleRevision,scopeKey,windowKey,severity,reason) VALUES(?,?,?,?,?,?,?)",
              [
                newId(),
                rule.id,
                rule.revision,
                component,
                String(Math.floor(Date.now() / 1000 / rule.windowSeconds)),
                rule.severity,
                rule.rationale,
              ],
            );
        });
  }
  async health(actor: AuthUser) {
    permit(actor, "audit.health.view");
    const probes = await this.db.query(
      "SELECT * FROM AuditHealth ORDER BY component",
    );
    const [last] = await this.db.query(
      "SELECT MAX(createdAt) lastBusinessEventAt FROM AuditLog WHERE category NOT IN ('audit','diagnostics')",
    );
    const queues = await this.db.query(
      "SELECT w.status,COUNT(*) count,MAX(TIMESTAMPDIFF(SECOND,w.availableAt,UTC_TIMESTAMP(3))) oldestSeconds FROM AuditWork w JOIN AuditLog a ON a.id=w.eventId COLLATE utf8mb4_nopad_bin GROUP BY w.status",
    );
    const reports = await this.db.query(
      "SELECT status,COUNT(*) count FROM AuditReport GROUP BY status",
    );
    return {
      ok: true,
      probes,
      queues,
      reports,
      ...last,
      currentProcess: auditWriterHealth,
      probeMethod: "insert_then_rollback",
      status: !probes.length
        ? "unknown"
        : probes.every(
              (p: { checkedAt: Date; status: string }) =>
                p.status === "healthy" &&
                Date.now() - p.checkedAt.getTime() < 120000,
            )
          ? "healthy"
          : "degraded",
    };
  }
  async policy(actor: AuthUser) {
    permit(actor, "audit.policy.manage");
    const [policy] = await this.db.query(
      "SELECT * FROM AuditPolicy WHERE id=1",
    );
    return { ok: true, policy };
  }
  async updatePolicy(actor: AuthUser, raw: unknown) {
    permit(actor, "audit.policy.manage");
    const input = validated(
      z
        .object({
          revision: z.number().int().nonnegative(),
          retentionDays: z.number().int().min(1).max(36500).nullable(),
        })
        .strict(),
      raw,
    );
    return transaction(this.db, async (r) => {
      await lockOperation(r, "audit-retention");
      const [before] = await r.query(
        "SELECT * FROM AuditPolicy WHERE id=1 FOR UPDATE",
      );
      const changed = await r.query(
        "UPDATE AuditPolicy SET retentionDays=?,revision=revision+1,updatedAt=UTC_TIMESTAMP(3) WHERE id=1 AND revision=?",
        [input.retentionDays, input.revision],
      );
      if (!changed.affectedRows) throw new AuthFault(409, "conflict");
      await audit(
        r,
        "audit.policy_changed",
        actor,
        { policyVersion: input.revision + 1 },
        "audit_policy",
        "1",
        undefined,
        {
          before,
          after: {
            retentionDays: input.retentionDays,
            revision: input.revision + 1,
          },
        },
      );
      return { ok: true };
    });
  }
  async retention(
    actor: AuthUser,
    apply = false,
    batch = 250,
    expectedRevision?: number,
  ) {
    permit(actor, "audit.policy.manage");
    return transaction(this.db, async (r) => {
      await lockOperation(r, "audit-retention");
      const [policy] = await r.query(
        "SELECT * FROM AuditPolicy WHERE id=1 FOR UPDATE",
      );
      if (apply && policy.revision !== expectedRevision)
        throw new AuthFault(409, "conflict");
      if (!policy.retentionDays)
        return {
          ok: true,
          configured: false,
          candidates: 0,
          held: 0,
          deleted: 0,
        };
      const cutoff = new Date(
          Date.now() - Number(policy.retentionDays) * 86400000,
        ),
        held =
          "EXISTS(SELECT 1 FROM AuditCaseEvent ce JOIN AuditCase c ON c.id=ce.caseId WHERE ce.eventId COLLATE utf8mb4_nopad_bin=a.id AND c.held=1)";
      const [count] = await r.query(
        `SELECT SUM(NOT ${held}) candidates,SUM(${held}) held FROM AuditLog a WHERE createdAt<?`,
        [cutoff],
      );
      let deleted = 0;
      if (apply) {
        const rows = await r.query(
          `SELECT a.id FROM AuditLog a WHERE createdAt<? AND NOT ${held} ORDER BY createdAt,id LIMIT ? FOR UPDATE`,
          [cutoff, Math.min(250, Math.max(1, batch))],
        );
        for (const { id } of rows) {
          await r.query("DELETE FROM AuditWork WHERE eventId=?", [id]);
          await r.query("DELETE FROM AuditLog WHERE id=?", [id]);
          deleted++;
        }
        const [principal] = await r.query(
          "SELECT SUBSTRING_INDEX(CURRENT_USER(),'@',1) name",
        );
        await audit(
          r,
          "audit.retention_completed",
          null,
          {
            count: deleted,
            policyVersion: policy.revision,
            maintenanceUser: principal.name,
          },
          "audit_policy",
          "1",
          undefined,
          { source: "system", actorType: "system" },
        );
      }
      return {
        ok: true,
        configured: true,
        cutoff: cutoff.toISOString(),
        candidates: Number(count.candidates ?? 0),
        held: Number(count.held ?? 0),
        deleted,
        policyVersion: policy.revision,
      };
    });
  }
}
