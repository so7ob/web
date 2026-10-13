import type { DataSource, QueryRunner } from "typeorm";
import { z } from "zod";
import {
  workflowDefinitionSchema,
  calendarSchema,
  validateWorkflow,
  matchesConditions,
  legacyWorkflow,
  type AuthUser,
  type WorkflowScope,
  type WorkflowDefinition,
} from "@so7ob/contracts";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { requirePermission } from "../admin/operations.js";
import { responsePolicy } from "../admin/response-policy.js";
import { WorkflowEngine } from "./engine.js";
import { names, assertWorkflowAccess, workflowAccessSql } from "./access.js";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const revision = z.number().int().nonnegative();
const teamInput = z
  .object({
    id: id.optional(),
    nameAr: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    members: z.array(z.string().min(1).max(255)).max(500),
    active: z.boolean(),
    revision: revision.optional(),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AuthFault(400, "workflow_invalid");
  return result.data;
}
export class WorkflowAdministration {
  readonly engine: WorkflowEngine;
  constructor(readonly db: DataSource) {
    this.engine = new WorkflowEngine(db);
  }
  async overview(actor: AuthUser) {
    requirePermission(actor, "workflows.view");
    const [flows, versions, teams, members, calendars, staff] =
      await Promise.all([
        this.db.query(
          "SELECT id,scope,draft,revision FROM Workflow ORDER BY createdAt,id",
        ),
        this.db.query(
          "SELECT id,workflowId,definition,legacy,createdAt FROM WorkflowVersion ORDER BY createdAt DESC",
        ),
        this.db.query(
          "SELECT id,nameAr,nameEn,active,revision FROM WorkTeam ORDER BY nameAr",
        ),
        this.db.query("SELECT teamId,userId FROM WorkTeamMember"),
        this.db.query(
          "SELECT id,definition,createdAt FROM WorkCalendar ORDER BY createdAt DESC",
        ),
        this.db.query(
          "SELECT u.id,u.name FROM User u JOIN Role r ON r.`key`=u.roleKey WHERE u.status='active' AND r.status='active' AND u.roleKey<>'client' ORDER BY u.name",
        ),
      ]);
    return {
      ok: true,
      workflows: flows.map((f: { draft: string }) => ({
        ...f,
        draft: JSON.parse(f.draft),
      })),
      versions: versions.map((v: { definition: string }) => ({
        ...v,
        definition: JSON.parse(v.definition),
      })),
      teams: teams.map((t: { id: string }) => ({
        ...t,
        members: members
          .filter((m: { teamId: string }) => m.teamId === t.id)
          .map((m: { userId: string }) => m.userId),
      })),
      calendars: calendars.map((c: { definition: string }) => ({
        ...c,
        definition: JSON.parse(c.definition),
      })),
      staff,
      bindings: await this.db.query(
        "SELECT scope,selector,versionId FROM WorkflowBinding",
      ),
    };
  }
  async team(actor: AuthUser, input: unknown) {
    requirePermission(actor, "teams.manage");
    const data = parse(teamInput, input);
    return transaction(this.db, async (r) => {
      const key = data.id ?? newId();
      if (data.id) {
        const [old] = await r.query(
          "SELECT revision FROM WorkTeam WHERE id=? FOR UPDATE",
          [key],
        );
        if (!old) throw new AuthFault(404, "not_found");
        if (old.revision !== data.revision)
          throw new AuthFault(409, "workflow_conflict");
        if (!data.active) {
          const [used] = await r.query(
            "SELECT COUNT(*) n FROM ConversationWorkflow WHERE teamId=?",
            [key],
          );
          const versions = await r.query(
            "SELECT definition FROM WorkflowVersion",
          );
          if (
            Number(used.n) ||
            versions.some((v: { definition: string }) =>
              (JSON.parse(v.definition) as WorkflowDefinition).stages.some(
                (s) => s.routing.teamId === key,
              ),
            )
          )
            throw new AuthFault(409, "workflow_team_in_use");
        }
        await r.query(
          "UPDATE WorkTeam SET nameAr=?,nameEn=?,active=?,revision=revision+1 WHERE id=?",
          [data.nameAr, data.nameEn, data.active, key],
        );
      } else
        await r.query(
          "INSERT INTO WorkTeam(id,nameAr,nameEn,active) VALUES(?,?,?,?)",
          [key, data.nameAr, data.nameEn, data.active],
        );
      for (const userId of new Set(data.members)) {
        const [user] = await r.query(
          "SELECT u.id FROM User u JOIN Role ro ON ro.`key`=u.roleKey WHERE u.id=? AND u.status='active' AND ro.status='active' AND u.roleKey<>'client'",
          [userId],
        );
        if (!user) throw new AuthFault(400, "invalid_assignee");
      }
      await r.query("DELETE FROM WorkTeamMember WHERE teamId=?", [key]);
      for (const userId of new Set(data.members))
        await r.query("INSERT INTO WorkTeamMember(teamId,userId) VALUES(?,?)", [
          key,
          userId,
        ]);
      await audit(
        r,
        "workflow.team_updated",
        actor,
        { teamId: key, members: data.members },
        "workflow",
        key,
      );
      return { ok: true, id: key };
    });
  }
  async calendar(actor: AuthUser, input: unknown) {
    requirePermission(actor, "workflows.manage");
    const definition = parse(calendarSchema, input),
      key = newId();
    return transaction(this.db, async (r) => {
      await r.query("INSERT INTO WorkCalendar(id,definition) VALUES(?,?)", [
        key,
        JSON.stringify(definition),
      ]);
      await audit(
        r,
        "workflow.calendar_created",
        actor,
        { calendarId: key },
        "workflow",
        key,
      );
      return { ok: true, id: key };
    });
  }
  async save(actor: AuthUser, input: unknown) {
    requirePermission(actor, "workflows.manage");
    const data = parse(
      z
        .object({
          id: id.optional(),
          revision: revision.optional(),
          definition: workflowDefinitionSchema,
        })
        .strict(),
      input,
    );
    return transaction(this.db, async (r) => {
      const key = data.id ?? newId();
      if (data.id) {
        const [old] = await r.query(
          "SELECT revision,scope FROM Workflow WHERE id=? FOR UPDATE",
          [key],
        );
        if (!old) throw new AuthFault(404, "not_found");
        if (
          old.revision !== data.revision ||
          old.scope !== data.definition.scope
        )
          throw new AuthFault(409, "workflow_conflict");
        await r.query(
          "UPDATE Workflow SET draft=?,revision=revision+1 WHERE id=?",
          [JSON.stringify(data.definition), key],
        );
      } else
        await r.query("INSERT INTO Workflow(id,scope,draft) VALUES(?,?,?)", [
          key,
          data.definition.scope,
          JSON.stringify(data.definition),
        ]);
      await audit(
        r,
        "workflow.draft_saved",
        actor,
        { workflowId: key },
        "workflow",
        key,
      );
      return { ok: true, id: key };
    });
  }
  async validate(actor: AuthUser, input: unknown) {
    requirePermission(actor, "workflows.view");
    const def = parse(workflowDefinitionSchema, input);
    return { ok: true, errors: validateWorkflow(def) };
  }
  async simulate(actor: AuthUser, input: unknown) {
    requirePermission(actor, "workflows.view");
    const data = parse(
      z
        .object({
          definition: workflowDefinitionSchema,
          stageId: id,
          trigger: z.enum([
            "manual",
            "client_reply",
            "staff_reply",
            "response_due",
            "stage_due",
          ]),
          fields: z.record(z.string(), z.union([z.string(), z.null()])),
        })
        .strict(),
      input,
    );
    const matches = data.definition.transitions.filter(
      (t) =>
        t.from === data.stageId &&
        t.trigger === data.trigger &&
        matchesConditions(t, data.fields),
    );
    return {
      ok: true,
      errors: validateWorkflow(data.definition),
      transitions: data.trigger === "manual" ? matches : matches.slice(0, 1),
    };
  }
  async publish(actor: AuthUser, input: unknown) {
    requirePermission(actor, "workflows.publish");
    const data = parse(
      z.object({ id, revision, selector: z.string().min(1).max(255) }).strict(),
      input,
    );
    return transaction(this.db, async (r) => {
      const [flow] = await r.query(
        "SELECT * FROM Workflow WHERE id=? FOR UPDATE",
        [data.id],
      );
      if (!flow) throw new AuthFault(404, "not_found");
      if (flow.revision !== data.revision)
        throw new AuthFault(409, "workflow_conflict");
      const def = parse(workflowDefinitionSchema, JSON.parse(flow.draft));
      if (validateWorkflow(def).length)
        throw new AuthFault(400, "workflow_invalid");
      if (!def.calendarVersionId)
        throw new AuthFault(400, "workflow_calendar_required");
      const [calendar] = await r.query(
        "SELECT id FROM WorkCalendar WHERE id=?",
        [def.calendarVersionId],
      );
      if (!calendar) throw new AuthFault(400, "workflow_calendar_required");
      for (const stage of def.stages) {
        if (stage.routing.teamId) {
          const [team] = await r.query(
            "SELECT id FROM WorkTeam WHERE id=? AND active=1",
            [stage.routing.teamId],
          );
          if (!team)
            throw new AuthFault(400, "workflow_destination_unavailable");
        }
        if (stage.routing.mode !== "keep") {
          const eligible = await this.engine.eligible(
            r,
            def.scope,
            stage.routing.teamId,
          );
          if (
            !eligible.length ||
            (stage.routing.mode === "person" &&
              !eligible.some(
                (p: { id: string }) => p.id === stage.routing.userId,
              ))
          )
            throw new AuthFault(400, "workflow_destination_unavailable");
        }
      }
      const key = newId();
      await r.query(
        "INSERT INTO WorkflowVersion(id,workflowId,definition) VALUES(?,?,?)",
        [key, data.id, JSON.stringify(def)],
      );
      await r.query(
        "INSERT INTO WorkflowBinding(scope,selector,versionId) VALUES(?,?,?) ON DUPLICATE KEY UPDATE versionId=VALUES(versionId)",
        [def.scope, data.selector, key],
      );
      await audit(
        r,
        "workflow.published",
        actor,
        { versionId: key, selector: data.selector },
        "workflow",
        data.id,
      );
      return { ok: true, id: key };
    });
  }
  async options(
    actor: AuthUser,
    scope: WorkflowScope,
    teamId: string | null = null,
  ) {
    requirePermission(
      actor,
      scope === "requests" ? "requests.view.all" : "inquiries.view.all",
    );
    return {
      ok: true,
      staff: await this.engine.eligible(this.db, scope, teamId),
      teams: await this.db.query(
        "SELECT id,nameAr,nameEn FROM WorkTeam WHERE active=1",
      ),
      stages: (
        await this.db.query("SELECT id,definition FROM WorkflowVersion")
      ).flatMap((v: { id: string; definition: string }) => {
        const d: WorkflowDefinition = JSON.parse(v.definition);
        return d.scope === scope
          ? d.stages.map((s) => ({
              id: s.id,
              nameAr: s.nameAr,
              nameEn: s.nameEn,
              versionId: v.id,
            }))
          : [];
      }),
    };
  }
  async assign(
    actor: AuthUser,
    scope: WorkflowScope,
    recordId: string,
    input: unknown,
  ) {
    requirePermission(
      actor,
      scope === "requests" ? "requests.view.all" : "inquiries.view.all",
    );
    requirePermission(
      actor,
      scope === "requests" ? "requests.assign" : "inquiries.assign",
    );
    const data = parse(
      z
        .object({
          assigneeId: z.string().max(255).nullable(),
          expectedRevision: revision,
        })
        .strict(),
      input,
    );
    return transaction(this.db, async (r) => {
      await assertWorkflowAccess(r, actor, scope, recordId);
      const n = names(scope),
        [record] = await r.query(
          `SELECT * FROM ${n.table} WHERE id=? FOR UPDATE`,
          [recordId],
        );
      const state = await this.engine.instance(r, scope, recordId, true);
      if (!record || !state) throw new AuthFault(404, "not_found");
      if (state.revision !== data.expectedRevision)
        throw new AuthFault(409, "workflow_conflict");
      const eligible = await this.engine.eligible(r, scope, state.teamId);
      if (
        data.assigneeId &&
        !eligible.some((p: { id: string }) => p.id === data.assigneeId)
      )
        throw new AuthFault(400, "invalid_assignee");
      await r.query(
        `UPDATE ${n.table} SET assigneeId=?,lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
        [data.assigneeId, recordId],
      );
      await r.query(
        "UPDATE ConversationWorkflow SET revision=revision+1 WHERE scope=? AND recordId=?",
        [scope, recordId],
      );
      if (!state.legacy)
        await this.engine.timers(
          r,
          { ...state, revision: state.revision + 1 },
          state.definition.stages.find((s) => s.id === state.stageId)!,
          record,
        );
      await audit(
        r,
        "workflow.assigned",
        actor,
        { from: record.assigneeId, to: data.assigneeId },
        scope === "requests" ? "request" : "inquiry",
        recordId,
      );
      return { ok: true };
    });
  }
  private async responseAnchor(
    r: QueryRunner,
    scope: WorkflowScope,
    record: Record<string, unknown>,
    state: import("./engine.js").Instance,
  ) {
    if (!state.legacy) return state.responseAnchor;
    if (scope === "requests")
      return record.lastClientReplyAt &&
        (!record.lastStaffReplyAt ||
          record.lastClientReplyAt > record.lastStaffReplyAt)
        ? (record.lastClientReplyAt as Date)
        : !record.lastClientReplyAt && !record.lastStaffReplyAt
          ? (record.createdAt as Date)
          : null;
    const [message] = await r.query(
      "SELECT authorType,createdAt FROM InquiryMessage WHERE inquiryId=? AND kind='message' ORDER BY createdAt DESC,id DESC LIMIT 1",
      [record.id],
    );
    return message
      ? message.authorType === "client"
        ? message.createdAt
        : null
      : (record.createdAt as Date);
  }
  async previewTransfer(actor: AuthUser, input: unknown) {
    requirePermission(actor, "workflows.transfer");
    const data = parse(
      z
        .object({
          scope: z.enum(["requests", "inquiries"]),
          ids: z.array(z.string().min(1).max(255)).min(1).max(50),
          versionId: id,
          mapping: z.record(z.string(), id),
        })
        .strict(),
      input,
    );
    requirePermission(
      actor,
      data.scope === "requests" ? "requests.view.all" : "inquiries.view.all",
    );
    return transaction(this.db, async (r) => {
      const [version] = await r.query(
        "SELECT * FROM WorkflowVersion WHERE id=?",
        [data.versionId],
      );
      if (!version || version.legacy)
        throw new AuthFault(400, "workflow_invalid");
      const def: WorkflowDefinition = JSON.parse(version.definition);
      if (def.scope !== data.scope)
        throw new AuthFault(400, "workflow_invalid");
      const rows = [];
      await r.query("SAVEPOINT preview_routes");
      for (const recordId of new Set(data.ids)) {
        await assertWorkflowAccess(r, actor, data.scope, recordId);
        const state = await this.engine.instance(r, data.scope, recordId, true);
        const [record] = await r.query(
          `SELECT * FROM ${names(data.scope).table} WHERE id=? FOR UPDATE`,
          [recordId],
        );
        if (!state || !record || record.archivedAt)
          throw new AuthFault(409, "workflow_conflict");
        const oldStage = state.legacy ? record.status : state.stageId,
          stage = def.stages.find((s) => s.id === data.mapping[oldStage]);
        if (!stage) throw new AuthFault(400, "workflow_mapping_required");
        const route = await this.engine.destination(
          r,
          { ...state, definition: def },
          stage,
          record,
        );
        const anchor = await this.responseAnchor(r, data.scope, record, state),
          closed = ["closed", "cancelled"].includes(stage.status),
          next = { ...state, definition: def };
        const responseDueAt = closed
          ? null
          : await this.engine.deadline(
              r,
              next,
              anchor,
              stage.responseHours ?? (await responsePolicy(r)).hours,
            );
        const stageDueAt = closed
          ? null
          : await this.engine.deadline(r, next, new Date(), stage.stageHours);
        rows.push({
          responseAnchor: anchor?.toISOString() ?? null,
          targetStatus: stage.status,
          responseDueAt: responseDueAt?.toISOString() ?? null,
          stageDueAt: stageDueAt?.toISOString() ?? null,
          recordId,
          revision: state.revision,
          versionId: state.versionId,
          from: oldStage,
          to: stage.id,
          status: record.status,
          assigneeId: record.assigneeId,
          lastActivityAt: record.lastActivityAt.toISOString(),
          route,
          visibility: stage.visibility,
        });
      }
      await r.query("ROLLBACK TO SAVEPOINT preview_routes");
      const previewId = newId();
      await r.query(
        "INSERT INTO WorkflowTransfer(id,actorId,payload,expiresAt) VALUES(?,?,?,TIMESTAMPADD(MINUTE,15,UTC_TIMESTAMP(3)))",
        [previewId, actor.id, JSON.stringify({ ...data, rows })],
      );
      return { ok: true, previewId, rows };
    });
  }
  async transfer(actor: AuthUser, input: unknown) {
    requirePermission(actor, "workflows.transfer");
    const data = parse(z.object({ previewId: id }).strict(), input);
    return transaction(this.db, async (r) => {
      const [preview] = await r.query(
        "SELECT * FROM WorkflowTransfer WHERE id=? AND actorId=? FOR UPDATE",
        [data.previewId, actor.id],
      );
      if (!preview) throw new AuthFault(409, "workflow_preview_expired");
      const payload = JSON.parse(preview.payload);
      requirePermission(
        actor,
        payload.scope === "requests"
          ? "requests.view.all"
          : "inquiries.view.all",
      );
      if (preview.usedAt) return { ok: true };
      if (preview.expiresAt < new Date())
        throw new AuthFault(409, "workflow_preview_expired");
      const [version] = await r.query(
        "SELECT * FROM WorkflowVersion WHERE id=?",
        [payload.versionId],
      );
      const def: WorkflowDefinition = JSON.parse(version.definition);
      for (const row of payload.rows) {
        await assertWorkflowAccess(r, actor, payload.scope, row.recordId);
        const state = await this.engine.instance(
          r,
          payload.scope,
          row.recordId,
          true,
        );
        const [record] = await r.query(
          `SELECT * FROM ${names(payload.scope).table} WHERE id=? FOR UPDATE`,
          [row.recordId],
        );
        if (
          !state ||
          state.revision !== row.revision ||
          state.versionId !== row.versionId ||
          record.status !== row.status ||
          record.assigneeId !== row.assigneeId ||
          record.lastActivityAt.toISOString() !== row.lastActivityAt
        )
          throw new AuthFault(409, "workflow_conflict");
        const stage = def.stages.find((s) => s.id === row.to)!;
        await r.query("SAVEPOINT validate_route");
        const route = await this.engine.destination(
          r,
          { ...state, definition: def },
          stage,
          record,
        );
        await r.query("ROLLBACK TO SAVEPOINT validate_route");
        if (JSON.stringify(route) !== JSON.stringify(row.route))
          throw new AuthFault(409, "workflow_conflict");
        await r.query(
          "UPDATE ConversationWorkflow SET versionId=? WHERE scope=? AND recordId=?",
          [version.id, payload.scope, row.recordId],
        );
        const next = {
          ...state,
          versionId: version.id,
          definition: def,
          legacy: false,
          responseAnchor: row.responseAnchor
            ? new Date(row.responseAnchor)
            : null,
        };
        await r.query(
          "UPDATE ConversationWorkflow SET responseAnchor=? WHERE scope=? AND recordId=?",
          [next.responseAnchor, payload.scope, row.recordId],
        );
        await this.engine.enter(
          r,
          next,
          stage,
          record,
          actor,
          "transfer-" + data.previewId,
          null,
        );
      }
      await r.query(
        "UPDATE WorkflowTransfer SET usedAt=UTC_TIMESTAMP(3) WHERE id=?",
        [data.previewId],
      );
      return { ok: true };
    });
  }
  async queue(actor: AuthUser, scope: WorkflowScope, q = "", page = 1) {
    requirePermission(
      actor,
      scope === "requests" ? "requests.view.all" : "inquiries.view.all",
    );
    if (!Number.isSafeInteger(page) || page < 1)
      throw new AuthFault(400, "invalid");
    const search =
      "%" +
      q
        .trim()
        .slice(0, 100)
        .replaceAll("=", "==")
        .replaceAll("%", "=%")
        .replaceAll("_", "=_") +
      "%";
    const where = `p.archivedAt IS NULL AND (${workflowAccessSql(actor, scope, "p")}) AND (p.refCode LIKE ? ESCAPE '=' OR p.name LIKE ? ESCAPE '=' OR p.email LIKE ? ESCAPE '=')`;
    const [[count], records] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*) n FROM ${names(scope).table} p WHERE ${where}`,
        [search, search, search],
      ),
      this.db.query(
        `SELECT p.id,p.refCode,p.assigneeId,COALESCE(w.stageId,p.status) stageId,p.status FROM ${names(scope).table} p LEFT JOIN ConversationWorkflow w ON w.scope='${scope}' AND w.recordId=p.id WHERE ${where} ORDER BY p.lastActivityAt DESC,p.id LIMIT 50 OFFSET ?`,
        [search, search, search, (page - 1) * 50],
      ),
    ]);
    return { ok: true, records, total: Number(count.n), page };
  }
  template(scope: WorkflowScope) {
    return legacyWorkflow(scope);
  }
}
