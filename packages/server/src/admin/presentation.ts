import { format, formatDistance } from "date-fns";
import { ar } from "date-fns/locale";
import type {
  AdminDashboardData,
  AdminDashboardPresentation,
} from "@so7ob/contracts";
/** Preserve the original server-formatted labels; browser time/timezone must not alter SSR text. */
export function formatAdminDashboard(
  data: AdminDashboardData,
  locale: "ar" | "en",
  now = new Date(),
): AdminDashboardPresentation {
  const { rangeDays } = data;
  const rangeRows = data.rangeRows.map((r) => ({
    createdAt: new Date(r.createdAt),
  }));
  const options = { locale: locale === "ar" ? ar : undefined };
  const fmtDate = (value: string, _locale: "ar" | "en", pattern = "PP") =>
    format(new Date(value), pattern, options);
  const fmtDayLabel = (value: string, _locale: "ar" | "en") =>
    format(new Date(`${value}T00:00:00`), "EEEEEE", options);
  type ChartBar = AdminDashboardPresentation["chartBars"][number];
  // سلسلة المدى المختار للرسم العمودي: أيام (7/30) أو أسابيع (90)
  const chartBars: ChartBar[] = [];
  if (rangeDays === 90) {
    // 13 مجموعة أسبوعية تبدأ قبل 89 يومًا — آخرها يغطي الأيام الجارية
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    for (let week = 0; week < 13; week++) {
      const start = new Date(today);
      start.setDate(today.getDate() - 89 + week * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const lastDay = new Date(end);
      lastDay.setDate(end.getDate() - 1);
      const startIso = start.toISOString();
      chartBars.push({
        key: `w${week}-${startIso.slice(0, 10)}`,
        count: rangeRows.filter(
          (r) => r.createdAt >= start && r.createdAt < end,
        ).length,
        label: fmtDate(startIso, locale, "d/M"),
        title: `${fmtDate(startIso, locale)} – ${fmtDate(lastDay.toISOString(), locale)}`,
      });
    }
  } else {
    for (let i = rangeDays - 1; i >= 0; i--) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const dayIso = day.toISOString();
      // في مدى 30 يومًا: رقم اليوم كل 5 أعمدة وفي العمود الأخير فقط
      const index = rangeDays - 1 - i;
      const dailyLabel =
        rangeDays === 7
          ? fmtDayLabel(dayIso.slice(0, 10), locale)
          : index % 5 === 0 || index === rangeDays - 1
            ? fmtDate(dayIso, locale, "d")
            : null;
      chartBars.push({
        key: dayIso.slice(0, 10),
        count: rangeRows.filter((r) => r.createdAt >= day && r.createdAt < next)
          .length,
        label: dailyLabel,
        title: fmtDate(dayIso, locale),
      });
    }
  }
  return {
    chartBars,
    requestDates: Object.fromEntries(
      data.recentRequests.map((r) => [r.id, fmtDate(r.createdAt, locale)]),
    ),
    auditTimes: Object.fromEntries(
      data.recentAudit.map((r) => [
        r.id,
        formatDistance(new Date(r.createdAt), now, {
          ...options,
          addSuffix: true,
        }),
      ]),
    ),
  };
}
