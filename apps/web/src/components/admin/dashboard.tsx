/**
 * لوحة الإدارة الرئيسية: البيانات وتسميات الوقت تأتي من الخادم، مع الحفاظ
 * على العرض الأصلي دون استيراد قاعدة البيانات في المتصفح. كل الأرقام حقيقية.
 */
import Link from "@/routing/link";
import {
  Users,
  Clock,
  Inbox,
  Hourglass,
  MessageSquareText,
  FileText,
  Timer,
  ArrowUpRight,
  LayoutDashboard,
  ChartBar,
  CalendarDays,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { REQUEST_STATUSES } from "@so7ob/contracts";
import { getPortalContent } from "@/content/portal";
import { type Locale } from "@/lib/i18n";
import { StatusBadge, ActionBadge } from "@/components/admin/badges";
import { EmptyState } from "@/components/admin/empty-state";
import { cn } from "@/lib/utils";

import type { AdminDashboardView } from "@so7ob/contracts";
interface StatDef {
  icon: LucideIcon;
  permitted: boolean;
  value: number;
  label: string;
  hint?: string;
  /** رابط عميق اختياري — البطاقة تصبح رابطًا إلى قائمة مفلترة */
  href?: string;
  /** تلوين بصري فقط: شريحة الأيقونة + شريط التمييز العلوي */
  chip: string;
  bar: string;
}

/** فئات بطاقات المؤشرات — البطاقة نفسها بلا تغيير بصري، والرابط يضيف حلقة تركيز فقط */
const STAT_CARD_CLASS =
  "relative overflow-hidden rounded-2xl border border-border bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-navy/10";

/** تدرجات أشرطة الحالة — نفس عائلات ألوان شارات الحالة */
const STATUS_BAR: Record<string, string> = {
  new: "bg-gradient-to-r from-skydrop to-brand",
  in_review: "bg-gradient-to-r from-slate-400 to-slate-500",
  awaiting_info: "bg-gradient-to-r from-amber-300 to-amber-500",
  in_progress: "bg-gradient-to-r from-brand to-brand-strong",
  responded: "bg-gradient-to-r from-emerald-400 to-emerald-500",
  closed: "bg-gradient-to-r from-slate-300 to-slate-400",
  cancelled: "bg-gradient-to-r from-rose-300 to-rose-500",
};

export function AdminDashboard({
  data,
  locale,
}: {
  data: AdminDashboardView;
  locale: Locale;
}) {
  const {
    access,
    rangeDays,
    totalUsers,
    activeUsers,
    pendingUsers,
    openRequests,
    awaitingInfo,
    openInquiries,
    publishedPages,
    draftPages,
    statusGroups,
    overdueReplies,
  } = data;
  const recentRequests = data.recentRequests;
  const recentAudit = data.recentAudit;
  const t = getPortalContent(locale).admin.dashboard;
  const requestLabels = getPortalContent(locale).admin.requests;
  const rangeLabel =
    rangeDays === 7 ? t.range7 : rangeDays === 30 ? t.range30 : t.range90;
  const rangeOptions = [
    { days: 7, label: t.range7 },
    { days: 30, label: t.range30 },
    { days: 90, label: t.range90 },
  ];
  const chartBars = data.presentation.chartBars;
  const rangeTotal = chartBars.reduce((sum, bar) => sum + bar.count, 0);
  const maxBar = Math.max(1, ...chartBars.map((bar) => bar.count));

  const byStatus = REQUEST_STATUSES.map((status) => ({
    status,
    count: statusGroups.find((g) => g.status === status)?._count ?? 0,
  }));
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.count));

  const stats: StatDef[] = [
    {
      icon: Users,
      permitted: access.users,
      value: totalUsers,
      label: t.totalUsers,
      hint: `${activeUsers} · ${t.activeUsers}`,
      href: `/${locale}/admin/users`,
      chip: "bg-accent text-brand-strong",
      bar: "bg-gradient-to-r from-brand to-skydrop",
    },
    {
      icon: Clock,
      permitted: access.users,
      value: pendingUsers,
      label: t.pendingUsers,
      href: `/${locale}/admin/users?status=pending_verification`,
      chip: "bg-purple-100 text-purple-800",
      bar: "bg-gradient-to-r from-purple-400 to-purple-500",
    },
    {
      icon: Inbox,
      permitted: access.requests,
      value: openRequests,
      label: t.openRequests,
      hint: `${rangeTotal} · ${rangeDays === 7 ? t.last7days : rangeLabel}`,
      href: `/${locale}/admin/requests`,
      chip: "bg-skydrop/20 text-brand-strong",
      bar: "bg-gradient-to-r from-navy to-skydrop",
    },
    {
      icon: Hourglass,
      permitted: access.requests,
      value: awaitingInfo,
      label: t.awaitingInfo,
      href: `/${locale}/admin/requests?status=awaiting_info`,
      chip: "bg-amber-100 text-amber-800",
      bar: "bg-gradient-to-r from-amber-400 to-amber-300",
    },
    {
      icon: Timer,
      permitted: access.requests,
      value: overdueReplies,
      label: t.overdueReplies,
      hint: t.overdueHint,
      href: `/${locale}/admin/requests?overdue=1`,
      chip: "bg-rose-100 text-rose-800",
      bar: "bg-gradient-to-r from-rose-300 to-rose-500",
    },
    {
      icon: MessageSquareText,
      permitted: access.inquiries,
      value: openInquiries,
      label: t.openInquiries,
      // «open» مرشّح مركّب في واجهة الاستفسارات: الحالات غير المغلقة وغير المؤرشفة —
      // يطابق هذا المؤشر تمامًا (أُضيف في تكامل الجولة 19)
      href: `/${locale}/admin/inquiries?status=open`,
      chip: "bg-emerald-100 text-emerald-800",
      bar: "bg-gradient-to-r from-emerald-400 to-emerald-300",
    },
    {
      icon: FileText,
      permitted: access.pages,
      value: publishedPages,
      label: t.publishedPages,
      hint: `${draftPages} · ${t.draftPages}`,
      chip: "bg-brand-soft text-brand-strong",
      bar: "bg-gradient-to-r from-brand-strong to-brand",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-brand-strong">
            <LayoutDashboard className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-bold text-navy">{t.title}</h1>
        </div>
        {/* مبدّل المدى الزمني — تنقل خادمي يعيد رسم اللوحة والمخطط
            (حبوب بحدود بلغة مرشّحات القوائم — تُخفى عند الطباعة) */}
        {access.requests && (
          <div
            role="group"
            aria-label={t.rangeLabel}
            className="flex flex-wrap items-center gap-2 print:hidden"
          >
            {rangeOptions.map((option) => {
              const active = option.days === rangeDays;
              return (
                <Link
                  key={option.days}
                  href={`/${locale}/admin?range=${option.days}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    active
                      ? "border-brand bg-accent text-brand-strong"
                      : "border-border bg-white text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* بطاقات المؤشرات — 7 بطاقات: صف 4+3 على الشاشات الواسعة؛
          ذات الرابط تفتح القائمة المفلترة المقابلة (روابط اللوحة العميقة) */}
      <section
        aria-label={t.title}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
      >
        {stats
          .filter((stat) => stat.permitted)
          .map((stat) => {
            const card = (
              <>
                <span
                  aria-hidden="true"
                  className={cn("absolute inset-x-0 top-0 h-1", stat.bar)}
                />
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl",
                      stat.chip,
                    )}
                  >
                    <stat.icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <p className="text-2xl font-bold tabular-nums text-navy">
                    {stat.value}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  {stat.label}
                </p>
                {stat.hint ? (
                  <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {stat.hint}
                  </p>
                ) : null}
              </>
            );
            return stat.href ? (
              <Link
                key={stat.label}
                href={stat.href}
                aria-label={`${stat.label}: ${stat.value}`}
                className={cn(
                  STAT_CARD_CLASS,
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                )}
              >
                {card}
              </Link>
            ) : (
              <div key={stat.label} className={STAT_CARD_CLASS}>
                {card}
              </div>
            );
          })}
      </section>

      {access.requests && (
        <div className="grid gap-4 print:block print:space-y-4 lg:grid-cols-2">
          {/* الطلبات حسب الحالة — أشرطة أفقية */}
          <section className="rounded-2xl border border-border bg-white p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-brand-strong">
                <ChartBar className="size-4" aria-hidden="true" />
              </span>
              <h2 className="text-sm font-semibold text-navy">
                {t.requestsByStatus}
              </h2>
            </div>
            {byStatus.every((s) => s.count === 0) ? (
              <EmptyState icon={Inbox} title={t.noData} className="py-8" />
            ) : (
              <ul className="mt-4 space-y-1">
                {byStatus.map((row) => (
                  <li key={row.status}>
                    <Link
                      href={`/${locale}/admin/requests?status=${row.status}`}
                      aria-label={`${requestLabels.statuses[row.status] ?? row.status}: ${row.count}`}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <p className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                        {requestLabels.statuses[row.status] ?? row.status}
                      </p>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          title={`${requestLabels.statuses[row.status] ?? row.status}: ${row.count}`}
                          className={cn(
                            "animate-shimmer h-full rounded-full transition-all duration-300",
                            STATUS_BAR[row.status] ??
                              "bg-gradient-to-r from-brand to-brand-strong",
                          )}
                          style={{
                            width: `${Math.max(row.count > 0 ? 4 : 0, Math.round((row.count / maxStatus) * 100))}%`,
                          }}
                        />
                      </div>
                      <span className="inline-flex min-w-8 shrink-0 items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-navy">
                        {row.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* المدى المختار — أعمدة مصغرة (أيام لـ 7/30، أسابيع لـ 90) — تُخفى عند الطباعة */}
          <section className="rounded-2xl border border-border bg-white p-5 print:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-brand-strong">
                <CalendarDays className="size-4" aria-hidden="true" />
              </span>
              <h2 className="text-sm font-semibold text-navy">{rangeLabel}</h2>
            </div>
            {rangeTotal === 0 ? (
              <EmptyState icon={Inbox} title={t.noData} className="py-8" />
            ) : (
              <div
                className={cn(
                  "mt-4 flex h-28 items-end",
                  rangeDays === 30 ? "gap-1" : "gap-2 sm:gap-3",
                )}
              >
                {chartBars.map((bar) => (
                  <div
                    key={bar.key}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                  >
                    <p
                      className="text-[10px] font-semibold tabular-nums text-muted-foreground"
                      title={bar.title}
                    >
                      {bar.count > 0 ? bar.count : ""}
                    </p>
                    <div
                      title={bar.title}
                      className={cn(
                        "rounded-full transition-all duration-300 hover:brightness-125",
                        rangeDays === 30 ? "w-full" : "w-full max-w-10",
                        bar.count === 0
                          ? "bg-muted hover:brightness-100"
                          : "bg-gradient-to-t from-brand to-skydrop",
                      )}
                      style={{
                        height: `${Math.max(4, Math.round((bar.count / maxBar) * 64))}px`,
                      }}
                    />
                    {bar.label !== null ? (
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        {bar.label}
                      </p>
                    ) : (
                      <p
                        aria-hidden="true"
                        className="text-[10px] text-muted-foreground"
                      >
                        &nbsp;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="grid gap-4 print:block print:space-y-4 lg:grid-cols-2">
        {/* أحدث الطلبات */}
        {access.requests && (
          <section className="rounded-2xl border border-border bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-brand-strong">
                  <Inbox className="size-4" aria-hidden="true" />
                </span>
                <h2 className="text-sm font-semibold text-navy">
                  {t.recentRequests}
                </h2>
              </div>
              <Link
                href={`/${locale}/admin/requests`}
                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-brand transition-colors hover:bg-accent hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {t.viewAll}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            {recentRequests.length === 0 ? (
              <EmptyState icon={Inbox} title={t.noData} />
            ) : (
              <ul className="divide-y divide-border">
                {recentRequests.map((r) => (
                  <li
                    key={r.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <Link
                      href={`/${locale}/admin/requests/${r.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3"
                    >
                      <p className="font-mono text-sm font-bold text-navy ltr-isolate">
                        {r.refCode}
                      </p>
                      <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {r.name}
                      </p>
                      <StatusBadge
                        status={r.status}
                        label={requestLabels.statuses[r.status] ?? r.status}
                      />
                      <p className="w-full text-xs tabular-nums text-muted-foreground sm:w-auto">
                        {requestLabels.services[r.serviceType] ?? r.serviceType}
                        {" · "}
                        {r.assignee?.name ?? requestLabels.none}
                        {" · "}
                        {data.presentation.requestDates[r.id]}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* أحدث الأحداث (سجل التدقيق) */}
        {access.audit && (
          <section className="rounded-2xl border border-border bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-brand-strong">
                  <ScrollText className="size-4" aria-hidden="true" />
                </span>
                <h2 className="text-sm font-semibold text-navy">
                  {t.recentActivity}
                </h2>
              </div>
              <Link
                href={`/${locale}/admin/audit`}
                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-brand transition-colors hover:bg-accent hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {t.viewAll}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            {recentAudit.length === 0 ? (
              <EmptyState icon={Inbox} title={t.noData} />
            ) : (
              <ul className="divide-y divide-border">
                {recentAudit.map((log) => (
                  <li
                    key={log.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-muted/50"
                  >
                    <ActionBadge action={log.action} />
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {log.actor?.name ?? log.actorEmail ?? "—"}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {data.presentation.auditTimes[log.id]}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
