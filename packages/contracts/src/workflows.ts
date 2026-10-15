import { z } from "zod";
import { REQUEST_STATUSES, STATUS_TRANSITIONS } from "./requests.js";
export const WORKFLOW_SCOPES = ["requests", "inquiries"] as const;
export type WorkflowScope = (typeof WORKFLOW_SCOPES)[number];
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const label = z.string().trim().min(1).max(120);
export const conditionFields = [
  "serviceType",
  "requestType",
  "category",
  "priority",
  "status",
  "assigneeId",
  "teamId",
] as const;
export const workflowTriggers = [
  "manual",
  "client_reply",
  "staff_reply",
  "response_due",
  "stage_due",
] as const;
export const conditionSchema = z
  .object({
    field: z.enum(conditionFields),
    op: z.enum(["eq", "ne", "in", "not_in", "empty", "not_empty"]),
    value: z.string().max(500).default(""),
  })
  .strict();
export const routingSchema = z
  .object({
    mode: z.enum(["keep", "team_queue", "person", "round_robin"]),
    teamId: key.nullable().default(null),
    userId: key.nullable().default(null),
  })
  .strict();
export const stageSchema = z
  .object({
    id: key,
    nameAr: label,
    nameEn: label,
    status: z.enum(REQUEST_STATUSES),
    visibility: z.enum(["authorized", "assigned"]),
    routing: routingSchema,
    responseHours: z.number().int().min(1).max(720).nullable().default(null),
    stageHours: z.number().int().min(1).max(720).nullable().default(null),
    x: z.number().min(0).max(10000).default(0),
    y: z.number().min(0).max(10000).default(0),
  })
  .strict();
export const transitionSchema = z
  .object({
    id: key,
    from: key,
    to: key,
    nameAr: label,
    nameEn: label,
    trigger: z.enum(workflowTriggers),
    action: z.enum(["transition", "notify"]).default("transition"),
    reasonRequired: z.boolean().default(false),
    actors: z
      .array(z.enum(["staff", "assignee", "team"]))
      .min(1)
      .default(["staff"]),
    match: z.enum(["all", "any"]).default("all"),
    conditions: z.array(conditionSchema).max(20).default([]),
  })
  .strict();
export const workflowDefinitionSchema = z
  .object({
    scope: z.enum(WORKFLOW_SCOPES),
    nameAr: label,
    nameEn: label,
    initialStage: key,
    calendarVersionId: key.nullable(),
    stages: z.array(stageSchema).min(1).max(60),
    transitions: z.array(transitionSchema).max(240),
  })
  .strict();
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowStage = z.infer<typeof stageSchema>;
export type WorkflowTransition = z.infer<typeof transitionSchema>;
export type WorkflowCondition = z.infer<typeof conditionSchema>;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const interval = z
  .object({ start: time, end: z.union([time, z.literal("24:00")]) })
  .strict()
  .refine((x) => x.start < x.end);
export const calendarSchema = z
  .object({
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
    week: z.array(z.array(interval).max(5)).length(7),
    exceptions: z
      .array(
        z
          .object({
            date: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .refine((v) => {
                const d = new Date(v + "T00:00:00Z");
                return (
                  Number.isFinite(d.valueOf()) &&
                  d.toISOString().slice(0, 10) === v
                );
              }),
            intervals: z.array(interval).max(5),
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const intervals of [
      ...c.week,
      ...c.exceptions.map((e) => e.intervals),
    ])
      for (let i = 1; i < intervals.length; i++)
        if (intervals[i].start < intervals[i - 1].end)
          ctx.addIssue({ code: "custom", message: "overlapping_intervals" });
    if (!c.week.some((d) => d.length))
      ctx.addIssue({ code: "custom", message: "empty_calendar" });
    if (new Set(c.exceptions.map((e) => e.date)).size !== c.exceptions.length)
      ctx.addIssue({ code: "custom", message: "duplicate_date" });
  });
export type BusinessCalendar = z.infer<typeof calendarSchema>;
export function validateWorkflow(def: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const ids = new Set(def.stages.map((s) => s.id));
  if (
    ids.size !== def.stages.length ||
    new Set(def.transitions.map((t) => t.id)).size !== def.transitions.length
  )
    errors.push("duplicate_id");
  if (!ids.has(def.initialStage)) errors.push("initial_stage");
  if (
    def.scope === "inquiries" &&
    def.stages.some((s) => ["in_progress", "cancelled"].includes(s.status))
  )
    errors.push("inquiry_status");
  for (const s of def.stages) {
    if (
      ["team_queue", "round_robin"].includes(s.routing.mode) &&
      !s.routing.teamId
    )
      errors.push("routing_team");
    if (s.routing.mode === "person" && !s.routing.userId)
      errors.push("routing_person");
  }
  for (const t of def.transitions) {
    if (!ids.has(t.from) || !ids.has(t.to)) errors.push("transition_stage");
    if (t.trigger !== "manual" && t.reasonRequired)
      errors.push("automatic_reason");
    if (
      t.action === "notify" &&
      !["stage_due", "response_due"].includes(t.trigger)
    )
      errors.push("notification_trigger");
  }
  const reach = (start: string, reverse = false) => {
    const seen = new Set([start]);
    for (let n = 0; n < ids.size; n++)
      for (const t of def.transitions.filter((t) => t.action === "transition"))
        if (seen.has(reverse ? t.to : t.from))
          seen.add(reverse ? t.from : t.to);
    return seen;
  };
  if (reach(def.initialStage).size !== ids.size)
    errors.push("unreachable_stage");
  const terminal = def.stages.filter((s) =>
    ["closed", "cancelled"].includes(s.status),
  );
  const closable = new Set(terminal.flatMap((s) => [...reach(s.id, true)]));
  if (closable.size !== ids.size) errors.push("missing_terminal_path");
  return [...new Set(errors)];
}
export function matchesConditions(
  t: Pick<WorkflowTransition, "match" | "conditions">,
  fields: Record<string, unknown>,
) {
  const results = t.conditions.map((c) => {
    const v = String(fields[c.field] ?? "");
    const list = c.value.split(",").map((x) => x.trim());
    return c.op === "eq"
      ? v === c.value
      : c.op === "ne"
        ? v !== c.value
        : c.op === "in"
          ? list.includes(v)
          : c.op === "not_in"
            ? !list.includes(v)
            : c.op === "empty"
              ? !v
              : !!v;
  });
  return (
    !results.length ||
    (t.match === "all" ? results.every(Boolean) : results.some(Boolean))
  );
}
export function legacyWorkflow(scope: WorkflowScope): WorkflowDefinition {
  const statuses =
    scope === "requests"
      ? [...REQUEST_STATUSES]
      : (["new", "in_review", "awaiting_info", "responded", "closed"] as const);
  return {
    scope,
    nameAr:
      scope === "requests" ? "مسار الطلبات الأصلي" : "مسار الاستفسارات الأصلي",
    nameEn:
      scope === "requests"
        ? "Original request workflow"
        : "Original inquiry workflow",
    initialStage: "new",
    calendarVersionId: null,
    stages: statuses.map((status, i) => ({
      id: status,
      nameAr: {
        new: "جديد",
        in_review: "قيد المراجعة",
        awaiting_info: "بانتظار معلومات",
        in_progress: "قيد التنفيذ",
        responded: "تم الرد",
        closed: "مغلق",
        cancelled: "ملغى",
      }[status],
      nameEn: status.replaceAll("_", " "),
      status,
      visibility: "authorized",
      routing: { mode: "keep", teamId: null, userId: null },
      responseHours: null,
      stageHours: null,
      x: 60 + (i % 3) * 260,
      y: 60 + Math.floor(i / 3) * 180,
    })),
    transitions: statuses.flatMap((from) =>
      statuses
        .filter(
          (to) =>
            to !== from &&
            (scope === "inquiries" ||
              STATUS_TRANSITIONS[from]?.some(
                (r) => r.actor === "staff" && r.to.includes(to),
              )),
        )
        .map((to) => ({
          id: from + "-" + to,
          from,
          to,
          nameAr: "انتقال",
          nameEn: "Move",
          trigger: "manual",
          action: "transition",
          reasonRequired:
            scope === "requests" && ["closed", "cancelled"].includes(to),
          actors: ["staff"],
          match: "all",
          conditions: [],
        })),
    ),
  };
}
export interface WorkflowPublicStage {
  nameAr: string;
  nameEn: string;
  status: string;
}
export interface WorkflowState {
  workflowId: string;
  versionId: string;
  revision: number;
  legacy: boolean;
  stage: WorkflowPublicStage & {id:string};
  teamId: string | null;
  teamName: string | null;
  teamLabels: { nameAr: string; nameEn: string } | null;
  responseDueAt: string | null;
  stageDueAt: string | null;
  /** Public timezone of the pinned work calendar; absent on older responses. */
  calendarTimezone?: string | null;
  /** Response-only destination names from this record's pinned publication. */
  transitions: Array<WorkflowTransition & { targetStage?: WorkflowPublicStage }>;
  replyEffect: WorkflowPublicStage | null;
  events: Array<{
    id: string;
    kind: string;
    fromStage: string | null;
    toStage: string | null;
    createdAt: string;
    reason: string | null;
    fromName: { nameAr: string; nameEn: string } | null;
    toName: { nameAr: string; nameEn: string } | null;
  }>;
}
