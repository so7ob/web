import { PageHeading, PanelHeader, PanelBody, InfoBoxContent, SmallBoxContent } from "@/components/ui/workspace";
/**
 * لوحة الإدارة الرئيسية: البيانات وتسميات الوقت تأتي من الخادم، مع الحفاظ
 * على العرض الأصلي دون استيراد قاعدة البيانات في المتصفح. كل الأرقام حقيقية.
 */
import Link from "@/routing/link";
import { useId } from "react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import {
  Users,
  Clock,
  Inbox,
  Hourglass,
  MessageSquareText,
  FileText,
  Timer,
  ArrowUpRight,
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
  tone: "primary" | "success" | "warning" | "danger" | "info";
  permitted: boolean;
  value: number;
  label: string;
  hint?: string;
  /** رابط عميق اختياري — البطاقة تصبح رابطًا إلى قائمة مفلترة */
  href?: string;
}

/** AdminLTE-inspired info boxes retain real metrics and existing deep links. */
const STAT_CARD_CLASS = "ds-info-box group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** تدرجات أشرطة الحالة — نفس عائلات ألوان شارات الحالة */
const STATUS_BAR: Record<string, string> = {
  new: "bg-primary",
  in_review: "bg-muted-foreground",
  awaiting_info: "bg-warning",
  in_progress: "bg-primary",
  responded: "bg-success",
  closed: "bg-muted-foreground",
  cancelled: "bg-danger",
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
  const chartId = useId();

  const byStatus = REQUEST_STATUSES.map((status) => ({
    status,
    count: statusGroups.find((g) => g.status === status)?._count ?? 0,
  }));
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.count));

  const stats: StatDef[] = [
    {
      tone: "success",
      icon: Users,
      permitted: access.users,
      value: totalUsers,
      label: t.totalUsers,
      hint: `${activeUsers} · ${t.activeUsers}`,
      href: `/${locale}/admin/users`,
    },
    {
      tone: "warning",
      icon: Clock,
      permitted: access.users,
      value: pendingUsers,
      label: t.pendingUsers,
      href: `/${locale}/admin/users?status=pending_verification`,
    },
    {
      tone: "primary",
      icon: Inbox,
      permitted: access.requests,
      value: openRequests,
      label: t.openRequests,
      hint: `${rangeTotal} · ${rangeDays === 7 ? t.last7days : rangeLabel}`,
      href: `/${locale}/admin/requests`,
    },
    {
      tone: "warning",
      icon: Hourglass,
      permitted: access.requests,
      value: awaitingInfo,
      label: t.awaitingInfo,
      href: `/${locale}/admin/requests?status=awaiting_info`,
    },
    {
      tone: "danger",
      icon: Timer,
      permitted: access.requests,
      value: overdueReplies,
      label: t.overdueReplies,
      hint: t.overdueHint,
      href: `/${locale}/admin/requests?overdue=1`,
    },
    {
      tone: "info",
      icon: MessageSquareText,
      permitted: access.inquiries,
      value: openInquiries,
      label: t.openInquiries,
      // «open» مرشّح مركّب في واجهة الاستفسارات: الحالات غير المغلقة وغير المؤرشفة —
      // يطابق هذا المؤشر تمامًا (أُضيف في تكامل الجولة 19)
      href: `/${locale}/admin/inquiries?status=open`,
    },
    {
      tone: "success",
      icon: FileText,
      permitted: access.pages,
      value: publishedPages,
      label: t.publishedPages,
      hint: `${draftPages} · ${t.draftPages}`,
      href: `/${locale}/admin/pages`,
    },
  ];

  const visibleStats = stats.filter(stat => stat.permitted);
  const primaryStats = [t.openRequests, t.totalUsers, t.pendingUsers, t.overdueReplies].flatMap(label => visibleStats.filter(stat => stat.label === label));
  const secondaryStats = visibleStats.filter(stat => !primaryStats.includes(stat));
  const points = chartBars.map((bar, index) => `${(index / Math.max(chartBars.length - 1, 1)) * 600},${200 - (bar.count / maxBar) * 180}`);
  const chartLine = points.length ? `M ${points.join(" L ")}` : "";
  const area = points.length ? `${chartLine} L 600,200 L 0,200 Z` : "";
  const details = locale === "ar" ? "تفاصيل" : "More info";

  return <div className="admin-dashboard space-y-6">
    <PageHeading title={t.title} />
    <section aria-label={t.title} className="grid grid-cols-2 gap-6 xl:grid-cols-4">
      {primaryStats.map(stat => <Link key={stat.label} href={stat.href!} aria-label={`${stat.label}: ${stat.value}`} className="ds-small-box" data-tone={stat.tone}>
        <SmallBoxContent icon={<stat.icon />} value={stat.value} label={stat.label} hint={stat.hint} footer={<>{details}<ArrowUpRight aria-hidden="true" className="size-4" /></>} />
      </Link>)}
    </section>
    {secondaryStats.length > 0 && <section aria-label={locale === "ar" ? "مؤشرات إضافية" : "Additional metrics"} className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {secondaryStats.map(stat => <Link key={stat.label} href={stat.href!} aria-label={`${stat.label}: ${stat.value}`} className={STAT_CARD_CLASS}>
        <InfoBoxContent icon={<stat.icon />} value={stat.value} label={stat.label} hint={stat.hint} tone={`ds-metric-${stat.tone}`} />
      </Link>)}
    </section>}
    {access.requests && <section className="ds-card overflow-hidden" aria-label={locale === "ar" ? "تقرير الطلبات" : "Request report"}>
      <PanelHeader><h2>{locale === "ar" ? "تقرير الطلبات" : "Request report"}</h2>
        <div role="group" aria-label={t.rangeLabel} className="flex flex-wrap print:hidden">
          {rangeOptions.map(option => <Link key={option.days} href={`/${locale}/admin?range=${option.days}`} scroll={false} aria-current={option.days === rangeDays ? "page" : undefined}
            className={cn("inline-flex min-h-11 items-center border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", option.days === rangeDays ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted")}>
            {option.label}
          </Link>)}
        </div>
      </PanelHeader>
      <div className="grid min-w-0 lg:grid-cols-3">
        <PanelBody className="min-w-0 lg:col-span-2">
          <figure aria-labelledby={chartId}>
            <figcaption id={chartId} className="mb-3 flex items-center justify-between gap-3"><span>{rangeLabel}</span><strong className="text-xl tabular-nums">{rangeTotal}</strong></figcaption>
            {rangeTotal === 0 ? <EmptyState icon={Inbox} title={t.noData} className="py-12" /> : <>
              <div className="ds-area-chart" dir="ltr">
                <div className="ds-chart-axis" aria-hidden="true">{[1, .75, .5, .25, 0].map(fraction => <span key={fraction}>{Math.round(maxBar * fraction)}</span>)}</div>
                <div className="ds-chart-plot">
                  <div className="ds-chart-grid" aria-hidden="true">{[0,1,2,3,4].map(index => <span key={index} />)}</div>
                  <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
                    <defs><linearGradient id={`${chartId}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity=".4" /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity=".03" /></linearGradient></defs>
                    <path d={area} fill={`url(#${chartId}-fill)`} />
                    <path d={chartLine} fill="none" stroke="var(--chart-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    {chartBars.map((bar,index) => <circle key={bar.key} cx={index / Math.max(chartBars.length - 1, 1) * 600} cy={200 - bar.count / maxBar * 180} r="3" fill="var(--chart-1)"><title>{bar.title}</title></circle>)}
                  </svg>
                  <div className="ds-chart-labels" aria-hidden="true">{chartBars.filter(bar => bar.label !== null).map(bar => <span key={bar.key}>{bar.label}</span>)}</div>
                </div>
              </div>
              <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{locale === "ar" ? "عرض بيانات الرسم" : "View chart data"}</summary>
                <Table><TableHeader><TableRow><TableHead>{locale === "ar" ? "الفترة" : "Period"}</TableHead><TableHead>{requestLabels.title}</TableHead></TableRow></TableHeader><TableBody>
                  {chartBars.map(bar => <TableRow key={bar.key}><TableCell>{bar.title}</TableCell><TableCell className="tabular-nums">{bar.count}</TableCell></TableRow>)}
                </TableBody></Table>
              </details>
            </>}
          </figure>
        </PanelBody>
        <PanelBody className="border-t lg:border-s lg:border-t-0">
          <h3 className="mb-3 font-semibold">{t.requestsByStatus}</h3>
          {byStatus.every(row => row.count === 0) ? <EmptyState icon={Inbox} title={t.noData} className="py-8" /> : <ul>
            {byStatus.map(row => <li key={row.status}><Link href={`/${locale}/admin/requests?status=${row.status}`} aria-label={`${requestLabels.statuses[row.status] ?? row.status}: ${row.count}`}
              className="block min-h-11 rounded-lg py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted">
              <span className="mb-1 flex justify-between gap-2 text-sm"><span>{requestLabels.statuses[row.status] ?? row.status}</span><strong className="tabular-nums">{row.count}</strong></span>
              <span className="block h-2.5 overflow-hidden bg-muted" aria-hidden="true"><span className={cn("block h-full", STATUS_BAR[row.status] ?? "bg-primary")} style={{ width: `${Math.round(row.count / maxStatus * 100)}%` }} /></span>
            </Link></li>)}
          </ul>}
        </PanelBody>
      </div>
    </section>}
    <div className="grid gap-6 print:block print:space-y-4 lg:grid-cols-2">
      {access.requests && <section className="ds-card min-w-0 overflow-hidden">
        <PanelHeader><h2>{t.recentRequests}</h2><Link href={`/${locale}/admin/requests`} className="inline-flex min-h-11 items-center gap-1 text-primary underline-offset-4 hover:underline">{t.viewAll}<ArrowUpRight className="size-4" aria-hidden="true" /></Link></PanelHeader>
        {recentRequests.length === 0 ? <EmptyState icon={Inbox} title={t.noData} /> : <Table>
          <TableHeader><TableRow><TableHead>{locale === "ar" ? "الطلب" : "Request"}</TableHead><TableHead>{locale === "ar" ? "الحالة" : "Status"}</TableHead><TableHead>{locale === "ar" ? "المتابعة" : "Follow-up"}</TableHead></TableRow></TableHeader>
          <TableBody>{recentRequests.map(request => <TableRow key={request.id}>
            <TableCell><Link href={`/${locale}/admin/requests/${request.id}`} className="inline-flex min-h-11 flex-col justify-center text-primary hover:underline"><span className="font-mono ltr-isolate">{request.refCode}</span><span className="text-sm text-foreground">{request.name}</span></Link><span className="block text-xs text-muted-foreground">{requestLabels.services[request.serviceType] ?? request.serviceType}</span></TableCell>
            <TableCell><StatusBadge status={request.status} label={requestLabels.statuses[request.status] ?? request.status} /></TableCell>
            <TableCell className="text-sm"><span className="block">{request.assignee?.name ?? requestLabels.none}</span><span className="text-xs text-muted-foreground">{data.presentation.requestDates[request.id]}</span></TableCell>
          </TableRow>)}</TableBody>
        </Table>}
      </section>}
      {access.audit && <section className="ds-card min-w-0 overflow-hidden">
        <PanelHeader><h2>{t.recentActivity}</h2><Link href={`/${locale}/admin/audit`} className="inline-flex min-h-11 items-center gap-1 text-primary underline-offset-4 hover:underline">{t.viewAll}<ArrowUpRight className="size-4" aria-hidden="true" /></Link></PanelHeader>
        {recentAudit.length === 0 ? <EmptyState icon={ScrollText} title={t.noData} /> : <ul className="divide-y divide-border">{recentAudit.map(log => <li key={log.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted">
          <ActionBadge action={log.action} /><span className="min-w-0 basis-full break-words text-sm sm:flex-1 sm:basis-0">{log.actor?.name ?? log.actorEmail ?? "—"}</span><span className="text-xs tabular-nums text-muted-foreground">{data.presentation.auditTimes[log.id]}</span>
        </li>)}</ul>}
      </section>}
    </div>
  </div>;
}
