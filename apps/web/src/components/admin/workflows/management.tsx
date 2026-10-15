import { useEffect, useState } from "react";
import {
  can,
  canTransition,
  REQUEST_STATUSES,
  type WorkflowState,
  type WorkflowScope,
} from "@so7ob/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Archive, ArchiveRestore, UserPlus, Paperclip } from "lucide-react";
import { getPortalContent } from "@/content/portal";
import type { Locale } from "@/lib/i18n";
import { apiGet, fmtDateTime } from "../helpers";
import type { Me, StaffOption, AttachmentRow } from "../types";
import { words, wfCard, workflowPost } from "./shared";
import { ErrorFeedback } from "@/components/errors/error-feedback";
import { asApiError } from "@/lib/errors/transport";
export function ConversationManagement({
  scope,
  locale,
  me,
  detail,
  patch,
  onChanged,
  disabled,
}: {
  scope: WorkflowScope;
  locale: Locale;
  me: Me;
  detail: {
    id: string;
    status: string;
    priority?: string;
    assigneeId: string | null;
    assignee?: StaffOption | null;
    archivedAt: string | null;
    workflow?: WorkflowState | null;
  };
  patch: (body: Record<string, unknown>, message?: string) => Promise<boolean>;
  onChanged: () => void;
  disabled: boolean;
}) {
  const t = words(locale),
    content = getPortalContent(locale),
    tr = content.admin.requests,
    request = scope === "requests",
    prefix = request ? "request" : "inquiry",
    statuses = request ? tr.statuses : content.admin.inquiries.statuses,
    state = detail.workflow,
    custom = !!state && !state.legacy;
  const [staff, setStaff] = useState<StaffOption[]>([]),
    [reason, setReason] = useState(""),
    [target, setTarget] = useState(""),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void apiGet<{ staff: StaffOption[] }>(
      "/api/admin/workflows/options?scope=" +
        scope +
        (state?.teamId ? "&team=" + encodeURIComponent(state.teamId) : ""),
      c.signal,
    )
      .then((r) => setStaff(r.staff))
      .catch((e) => {
        if (!c.signal.aborted) setError(e);
      });
    return () => c.abort();
  }, [scope, state?.teamId]);
  const locked = disabled || busy || asApiError(error).uncertain;
  const transitionLabel = (transition: WorkflowState["transitions"][number]) =>
    transition[locale === "ar" ? "nameAr" : "nameEn"] +
    t(" إلى ", " to ") +
    (transition.targetStage?.[locale === "ar" ? "nameAr" : "nameEn"] ??
      t("المرحلة ", "stage ") + transition.to);
  const selectedTransition = custom
    ? state.transitions.find((transition) => transition.id === target)
    : undefined;
  const perform = async (value: string, note?: string) => {
    if (locked) return;
    setBusy(true);
    setError(null);
    try {
      if (custom) {
        await workflowPost(`${scope}/${detail.id}/transition`, {
          transitionId: value,
          expectedRevision: state.revision,
          operationId: crypto.randomUUID(),
          reason: note,
        });
        onChanged();
      } else if (
        !(await patch(
          { status: value, ...(note ? { note } : {}) },
          statuses[value],
        ))
      )
        return;
      setTarget("");
      setReason("");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const change = (value: string) => {
    const requires = custom
      ? state.transitions.find((t) => t.id === value)?.reasonRequired
      : request && ["closed", "cancelled"].includes(value);
    if (requires) {
      setTarget(value);
      return;
    }
    void perform(value);
  };
  const assignment = (id: string | null) =>
    patch({
      assigneeId: id,
      ...(state ? { expectedRevision: state.revision } : {}),
    });
  return (
    <section className={wfCard + " print:hidden"}>
      <h2 className="text-base font-semibold text-navy">
        {t("إدارة المعاملة", "Manage conversation")}
      </h2>
      {error ? (
        <ErrorFeedback
          error={error}
          locale={locale}
          onRefresh={async () => {
            onChanged();
            setError(null);
          }}
        />
      ) : null}
      {state && (custom || state.responseDueAt) ? (
        <div className="rounded-xl bg-accent/50 p-3 text-sm">
          {custom ? (
            <p className="font-semibold">
              {state.stage[locale === "ar" ? "nameAr" : "nameEn"]}
            </p>
          ) : null}
          {state.teamName ? (
            <p>
              {state.teamLabels?.[locale === "ar" ? "nameAr" : "nameEn"] ??
                state.teamName}
            </p>
          ) : null}
          {state.responseDueAt ? (
            <p>
              {t("موعد الرد: ", "Response due: ")}
              {fmtDateTime(state.responseDueAt, locale)}
            </p>
          ) : null}
          {state.stageDueAt ? (
            <p>
              {t("مهلة المرحلة: ", "Stage due: ")}
              {fmtDateTime(state.stageDueAt, locale)}
            </p>
          ) : null}
        </div>
      ) : null}
      {can(me, request ? "requests.assign" : "inquiries.assign") ? (
        <div className="space-y-2">
          <Label htmlFor={prefix + "-assignee"}>{tr.filterAssignee}</Label>
          <div className="flex gap-2">
            <Select
              value={detail.assigneeId ?? "none"}
              disabled={locked}
              onValueChange={(v) => void assignment(v === "none" ? null : v)}
            >
              <SelectTrigger
                id={prefix + "-assignee"}
                className="min-h-11 flex-1"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tr.unassigned}</SelectItem>
                {detail.assignee &&
                !staff.some((s) => s.id === detail.assigneeId) ? (
                  <SelectItem value={detail.assignee.id}>
                    {detail.assignee.name}
                  </SelectItem>
                ) : null}
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="size-11 shrink-0"
              disabled={locked || detail.assigneeId === me.id}
              aria-label={tr.assignToMe}
              onClick={() => void assignment(me.id)}
            >
              <UserPlus className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
      {request && can(me, "requests.status") ? (
        <div className="space-y-2">
          <Label htmlFor="request-priority">{tr.priority}</Label>
          <Select
            value={detail.priority ?? "normal"}
            onValueChange={(v) =>
              void patch(
                {
                  priority: v,
                  ...(state ? { expectedRevision: state.revision } : {}),
                },
                tr.priorities[v],
              )
            }
            disabled={locked}
          >
            <SelectTrigger id="request-priority" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(tr.priorities).map(([v, n]) => (
                <SelectItem key={v} value={v}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {can(me, request ? "requests.status" : "inquiries.status") ? (
        <div className="space-y-2">
          <Label htmlFor={prefix + "-status"}>{tr.changeStatus}</Label>
          <Select
            value={custom ? "current" : detail.status}
            disabled={locked || (custom && !!detail.archivedAt)}
            onValueChange={change}
          >
            <SelectTrigger id={prefix + "-status"} className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {custom ? (
                <>
                  <SelectItem value="current" disabled>
                    {state.stage[locale === "ar" ? "nameAr" : "nameEn"]}
                  </SelectItem>
                  {state.transitions.map((tr) => (
                    <SelectItem key={tr.id} value={tr.id}>
                      {transitionLabel(tr)}
                    </SelectItem>
                  ))}
                </>
              ) : (
                Object.entries(statuses)
                  .filter(
                    ([v]) =>
                      v === detail.status ||
                      !request ||
                      canTransition(detail.status, v, "staff"),
                  )
                  .map(([v, n]) => (
                    <SelectItem
                      key={v}
                      value={v}
                      disabled={v === detail.status}
                    >
                      {n}
                    </SelectItem>
                  ))
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t(
              "يُحفظ التغيير مباشرة بعد الاختيار.",
              "Changes are saved immediately after selection.",
            )}
          </p>
        </div>
      ) : null}
      {can(me, request ? "requests.archive" : "inquiries.archive") ? (
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={locked}
          onClick={() =>
            void patch(
              { action: detail.archivedAt ? "restore" : "archive" },
              detail.archivedAt ? tr.restore : tr.archived,
            )
          }
        >
          {detail.archivedAt ? (
            <ArchiveRestore className="size-4" />
          ) : (
            <Archive className="size-4" />
          )}
          {detail.archivedAt ? tr.restore : tr.archive}
        </Button>
      ) : null}
      {custom && state.events.length ? (
        <details>
          <summary className="cursor-pointer py-3 font-medium">
            {tr.history}
          </summary>
          <ol className="space-y-3 text-sm">
            {state.events.map((e) => (
              <li key={e.id} className="border-s-2 ps-3">
                <p>
                  {e.kind === "failed"
                    ? t(
                        "تعثر التنفيذ؛ يحتاج مراجعة المشرف",
                        "Execution blocked; supervisor review needed",
                      )
                    : t("انتقال مرحلة", "Stage transition")}
                </p>
                {e.kind === "transition" ? (
                  <p>
                    {e.fromName?.[locale === "ar" ? "nameAr" : "nameEn"]} →{" "}
                    {e.toName?.[locale === "ar" ? "nameAr" : "nameEn"]}
                  </p>
                ) : null}
                <time>{fmtDateTime(e.createdAt, locale)}</time>
                {e.kind !== "failed" && e.reason ? (
                  <p className="break-words">{e.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open && !busy) setTarget("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {custom ? t("تأكيد الانتقال", "Confirm transition") : tr.closeReason}
            </DialogTitle>
            <DialogDescription>
              {selectedTransition ? transitionLabel(selectedTransition) : statuses[target]}
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="close-reason">
            {t("سبب الانتقال", "Transition reason")}
          </Label>
          <Input
            id="close-reason"
            placeholder={tr.closeReasonPlaceholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          <Button
            disabled={locked || !reason.trim()}
            onClick={() => void perform(target, reason.trim())}
          >
            {tr.applyStatus}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function ReplyWorkflowHint({
  workflow,
  scope,
  locale,
}: {
  workflow?: WorkflowState | null;
  scope: WorkflowScope;
  locale: Locale;
}) {
  const t = words(locale);
  return (
    <p className="mb-2 text-sm text-muted-foreground">
      {workflow && !workflow.legacy
        ? workflow.replyEffect
          ? t(
              "بعد الرد العام، ينفذ المسار الانتقال إلى: ",
              "After the public reply, the workflow moves to: ",
            ) + workflow.replyEffect[locale === "ar" ? "nameAr" : "nameEn"]
          : t(
              "لا توجد قاعدة انتقال مطابقة لهذا الرد.",
              "No workflow transition matches this reply.",
            )
        : scope === "inquiries"
          ? t(
              "الرد العام يغير الحالة إلى «تم الرد».",
              "A public reply changes the status to Responded.",
            )
          : t(
              "الرد العام لا يغير الحالة تلقائيًا.",
              "A public reply does not automatically change the status.",
            )}
    </p>
  );
}
export function ConversationAttachments({
  attachments,
  locale,
}: {
  attachments: AttachmentRow[];
  locale: Locale;
}) {
  const t = words(locale);
  return (
    <section className={wfCard}>
      <h2 className="font-semibold">
        {getPortalContent(locale).account.detail.attachments}
      </h2>
      {attachments.length ? (
        <ul className="space-y-2">
          {attachments.map((file) => (
            <li key={file.id}>
              <a
                className="flex min-h-11 items-center gap-2 rounded-xl border p-3 text-sm hover:bg-accent focus-visible:outline-2"
                href={"/api/attachments/" + file.id}
              >
                <Paperclip className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  {file.filename}
                </span>
                <span className="ms-auto shrink-0 text-xs">
                  {Math.ceil(file.size / 1024)} KB
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("لا توجد مرفقات", "No attachments")}
        </p>
      )}
    </section>
  );
}
