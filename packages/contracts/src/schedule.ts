// Source: Website fc4a959, pure scheduling policy. Runtime execution is owned by the Node worker.
/** أدنى مهلة بين الجدولة والموعد — يمنع «الجدولة في الماضي» ومنع سباق خاطف */
export const MIN_SCHEDULE_LEAD_MS = 30_000;
/** أقصى أفق زمني للجدولة (سنتان) — حاجز ضد قيم شاذة */
export const MAX_SCHEDULE_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export type ScheduleParseResult =
  | { ok: true; date: Date }
  | { ok: false; code: "invalid_time" | "past_time" | "far_future" };

/**
 * تحقق خالص من مدخل الجدولة: سلسلة ISO صالحة ضمن المهلة والأفق.
 * `now` يمرر صراحة ليبقى الاختبار حتميًا.
 */
export function parseScheduleInput(input: unknown, now: Date): ScheduleParseResult {
  if (typeof input !== "string" || input.trim() === "") return { ok: false, code: "invalid_time" };
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return { ok: false, code: "invalid_time" };
  if (d.getTime() < now.getTime() + MIN_SCHEDULE_LEAD_MS) return { ok: false, code: "past_time" };
  if (d.getTime() > now.getTime() + MAX_SCHEDULE_HORIZON_MS) return { ok: false, code: "far_future" };
  return { ok: true, date: d };
}

export type ScheduleDecision =
  | { action: "publish" }
  | { action: "skip"; reason: "revision_conflict" | "archived" | "invalid_state" };

/**
 * قرار خالص لصفحة وصل موعدها: هل نُشر أم نُسقط؟
 * (لا تلمس قاعدة البيانات — حتمية وقابلة للاختبار بمعزول)
 */
export function decideScheduledPublish(
  page: {
    status: string;
    draftRevision: number;
    scheduledRevision: number | null;
  },
  now: Date,
  dueAt: Date
): ScheduleDecision {
  if (page.status === "archived") return { action: "skip", reason: "archived" };
  if (page.scheduledRevision === null) return { action: "skip", reason: "invalid_state" };
  if (page.scheduledRevision !== page.draftRevision) return { action: "skip", reason: "revision_conflict" };
  if (dueAt.getTime() > now.getTime()) return { action: "skip", reason: "invalid_state" };
  return { action: "publish" };
}

