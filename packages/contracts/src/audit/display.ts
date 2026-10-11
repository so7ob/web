import type { AuditValue } from "./index.js";
const labels = {
  ar: {
    truncated: "عرض مختصر",
    missing: "غائب",
    null: "قيمة null",
    empty: "فارغ",
    redacted: "محجوب",
    unrecorded: "غير مسجل",
    true: "نعم",
    false: "لا",
    priority: "الأولوية",
    status: "الحالة",
    assigneeId: "المسؤول",
    archivedAt: "وقت الأرشفة",
    roleKey: "الدور",
    normal: "متوسطة",
    high: "مرتفعة",
    low: "منخفضة",
    urgent: "عاجلة",
    new: "جديد",
    in_review: "قيد المراجعة",
    in_progress: "قيد التنفيذ",
    awaiting_info: "بانتظار معلومات",
    responded: "تم الرد",
    closed: "مغلق",
    cancelled: "ملغى",
    success: "نجاح",
    denied: "رفض",
    failure: "فشل",
    unknown: "غير معروف",
    draftRevision: "إصدار المسودة",
    publishedRevision: "الإصدار المنشور",
    scheduledPublishAt: "موعد النشر",
    scheduledRevision: "الإصدار المجدول",
    name: "الاسم",
    nameAr: "الاسم العربي",
    nameEn: "الاسم الإنجليزي",
    slug: "مسار الصفحة",
    titleAr: "العنوان العربي",
    titleEn: "العنوان الإنجليزي",
    visibility: "الظهور",
    public: "عام",
    authenticated: "للمسجلين",
    staff: "للموظفين",
    draft: "مسودة",
    published: "منشور",
    archived: "مؤرشف",
    active: "نشط",
    suspended: "معلق",
    enabled: "مفعلة",
    retentionDays: "أيام الاحتفاظ",
  },
  en: {
    truncated: "Abbreviated preview",
    missing: "Missing",
    null: "Null",
    empty: "Empty",
    redacted: "Redacted",
    unrecorded: "Not recorded",
    true: "Yes",
    false: "No",
    priority: "Priority",
    status: "Status",
    assigneeId: "Assignee",
    archivedAt: "Archived at",
    roleKey: "Role",
    normal: "Normal",
    high: "High",
    low: "Low",
    urgent: "Urgent",
    new: "New",
    in_review: "In review",
    in_progress: "In progress",
    awaiting_info: "Awaiting information",
    responded: "Responded",
    closed: "Closed",
    cancelled: "Cancelled",
    success: "Success",
    denied: "Denied",
    failure: "Failure",
    unknown: "Unknown",
    draftRevision: "Draft revision",
    publishedRevision: "Published revision",
    scheduledPublishAt: "Scheduled publication",
    scheduledRevision: "Scheduled revision",
    name: "Name",
    nameAr: "Arabic name",
    nameEn: "English name",
    slug: "Page path",
    titleAr: "Arabic title",
    titleEn: "English title",
    visibility: "Visibility",
    public: "Public",
    authenticated: "Signed-in users",
    staff: "Staff",
    draft: "Draft",
    published: "Published",
    archived: "Archived",
    active: "Active",
    suspended: "Suspended",
    enabled: "Enabled",
    retentionDays: "Retention days",
  },
} as const;
export function auditTerm(value: string, locale: "ar" | "en") {
  const table = labels[locale];
  return Object.hasOwn(table, value)
    ? table[value as keyof typeof table]
    : value;
}
export function auditDisplayValue(value: AuditValue, locale: "ar" | "en") {
  return (
    (value.state === "value"
      ? Array.isArray(value.value)
        ? value.value
            .map((v) => auditTerm(v, locale))
            .join(locale === "ar" ? "، " : ", ")
        : auditTerm(String(value.value), locale)
      : auditTerm(value.state, locale)) +
    (value.state === "value" && value.truncated
      ? " · " + auditTerm("truncated", locale)
      : "")
  );
}
