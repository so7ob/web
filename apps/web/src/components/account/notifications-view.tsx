"use client";
import {ErrorFeedback} from "@/components/errors/error-feedback";
import {ApiError} from "@/lib/errors/transport";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/routing/navigation";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText,
  Info,
  Loader2,
  MessageSquare,
  MessageCircleQuestion,
  User,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import type { PortalContent } from "@/content/portal/types";
import { apiFetch } from "./api";
import { formatRelative } from "./format";
import type { AccountNotification, NotificationsResponse } from "./types";

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; chip: string }> = {
  new_request: { icon: FilePlus2, chip: "bg-skydrop/20 text-brand-strong" },
  new_inquiry: { icon: MessageCircleQuestion, chip: "bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200" },
  request_assigned: { icon: UserCheck, chip: "bg-inverse/10 text-navy" },
  reply_received: { icon: MessageSquare, chip: "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200" },
  info_requested: { icon: Info, chip: "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200" },
  status_changed: { icon: Bell, chip: "bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-200" },
  content_published: { icon: FileText, chip: "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200" },
  account: { icon: User, chip: "bg-inverse/10 text-navy" },
};

/** إشعارات العميل: تُقرأ بالنقر وتنتقل لرابطها، مع تعليم الكل وتحميل المزيد */
export function NotificationsView({
  locale,
  t,
  authErrors,
  statuses,
}: {
  locale: Locale;
  t: PortalContent["account"]["notifications"];
  authErrors: PortalContent["auth"]["errors"];
  statuses: Record<string, string>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AccountNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [failure,setFailure]=useState<ApiError|null>(null);
  const [marking,setMarking]=useState(false);
  const pending=useRef(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (targetPage: number, append: boolean) => {
    setLoading(true);
    setFailed(false);
    const result = await apiFetch<NotificationsResponse>(`/api/account/notifications?page=${targetPage}`);
    setLoading(false);
    if (result.data.ok) {
      setFailure(null);
      setItems((prev) => (append ? [...prev, ...(result.data.notifications ?? [])] : result.data.notifications ?? []));
      setUnread(result.data.unread ?? 0);
      setTotal(result.data.total ?? 0);
    } else {
      setFailed(true);
      if(!result.cancelled)setFailure(result.error??new ApiError(result.status,"internal_error"));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load(1, false);
    })();
  }, [load]);

  const hasMore = items.length < total;

  async function markRead(notification: AccountNotification) {
    if(pending.current||failure?.uncertain)return;
    pending.current=true;setMarking(true);setFailure(null);
    try {
      if (!notification.readAt) {
        const result = await apiFetch("/api/account/notifications", {method:"POST",body:JSON.stringify({id:notification.id})});
        if (!result.ok || !result.data.ok) {
          if(!result.cancelled)setFailure(result.error??new ApiError(result.status,"internal_error"));
          return;
        }
        setItems(prev=>prev.map(n=>n.id===notification.id?{...n,readAt:new Date().toISOString()}:n));
        setUnread(u=>Math.max(0,u-1));
      }
      if(notification.link)router.push(notification.link);
    } finally {pending.current=false;setMarking(false);}
  }

  async function markAllRead() {
    if(pending.current||failure?.uncertain)return;
    pending.current=true;setMarkingAll(true);setFailure(null);
    try {
      const result=await apiFetch("/api/account/notifications",{method:"POST",body:JSON.stringify({all:true})});
      if(result.ok&&result.data.ok){const now=new Date().toISOString();setItems(prev=>prev.map(n=>({...n,readAt:n.readAt??now})));setUnread(0);}
      else if(!result.cancelled)setFailure(result.error??new ApiError(result.status,"internal_error"));
    } finally {pending.current=false;setMarkingAll(false);}
  }

  const chevron =
    locale === "ar" ? (
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
    ) : (
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">{t.title}</h1>
          {unread > 0 && (
            <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-brand-strong">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            </p>
          )}
        </div>
        {unread > 0 && (
          <Button
            variant="outline"
            className="h-11 rounded-full px-5 font-semibold"
            onClick={markAllRead}
            disabled={markingAll||marking||!!failure?.uncertain}
          >
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
            {t.markAllRead}
          </Button>
        )}
      </header>

      <ErrorFeedback error={failure} locale={locale} operation={t.title} onRefresh={async()=>{setPage(1);await load(1,false);}}/>
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        {loading && items.length === 0 ? (
          <div className="space-y-3" role="status" aria-busy="true" aria-label={t.title}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="animate-shimmer h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="animate-shimmer h-4 w-40" />
                  <Skeleton className="animate-shimmer h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : failed ? null : items.length === 0 ? (
          <div className="py-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bell className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t.empty}</p>
          </div>
        ) : (
          <ul className="max-h-[34rem] divide-y divide-border/60 overflow-y-auto">
            {items.map((notification) => {
              const unreadRow = !notification.readAt;
              const meta = TYPE_META[notification.type] ?? { icon: Bell, chip: "bg-muted text-muted-foreground" };
              const Icon = meta.icon;
              const typeLabel = t.types[notification.type] ?? notification.type;
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    disabled={markingAll||marking||!!failure?.uncertain}
                    onClick={() => void markRead(notification)}
                    aria-label={typeLabel}
                    className={cn(
                      "flex w-full items-start gap-4 rounded-xl border-s-2 border-s-transparent p-4 text-start transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
                      unreadRow && "border-s-brand bg-accent/40"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                        meta.chip
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-navy">{typeLabel}</span>
                        {unreadRow && <span className="inline-flex size-2 rounded-full bg-brand" aria-hidden="true" />}
                        {notification.payload.ref && (
                          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-bold text-muted-foreground" dir="ltr">
                            {notification.payload.ref}
                          </span>
                        )}
                        {notification.payload.status && statuses[notification.payload.status] && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {statuses[notification.payload.status]}
                          </span>
                        )}
                        {notification.payload.name && (
                          <span className="text-xs text-muted-foreground">{notification.payload.name}</span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatRelative(notification.createdAt, locale)}
                        {!notification.readAt && (
                          <span className="ms-2 font-semibold text-brand-strong">
                            {t.markRead}
                            {notification.link ? " ↗" : ""}
                          </span>
                        )}
                      </span>
                    </span>
                    {notification.link && <span className="mt-2 shrink-0 text-muted-foreground">{chevron}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && !loading && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              className="h-11 rounded-full px-6 font-semibold tabular-nums"
              onClick={() => {
                const next = page + 1;
                setPage(next);
                void load(next, true);
              }}
            >
              {items.length} / {total}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
