"use client";
import { TrackPanel } from "@/components/admin/track/track-panel";
import { ErrorFeedback } from "@/components/errors/error-feedback";
import { asApiError } from "@/lib/errors/transport";
import { apiUpload } from "../helpers";
import {
  ConversationAttachments,
  ConversationManagement,
  ReplyWorkflowHint,
} from "../workflows/management";

/**
 * تفاصيل الاستفسار: محادثة (رد/ملاحظة داخلية) + تعيين + تغيير حالة +
 * أرشفة/استعادة + طباعة — نسخة أخف من تفاصيل الطلب بنفس عناصر المحادثة المشتركة.
 */
import { StatusBadge } from "@/components/admin/badges";
import { MessageBubble, ReplyComposer } from "@/components/admin/conversation";
import { EmptyState } from "@/components/admin/empty-state";
import {
  ApiError,
  apiErrorMessage,
  apiGet,
  apiSend,
  fmtDateTime,
} from "@/components/admin/helpers";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ar as siteAr } from "@/content/ar";
import { en as siteEn } from "@/content/en";
import { getPortalContent } from "@/content/portal";
import { can } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import Link from "@/routing/link";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  MessageSquareText,
  Printer,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  InquiryDetail,
  InquiryDetailResponse,
  Me,
  MessageRow,
} from "../types";

interface InquiryDetailClientProps {
  me: Me;
  locale: Locale;
  inquiryId: string;
}

export function InquiryDetailClient({
  me,
  locale,
  inquiryId,
}: InquiryDetailClientProps) {
  const t = getPortalContent(locale);
  const ti = t.admin.inquiries;
  const td = t.account.detail;
  const siteMeta = locale === "en" ? siteEn.meta : siteAr.meta;

  const [detail, setDetail] = useState<InquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [failure, setFailure] = useState<{
    error: ApiError;
    operation: string;
  } | null>(null);
  const needsReview =
    !!failure &&
    ["network", "timeout", "invalid_response"].includes(failure.error.code);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const mayReply = can(me, "inquiries.reply");

  const load = useCallback(
    async (signal: AbortSignal, quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const res = await apiGet<InquiryDetailResponse>(
          `/api/admin/inquiries/${inquiryId}`,
          signal,
        );
        if (!signal.aborted) {
          setDetail(res.inquiry);
          setNotFound(false);
          setError(null);
          return true;
        }
      } catch (err) {
        if (signal.aborted || quiet) return false;
        if (
          err instanceof ApiError &&
          (err.code === "not_found" || err.status === 404)
        ) {
          setNotFound(true);
        } else if (err instanceof ApiError) {
          setError(apiErrorMessage(err, t.auth.errors));
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [inquiryId, t.auth.errors],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadToken]);

  const reload = () => setReloadToken((v) => v + 1);

  const patch = async (body: Record<string, unknown>, successMsg?: string) => {
    if (busyRef.current || needsReview) return false;
    setFailure(null);
    setBusy(true);
    busyRef.current = true;
    try {
      await apiSend(`/api/admin/inquiries/${inquiryId}`, "PATCH", body);
      if (!(await load(new AbortController().signal, true)))
        setFailure({
          error: new ApiError(0, "network"),
          operation: t.admin.requests.savedRefreshFailed,
        });
      else if (successMsg) toast.success(successMsg);
      return true;
    } catch (err) {
      setFailure({
        error: asApiError(err),
        operation:
          body.status !== undefined ? t.admin.requests.changeStatus : ti.assign,
      });
      return false;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  const sendMessage = async (
    kind: "message" | "internal_note",
    body: string,
  ) => {
    if (needsReview) return false;
    setFailure(null);
    setSending(true);
    busyRef.current = true;
    try {
      const res = await apiSend<{ ok: boolean; message: MessageRow }>(
        `/api/admin/inquiries/${inquiryId}/messages`,
        "POST",
        { body, kind },
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              messages: [
                ...prev.messages,
                {
                  ...res.message,
                  author: { id: me.id, name: me.name, roleKey: me.roleKey },
                },
              ],
            }
          : prev,
      );
      toast.success(
        kind === "internal_note"
          ? t.admin.requests.sentNote
          : t.admin.requests.sentReply,
      );
      const controller = new AbortController();
      if (!(await load(controller.signal, true)))
        setFailure({
          error: new ApiError(0, "network"),
          operation: t.admin.requests.savedRefreshFailed,
        });
      return true;
    } catch (err) {
      setFailure({ error: asApiError(err), operation: t.admin.requests.reply });
      return false;
    } finally {
      setSending(false);
      busyRef.current = false;
    }
  };

  const attachFile = async (file: File) => {
    if (needsReview || busyRef.current) throw new ApiError(409, "conflict");
    busyRef.current = true;
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("inquiryId", inquiryId);
      await apiUpload("/api/attachments", form);
      if (!(await load(new AbortController().signal, true)))
        setFailure({
          error: new ApiError(0, "network"),
          operation: t.admin.requests.savedRefreshFailed,
        });
    } catch (err) {
      setFailure({ error: asApiError(err), operation: td.attachments });
      throw err;
    } finally {
      busyRef.current = false;
    }
  };
  if (loading && !detail) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Skeleton className="h-9 w-72 rounded-xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (notFound) {
    return (
      <EmptyState icon={MessageSquareText} title={ti.empty} className="py-20" />
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <p className="text-sm text-destructive">
          {error ?? t.auth.errors.generic}
        </p>
        <Button
          variant="outline"
          onClick={reload}
          className="min-h-11 rounded-full"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;
  const bubbleLabels = {
    client: t.admin.requests.client,
    staff: td.staff,
    system: td.system,
    internalHint: t.admin.requests.internalNoteHint,
    statuses: ti.statuses,
  };

  return (
    <div className="min-w-0 space-y-5">
      {failure ? (
        <ErrorFeedback
          error={failure.error}
          operation={failure.operation}
          locale={locale}
          onRefresh={async () => {
            if (await load(new AbortController().signal, true))
              setFailure(null);
          }}
        />
      ) : null}
      {/* ترويسة الطباعة — تظهر على الورق فقط: العلامة + التاريخ + الرقم المرجعي */}
      <div className="hidden print:block print:border-b print:border-border print:pb-2">
        <p className="text-xs font-medium text-muted-foreground">
          {siteMeta.siteName} · {new Date().toLocaleDateString(locale)} ·{" "}
          <span className="font-mono">{detail.refCode}</span>
        </p>
      </div>

      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="min-h-11 rounded-full print:hidden"
        >
          <Link href={`/${locale}/admin/inquiries`}>
            <BackIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">{ti.title}</span>
            {ti.title}
          </Link>
        </Button>
        <h1 className="font-mono text-xl font-bold text-navy ltr-isolate">
          {detail.refCode}
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge
            status={detail.status}
            label={
              detail.workflowStage?.[locale === "ar" ? "nameAr" : "nameEn"] ??
              ti.statuses[detail.status] ??
              detail.status
            }
            className="print:break-inside-avoid print:border-border"
          />
          <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-brand-strong print:break-inside-avoid print:border print:border-border">
            {ti.categories[detail.category] ?? detail.category}
          </span>
          {detail.archivedAt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground print:break-inside-avoid print:border print:border-border">
              <Archive className="size-3" aria-hidden="true" />
              {ti.archived}
            </span>
          ) : null}
        </div>
        {/* زر الطباعة — مخفي على الورق (ترويسة الطباعة الخاصة تظهر بدله) */}
        <Button
          variant="outline"
          onClick={() => window.print()}
          aria-label={ti.print}
          className="ms-auto min-h-11 rounded-full px-5 font-semibold focus-visible:ring-2 focus-visible:ring-ring/40 print:hidden"
        >
          <Printer className="size-4" aria-hidden="true" />
          {ti.print}
        </Button>
      </div>

      <h2 className="text-lg font-semibold break-words text-navy">
        {detail.subject}
      </h2>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] print:block print:space-y-6">
        {/* المحادثة */}
        <div className="min-w-0 space-y-4">
          <section
            aria-label={ti.conversation}
            className="rounded-2xl border border-border bg-white p-4 sm:p-6"
          >
            <h3 className="mb-3 text-sm font-semibold text-navy">
              {ti.conversation}
              <span className="ms-2 font-normal tabular-nums text-muted-foreground">
                {detail.messages.length} {t.admin.requests.messages}
              </span>
            </h3>
            {detail.messages.length === 0 ? (
              <EmptyState icon={MessageSquareText} title={td.noMessages} />
            ) : (
              <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto rounded-xl bg-muted/30 p-4 print:max-h-none print:overflow-visible print:bg-transparent">
                {detail.messages.map((message) => (
                  <div
                    key={message.id}
                    className="print:break-inside-avoid print:[&_div]:bg-transparent print:[&_div]:text-foreground print:[&_div]:shadow-none"
                  >
                    <MessageBubble
                      message={message}
                      locale={locale}
                      labels={bubbleLabels}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* الملحن — مخفي عند الطباعة */}
          <div className="print:hidden">
            <ReplyWorkflowHint
              scope="inquiries"
              locale={locale}
              workflow={detail.workflow}
            />
            <ReplyComposer
              canReply={mayReply}
              canNote={mayReply}
              sending={sending}
              onSend={sendMessage}
              onAttach={mayReply ? attachFile : undefined}
              savedReplies={
                mayReply
                  ? {
                      trigger: t.admin.savedReplies.useReply,
                      insert: t.admin.savedReplies.insert,
                      empty: t.admin.savedReplies.empty,
                    }
                  : undefined
              }
              labels={{
                attachFile: td.attachFile,
                reply: t.admin.requests.reply,
                internalNote: t.admin.requests.internalNote,
                internalHint: t.admin.requests.internalNoteHint,
                placeholder: td.replyPlaceholder,
                send: td.send,
                sending: td.sending,
              }}
            />
          </div>
        </div>

        {/* عمود الإدارة */}
        <aside className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-border bg-white p-4">
            <h3 className="text-sm font-semibold text-navy">
              {t.admin.requests.client}
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t.account.profile.name}
                </dt>
                <dd className="border-s-2 border-border/60 ps-3 font-medium text-navy">
                  {detail.client?.name ?? detail.name}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t.admin.settings.email}
                </dt>
                <dd className="min-w-0 truncate border-s-2 border-border/60 ps-3">
                  <a
                    href={`mailto:${detail.email}`}
                    className="break-all rounded-sm text-brand transition-colors hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ltr-isolate"
                  >
                    {detail.email}
                  </a>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t.admin.users.createdAt}
                </dt>
                <dd className="border-s-2 border-border/60 ps-3 font-medium tabular-nums text-navy">
                  {fmtDateTime(detail.createdAt, locale)}
                </dd>
              </div>
              {/* المعيّن — سطر طِباعي فقط (قائمة التعيين التفاعلية مخفية عند الطباعة) */}
              <div className="hidden print:flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t.admin.requests.filterAssignee}
                </dt>
                <dd className="border-s-2 border-border/60 ps-3 font-medium text-navy">
                  {detail.assignee?.name ?? t.admin.requests.unassigned}
                </dd>
              </div>
            </dl>
          </section>

          {/* الإدارة: تعيين/حالة — مخفية عند الطباعة (المعيّن يظهر في بطاقة العميل) */}
          <ConversationManagement
            scope="inquiries"
            locale={locale}
            me={me}
            detail={detail}
            patch={patch}
            onChanged={reload}
            disabled={busy || sending || needsReview}
          />
          <div className="print:hidden">
            <TrackPanel
              scope="inquiry"
              cardId={detail.id}
              locale={locale}
              t={t.admin.track}
            />
          </div>
          <ConversationAttachments
            attachments={detail.attachments ?? []}
            locale={locale}
          />
        </aside>
      </div>
    </div>
  );
}
