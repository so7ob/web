import type { DataSource, QueryRunner } from "typeorm";
import {
  can,
  canTransition,
  matchesConditions,
  type AuthUser,
  type WorkflowDefinition,
  type WorkflowScope,
  type WorkflowStage,
  type WorkflowState,
  type BusinessCalendar,
} from "@so7ob/contracts";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { insertRecord } from "../business/persistence.js";
import { responsePolicy } from "../admin/response-policy.js";
import { businessDeadline } from "./calendar.js";
import { conversationDueSql } from "./deadlines.js";
import { names, assertWorkflowAccess } from "./access.js";
export interface Instance {
  scope: WorkflowScope;
  recordId: string;
  versionId: string;
  workflowId: string;
  stageId: string;
  teamId: string | null;
  visibility: string;
  revision: number;
  stageEpoch: number;
  legacy: boolean;
  definition: WorkflowDefinition;
  enteredAt: Date;
  responseAnchor: Date | null;
  responseDueAt: Date | null;
  stageDueAt: Date | null;
}
export class WorkflowEngine {
  constructor(readonly db: DataSource) {}
  async instance(
    r: DataSource | QueryRunner,
    scope: WorkflowScope,
    id: string,
    lock = false,
  ): Promise<Instance | null> {
    const [row] = await r.query(
      `SELECT w.*,v.workflowId,v.definition,v.legacy FROM ConversationWorkflow w JOIN WorkflowVersion v ON v.id=w.versionId WHERE w.scope=? AND w.recordId=?${lock ? " FOR UPDATE" : ""}`,
      [scope, id],
    );
    return row
      ? { ...row, legacy: !!row.legacy, definition: JSON.parse(row.definition) }
      : null;
  }
  async initialize(r: QueryRunner, scope: WorkflowScope, id: string) {
    const n = names(scope),
      [record] = await r.query(
        `SELECT * FROM ${n.table} WHERE id=? FOR UPDATE`,
        [id],
      );
    const [version] = await r.query(
      "SELECT v.* FROM WorkflowBinding b JOIN WorkflowVersion v ON v.id=b.versionId WHERE b.scope=? AND b.selector IN (?, '*') ORDER BY (b.selector='*') ASC LIMIT 1",
      [scope, scope === "requests" ? record.serviceType : record.category],
    );
    if (!version) throw new AuthFault(409, "workflow_unavailable");
    const def: WorkflowDefinition = JSON.parse(version.definition);
    const stage = def.stages.find(
      (s) => s.id === (version.legacy ? record.status : def.initialStage),
    )!;
    await r.query(
      "INSERT IGNORE INTO ConversationWorkflow(scope,recordId,versionId,stageId,responseAnchor) VALUES(?,?,?,?,?)",
      [scope, id, version.id, stage.id, record.createdAt],
    );
    if (!version.legacy) {
      await r.query(`UPDATE ${n.table} SET status=?,closedAt=? WHERE id=?`, [
        stage.status,
        ["closed", "cancelled"].includes(stage.status) ? new Date() : null,
        id,
      ]);
      record.status = stage.status;
      const state = (await this.instance(r, scope, id, true))!;
      await r.query("SAVEPOINT initialize_workflow");
      try {
        await this.enter(r, state, stage, record, null, "created-" + id, null);
      } catch (e) {
        if (!(e instanceof AuthFault)) throw e;
        await r.query("ROLLBACK TO SAVEPOINT initialize_workflow");
        await r.query(
          "UPDATE ConversationWorkflow SET visibility='assigned' WHERE scope=? AND recordId=?",
          [scope, id],
        );
        await this.problem(r, state, "created-" + id, e.code);
      }
    }
  }
  async eligible(
    r: DataSource | QueryRunner,
    scope: WorkflowScope,
    teamId: string | null = null,
  ) {
    return r.query(
      `SELECT u.id,u.name FROM User u JOIN Role ro ON ro.\`key\`=u.roleKey WHERE u.status='active' AND ro.status='active' AND (u.roleKey='super_admin' OR JSON_CONTAINS(ro.permissions,?)) ${teamId ? "AND EXISTS(SELECT 1 FROM WorkTeamMember tm JOIN WorkTeam t ON t.id=tm.teamId AND t.active=1 WHERE tm.teamId=? AND tm.userId=u.id)" : ""} ORDER BY u.id`,
      [JSON.stringify(scope + ".view.all"), ...(teamId ? [teamId] : [])],
    );
  }
  async destination(
    r: QueryRunner,
    state: Instance,
    stage: WorkflowStage,
    record: Record<string, unknown>,
  ) {
    const route = stage.routing;
    if (route.mode === "keep" && record.assigneeId) {
      const eligible = await this.eligible(r, state.scope, state.teamId);
      if (!eligible.some((p: { id: string }) => p.id === record.assigneeId))
        throw new AuthFault(409, "workflow_destination_unavailable");
    }
    if (
      route.mode === "keep" &&
      stage.visibility === "assigned" &&
      !record.assigneeId
    ) {
      if (
        !state.teamId ||
        !(await this.eligible(r, state.scope, state.teamId)).length
      )
        throw new AuthFault(409, "workflow_destination_unavailable");
    }
    if (route.mode === "keep")
      return { teamId: state.teamId, assigneeId: record.assigneeId ?? null };
    if (route.teamId) {
      const [team] = await r.query(
        "SELECT * FROM WorkTeam WHERE id=? AND active=1 FOR UPDATE",
        [route.teamId],
      );
      if (!team) throw new AuthFault(409, "workflow_destination_unavailable");
    }
    const people: Array<{ id: string; name: string }> = await this.eligible(
      r,
      state.scope,
      route.teamId,
    );
    if (route.mode === "person") {
      if (!people.some((p) => p.id === route.userId))
        throw new AuthFault(409, "workflow_destination_unavailable");
      return { teamId: route.teamId, assigneeId: route.userId };
    }
    if (!people.length)
      throw new AuthFault(409, "workflow_destination_unavailable");
    if (route.mode === "team_queue")
      return { teamId: route.teamId, assigneeId: null };
    const [team] = await r.query(
      "SELECT cursorUserId FROM WorkTeam WHERE id=? FOR UPDATE",
      [route.teamId],
    );
    const chosen =
      people.find((p) => p.id > (team.cursorUserId ?? "")) ?? people[0];
    await r.query("UPDATE WorkTeam SET cursorUserId=? WHERE id=?", [
      chosen.id,
      route.teamId,
    ]);
    return { teamId: route.teamId, assigneeId: chosen.id };
  }
  async deadline(
    r: QueryRunner,
    state: Instance,
    anchor: Date | null,
    hours: number | null,
  ) {
    if (!anchor || !hours) return null;
    if (!state.definition.calendarVersionId)
      throw new AuthFault(409, "workflow_calendar_required");
    const [c] = await r.query(
      "SELECT definition FROM WorkCalendar WHERE id=?",
      [state.definition.calendarVersionId],
    );
    if (!c) throw new AuthFault(409, "workflow_calendar_required");
    try {
      return businessDeadline(
        anchor,
        hours,
        JSON.parse(c.definition) as BusinessCalendar,
      );
    } catch {
      throw new AuthFault(409, "workflow_calendar_horizon");
    }
  }
  async timers(
    r: QueryRunner,
    state: Instance,
    stage: WorkflowStage,
    record: Record<string, unknown>,
    resetStage = false,
  ) {
    await r.query(
      "UPDATE WorkflowJob SET status='cancelled' WHERE scope=? AND recordId=? AND status='queued' AND triggerName IN ('response_due','stage_due')",
      [state.scope, state.recordId],
    );
    const closed =
      ["closed", "cancelled"].includes(stage.status) || !!record.archivedAt;
    const hours = stage.responseHours ?? (await responsePolicy(r)).hours;
    const due = closed
      ? null
      : await this.deadline(r, state, state.responseAnchor, hours);
    const stageDue = closed
      ? null
      : resetStage
        ? await this.deadline(r, state, state.enteredAt, stage.stageHours)
        : (state.stageDueAt ??
          (await this.deadline(r, state, state.enteredAt, stage.stageHours)));
    await r.query(
      "UPDATE ConversationWorkflow SET responseDueAt=?,stageDueAt=? WHERE scope=? AND recordId=?",
      [due, stageDue, state.scope, state.recordId],
    );
    for (const [trigger, date] of [
      ["response_due", due],
      ["stage_due", stageDue],
    ] as const)
      if (date)
        await this.enqueue(
          r,
          state,
          trigger,
          `${trigger}-${state.stageEpoch}-${date.valueOf()}`,
          date,
          true,
        );
  }
  async enqueue(
    r: QueryRunner,
    state: Instance,
    trigger: string,
    eventId: string,
    date = new Date(),
    revive = false,
  ) {
    await r.query(
      `INSERT INTO WorkflowJob(id,scope,recordId,versionId,stageId,revision,stageEpoch,triggerName,eventId,availableAt) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=${revive ? "IF(status='cancelled','queued',status)" : "status"}`,
      [
        newId(),
        state.scope,
        state.recordId,
        state.versionId,
        state.stageId,
        state.revision,
        state.stageEpoch,
        trigger,
        eventId,
        date,
      ],
    );
  }
  async enter(
    r: QueryRunner,
    state: Instance,
    stage: WorkflowStage,
    record: Record<string, unknown>,
    actor: AuthUser | null,
    operationId: string,
    reason: string | null,
  ) {
    const route = await this.destination(r, state, stage, record),
      n = names(state.scope),
      from = state.stageId;
    const now = new Date();
    await r.query(
      `UPDATE ${n.table} SET status=?,assigneeId=?,closedAt=?,lastActivityAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
      [
        stage.status,
        route.assigneeId,
        ["closed", "cancelled"].includes(stage.status) ? now : null,
        state.recordId,
      ],
    );
    await r.query(
      "UPDATE ConversationWorkflow SET stageId=?,teamId=?,visibility=?,revision=revision+1,stageEpoch=stageEpoch+1,enteredAt=? WHERE scope=? AND recordId=?",
      [
        stage.id,
        route.teamId,
        stage.visibility,
        now,
        state.scope,
        state.recordId,
      ],
    );
    state = {
      ...state,
      stageId: stage.id,
      teamId: route.teamId,
      visibility: stage.visibility,
      revision: state.revision + 1,
      stageEpoch: state.stageEpoch + 1,
      enteredAt: now,
    };
    await this.timers(r, state, stage, record, true);
    await r.query(
      "INSERT INTO WorkflowEvent(id,scope,recordId,versionId,operationId,kind,fromStage,toStage,actorId,reason) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        newId(),
        state.scope,
        state.recordId,
        state.versionId,
        operationId,
        "transition",
        from,
        stage.id,
        actor?.id ?? null,
        reason,
      ],
    );
    await insertRecord(r, n.message, {
      id: newId(),
      [n.fk]: state.recordId,
      authorId: actor?.id ?? null,
      authorType: "system",
      kind: "system",
      body: `status:${stage.status}`,
    });
    if (state.scope === "requests")
      await insertRecord(r, "RequestStatusEvent", {
        id: newId(),
        requestId: state.recordId,
        fromStatus: String(record.status),
        toStatus: stage.status,
        changedById: actor?.id ?? null,
        note: null,
      });
    await audit(
      r,
      "workflow.transitioned",
      actor,
      {
        fromStage: from,
        toStage: stage.id,
        versionId: state.versionId,
        teamId: route.teamId,
        assigneeId: route.assigneeId,
        reason,
      },
      state.scope === "requests" ? "request" : "inquiry",
      state.recordId,
      undefined,
      {
        before: {
          stageId: from,
          teamId: record.teamId ?? null,
          assigneeId: record.assigneeId,
        },
        after: {
          stageId: stage.id,
          teamId: route.teamId,
          assigneeId: route.assigneeId,
        },
      },
    );
    await this.notify(r, state, "workflow_assigned");
    return state;
  }
  async notify(
    r: QueryRunner,
    state: Instance,
    type: string,
    supervisors = false,
  ) {
    const n = names(state.scope),
      [card] = await r.query(
        `SELECT assigneeId,refCode FROM ${n.table} WHERE id=?`,
        [state.recordId],
      );
    const people: Array<{ id: string }> = supervisors
      ? await r.query(
          "SELECT u.id FROM User u JOIN Role ro ON ro.`key`=u.roleKey WHERE u.status='active' AND ro.status='active' AND (u.roleKey='super_admin' OR JSON_CONTAINS(ro.permissions,'\"workflows.supervise\"'))",
        )
      : card.assigneeId
        ? [{ id: card.assigneeId }]
        : state.teamId
          ? await this.eligible(r, state.scope, state.teamId)
          : [];
    for (const person of people)
      await insertRecord(r, "Notification", {
        id: newId(),
        userId: person.id,
        type,
        payload: JSON.stringify({ ref: card.refCode }),
        link: `/ar/admin/${state.scope}/${state.recordId}`,
      });
  }
  async problem(
    r: QueryRunner,
    state: Instance,
    operationId: string,
    code: string,
  ) {
    await r.query(
      "INSERT IGNORE INTO WorkflowEvent(id,scope,recordId,versionId,operationId,kind,fromStage,toStage,reason) VALUES(?,?,?,?,?,'failed',?,?,?)",
      [
        newId(),
        state.scope,
        state.recordId,
        state.versionId,
        operationId,
        state.stageId,
        state.stageId,
        code,
      ],
    );
    await this.notify(r, state, "workflow_blocked", true);
  }
  async allowed(
    r: DataSource | QueryRunner,
    state: Instance,
    record: Record<string, unknown>,
    actor: AuthUser,
  ) {
    const member = state.teamId
      ? (
          await r.query(
            "SELECT userId FROM WorkTeamMember WHERE teamId=? AND userId=?",
            [state.teamId, actor.id],
          )
        ).length > 0
      : false;
    return state.definition.transitions.filter(
      (t) =>
        t.trigger === "manual" &&
        t.from === state.stageId &&
        matchesConditions(t, { ...record, teamId: state.teamId }) &&
        can(
          actor,
          state.scope === "requests" ? "requests.status" : "inquiries.status",
        ) &&
        (t.actors.includes("staff") ||
          (t.actors.includes("assignee") && record.assigneeId === actor.id) ||
          (t.actors.includes("team") && member)),
    );
  }
  async transition(
    actor: AuthUser,
    scope: WorkflowScope,
    id: string,
    input: {
      transitionId: string;
      expectedRevision: number;
      operationId: string;
      reason?: string;
    },
  ) {
    if (
      !can(
        actor,
        scope === "requests" ? "requests.view.all" : "inquiries.view.all",
      )
    )
      throw new AuthFault(403, "forbidden");
    return transaction(this.db, async (r) => {
      await assertWorkflowAccess(r, actor, scope, id);
      const n = names(scope),
        [record] = await r.query(
          `SELECT * FROM ${n.table} WHERE id=? FOR UPDATE`,
          [id],
        );
      const state = await this.instance(r, scope, id, true);
      if (!state || state.legacy) throw new AuthFault(409, "workflow_legacy");
      const [done] = await r.query(
        "SELECT actorId,toStage FROM WorkflowEvent WHERE scope=? AND recordId=? AND operationId=?",
        [scope, id, input.operationId],
      );
      if (done) {
        if (done.actorId !== actor.id)
          throw new AuthFault(409, "workflow_conflict");
        return { ok: true };
      }
      if (state.revision !== input.expectedRevision)
        throw new AuthFault(409, "workflow_conflict");
      if (record.archivedAt) throw new AuthFault(409, "locked");
      const t = (await this.allowed(r, state, record, actor)).find(
        (t) => t.id === input.transitionId,
      );
      if (!t) throw new AuthFault(403, "forbidden");
      if (t.reasonRequired && !input.reason?.trim())
        throw new AuthFault(400, "workflow_reason_required");
      await this.enter(
        r,
        state,
        state.definition.stages.find((s) => s.id === t.to)!,
        record,
        actor,
        input.operationId,
        input.reason?.trim() || null,
      );
      return { ok: true };
    });
  }
  async legacyPatch(
    r: QueryRunner,
    actor: AuthUser,
    scope: WorkflowScope,
    id: string,
    status: string,
    note: unknown,
  ) {
    const state = await this.instance(r, scope, id, true);
    if (!state || state.legacy) return false;
    await assertWorkflowAccess(r, actor, scope, id, true);
    const n = names(scope),
      [record] = await r.query(
        `SELECT * FROM ${n.table} WHERE id=? FOR UPDATE`,
        [id],
      );
    if (record.archivedAt) throw new AuthFault(409, "locked");
    const customer =
      record.clientId === actor.id && !can(actor, "requests.view.all");
    if (
      customer &&
      (scope !== "requests" ||
        status !== "cancelled" ||
        !canTransition(String(record.status), "cancelled", "client"))
    )
      throw new AuthFault(403, "forbidden");
    const available = customer
      ? state.definition.transitions.filter(
          (t) =>
            t.trigger === "manual" &&
            t.from === state.stageId &&
            matchesConditions(t, { ...record, teamId: state.teamId }),
        )
      : await this.allowed(r, state, record, actor);
    const candidates = available.filter(
      (t) =>
        state.definition.stages.find((s) => s.id === t.to)?.status === status,
    );
    if (candidates.length !== 1)
      throw new AuthFault(409, "workflow_ambiguous_transition");
    const t = candidates[0],
      reason = typeof note === "string" ? note.trim().slice(0, 500) : null;
    if (t.reasonRequired && !reason)
      throw new AuthFault(400, "workflow_reason_required");
    await this.enter(
      r,
      state,
      state.definition.stages.find((s) => s.id === t.to)!,
      record,
      actor,
      newId(),
      reason,
    );
    return true;
  }
  async reply(
    r: QueryRunner,
    scope: WorkflowScope,
    id: string,
    side: "client" | "staff",
    messageId: string,
    mirrorLegacy = true,
  ) {
    const state = await this.instance(r, scope, id, true);
    if (!state) return false;
    const n = names(scope),
      [record] = await r.query(`SELECT * FROM ${n.table} WHERE id=?`, [id]);
    if (state.legacy) {
      if (!mirrorLegacy) return false;
      const status =
        scope === "inquiries"
          ? side === "client"
            ? "in_review"
            : "responded"
          : side === "client" && record.status === "awaiting_info"
            ? "in_review"
            : record.status;
      await r.query(
        "UPDATE ConversationWorkflow SET stageId=?,revision=revision+1 WHERE scope=? AND recordId=?",
        [status, scope, id],
      );
      return false;
    }
    state.responseAnchor = side === "client" ? new Date() : null;
    await r.query(
      "UPDATE ConversationWorkflow SET responseAnchor=?,revision=revision+1 WHERE scope=? AND recordId=?",
      [state.responseAnchor, scope, id],
    );
    state.revision++;
    await r.query("SAVEPOINT reply_timers");
    try {
      await this.timers(
        r,
        state,
        state.definition.stages.find((s) => s.id === state.stageId)!,
        record,
      );
    } catch (error) {
      await r.query("ROLLBACK TO SAVEPOINT reply_timers");
      if (!(error instanceof AuthFault)) throw error;
      await this.problem(r, state, "timer-" + messageId, error.code);
    }
    await this.enqueue(r, state, side + "_reply", "reply-" + messageId);
    return true;
  }
  async processOne(now = new Date()) {
    return transaction(this.db, async (r) => {
      // Lock the conversation before its job, matching reply/transition lock order.
      // A crashed worker rolls back the transaction, leaving the durable event queued.
      const [candidate] = await r.query(
        "SELECT id,scope,recordId FROM WorkflowJob WHERE status='queued' AND availableAt<=? ORDER BY availableAt,createdAt,id LIMIT 1",
        [now],
      );
      if (!candidate) return false;
      const n = names(candidate.scope),
        [record] = await r.query(
          `SELECT * FROM ${n.table} WHERE id=? FOR UPDATE`,
          [candidate.recordId],
        );
      const [job] = await r.query(
        "SELECT * FROM WorkflowJob WHERE id=? AND status='queued' FOR UPDATE SKIP LOCKED",
        [candidate.id],
      );
      if (!job) return true;
      const state = await this.instance(r, job.scope, job.recordId, true);
      if (
        !record ||
        !state ||
        state.legacy ||
        record.archivedAt ||
        state.versionId !== job.versionId ||
        state.stageId !== job.stageId ||
        state.stageEpoch !== job.stageEpoch
      ) {
        await r.query("UPDATE WorkflowJob SET status='cancelled' WHERE id=?", [
          job.id,
        ]);
        return true;
      }
      const t = state.definition.transitions.find(
        (t) =>
          t.from === state.stageId &&
          t.trigger === job.triggerName &&
          matchesConditions(t, { ...record, teamId: state.teamId }),
      );
      await r.query("SAVEPOINT workflow_action");
      try {
        if (t?.action === "transition")
          await this.enter(
            r,
            state,
            state.definition.stages.find((s) => s.id === t.to)!,
            record,
            null,
            job.eventId,
            null,
          );
        else if (t?.action === "notify")
          await this.notify(r, state, "workflow_overdue", true);
        await r.query(
          "UPDATE WorkflowJob SET status='done',attempts=attempts+1 WHERE id=?",
          [job.id],
        );
      } catch (e) {
        await r.query("ROLLBACK TO SAVEPOINT workflow_action");
        if (!(e instanceof AuthFault)) throw e;
        await this.problem(r, state, job.eventId, e.code);
        await r.query(
          "UPDATE WorkflowJob SET status='failed',errorCode=?,attempts=attempts+1 WHERE id=?",
          [e.code, job.id],
        );
      }
      return true;
    });
  }
  async state(
    actor: AuthUser,
    scope: WorkflowScope,
    id: string,
  ): Promise<WorkflowState | null> {
    await assertWorkflowAccess(this.db, actor, scope, id);
    const state = await this.instance(this.db, scope, id);
    if (!state) return null;
    const legacyDue = state.legacy
      ? conversationDueSql(scope, "p", (await responsePolicy(this.db)).hours)
      : "NULL";
    const [record] = await this.db.query(
      `SELECT p.*,${legacyDue} legacyDueAt FROM ${names(scope).table} p WHERE p.id=?`,
      [id],
    );
    const stage = state.definition.stages.find(
      (s) => s.id === (state.legacy ? record.status : state.stageId),
    );
    if (!stage) return null;
    const events = await this.db.query(
      "SELECT e.id,e.kind,e.fromStage,e.toStage,e.createdAt,e.reason,v.definition FROM WorkflowEvent e JOIN WorkflowVersion v ON v.id=e.versionId WHERE e.scope=? AND e.recordId=? ORDER BY e.createdAt DESC,e.id DESC LIMIT 100",
      [scope, id],
    );
    const [team] = state.teamId
      ? await this.db.query("SELECT nameAr,nameEn FROM WorkTeam WHERE id=?", [
          state.teamId,
        ])
      : [];
    const effect = state.definition.transitions.find(
      (t) =>
        t.trigger === "staff_reply" &&
        t.from === state.stageId &&
        matchesConditions(t, { ...record, teamId: state.teamId }),
    );
    const target = effect
      ? state.definition.stages.find((s) => s.id === effect.to)
      : null;
    return {
      workflowId: state.workflowId,
      versionId: state.versionId,
      revision: state.revision,
      legacy: state.legacy,
      stage: {
        id: stage.id,
        nameAr: stage.nameAr,
        nameEn: stage.nameEn,
        status: stage.status,
      },
      teamId: state.teamId,
      teamLabels: team ?? null,
      teamName: team?.[actor.locale === "ar" ? "nameAr" : "nameEn"] ?? null,
      responseDueAt:
        (state.legacy
          ? record.legacyDueAt
          : state.responseDueAt
        )?.toISOString() ?? null,
      stageDueAt: state.stageDueAt?.toISOString() ?? null,
      transitions: (await this.allowed(
        this.db,
        { ...state, stageId: stage.id },
        record,
        actor,
      )).map((transition) => {
        const destination = state.definition.stages.find(
          (stage) => stage.id === transition.to,
        );
        return {
          ...transition,
          ...(destination ? {
            targetStage: {
              nameAr: destination.nameAr,
              nameEn: destination.nameEn,
              status: destination.status,
            },
          } : {}),
        };
      }),
      replyEffect: target
        ? {
            nameAr: target.nameAr,
            nameEn: target.nameEn,
            status: target.status,
          }
        : null,
      events: events.map(
        (e: {
          id: string;
          kind: string;
          fromStage: string;
          toStage: string;
          reason: string | null;
          createdAt: Date;
          definition: string;
        }) => {
          const stages = (JSON.parse(e.definition) as WorkflowDefinition)
            .stages;
          const label = (id: string) => {
            const s = stages.find((s) => s.id === id);
            return s ? { nameAr: s.nameAr, nameEn: s.nameEn } : null;
          };
          return {
            id: e.id,
            kind: e.kind,
            fromStage: e.fromStage,
            toStage: e.toStage,
            reason: e.reason,
            createdAt: e.createdAt.toISOString(),
            fromName: label(e.fromStage),
            toName: label(e.toStage),
          };
        },
      ),
    };
  }
}
