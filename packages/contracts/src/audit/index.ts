export const AUDIT_OUTCOMES = [
  "success",
  "denied",
  "failure",
  "unknown",
] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
export type AuditValue =
  | { state: "missing" | "null" | "empty" | "redacted" | "unrecorded" }
  | {
      state: "value";
      value: string | number | boolean | string[];
      truncated?: boolean;
    };
export interface AuditChange {
  path: string;
  before: AuditValue;
  after: AuditValue;
}
export interface AuditEventV1 {
  id: string;
  schemaVersion: 0 | 1;
  occurredAt: string;
  recordedAt: string | null;
  actor: {
    id: string | null;
    type: "user" | "anonymous" | "worker" | "system" | "unknown";
    name: string | null;
    roleKey: string | null;
    email?: string | null;
  };
  resource: { type: string; id: string | null; reference: string | null };
  action: string;
  category: string;
  sensitive: boolean;
  outcome: AuditOutcome;
  reasonCode: string | null;
  changes: AuditChange[];
  changesTruncated?: boolean;
  safeFields: Record<string, AuditValue>;
  context: Record<string, unknown>;
  correlationId: string | null;
  errorId: string | null;
  batchId: string | null;
  source: string;
  historical: boolean;
  malformed: boolean;
  ipHash?: string | null;
  resourceUrl?: string;
  resourceState?: "present" | "deleted";
  diagnosticUrl?: string;
}
export interface AuditFilter {
  q?: string;
  from?: string;
  to?: string;
  actors?: string[];
  resourceType?: string;
  resourceId?: string;
  action?: string;
  category?: string;
  outcome?: AuditOutcome;
  source?: string;
  batchId?: string;
  correlationId?: string;
  hasChanges?: boolean;
  ids?: string[];
  includeAccess?: boolean;
  cursor?: string;
  limit?: number;
}
export interface AuditStats {
  events: number;
  sensitive: number;
  denied: number;
  failed: number;
  unknown: number;
  actors: number;
  resources: number;
  batches: number;
}
export interface AuditSearchResponse {
  ok: true;
  rows: AuditEventV1[];
  stats: AuditStats;
  nextCursor: string | null;
  measuredAt: string;
}
export interface AuditCatalogEntry {
  ar: string;
  en: string;
  category: string;
  sensitive: boolean;
  fields: readonly string[];
  context: readonly string[];
}
const entry = (
  ar: string,
  en: string,
  category: string,
  fields: readonly string[] = [],
  context: readonly string[] = [],
  sensitive = false,
): AuditCatalogEntry => ({ ar, en, category, fields, context, sensitive });
const conversationFields = [
  "status",
  "priority",
  "assigneeId",
  "archivedAt",
  "clientId",
  "serviceType",
  "description",
  "referenceUrl",
  "phone",
  "company",
  "budget",
  "currency",
  "timeline",
  "preferredContact",
];
const metadata = [
  "ref",
  "requestRef",
  "count",
  "bulk",
  "stage",
  "side",
  "kind",
  "authenticated",
  "via",
  "messageId",
  "attachmentId",
  "linkId",
  "queued",
  "emailStatus",
  "reason",
  "changed",
  "fields",
];
export const AUDIT_CATALOG: Record<string, AuditCatalogEntry> = {
  "request.submitted": entry(
    "أنشأ طلبًا",
    "Created request",
    "requests",
    conversationFields,
    metadata,
  ),
  "inquiry.submitted": entry(
    "أنشأ استفسارًا",
    "Created inquiry",
    "inquiries",
    conversationFields,
    metadata,
  ),
  "request.priority_changed": entry(
    "غيّر أولوية الطلب",
    "Changed request priority",
    "requests",
    ["priority"],
    metadata,
  ),
  "request.status_changed": entry(
    "غيّر حالة الطلب",
    "Changed request status",
    "requests",
    ["status"],
    metadata,
  ),
  "inquiry.status_changed": entry(
    "غيّر حالة الاستفسار",
    "Changed inquiry status",
    "inquiries",
    ["status"],
    metadata,
  ),
  "request.assigned": entry(
    "غيّر تعيين الطلب",
    "Changed request assignment",
    "requests",
    ["assigneeId"],
    metadata,
  ),
  "inquiry.assigned": entry(
    "غيّر تعيين الاستفسار",
    "Changed inquiry assignment",
    "inquiries",
    ["assigneeId"],
    metadata,
  ),
  "request.archived": entry(
    "أرشف الطلب",
    "Archived request",
    "requests",
    ["archivedAt"],
    metadata,
  ),
  "request.restored": entry(
    "استعاد الطلب",
    "Restored request",
    "requests",
    ["archivedAt"],
    metadata,
  ),
  "inquiry.archived": entry(
    "أرشف الاستفسار",
    "Archived inquiry",
    "inquiries",
    ["archivedAt"],
    metadata,
  ),
  "inquiry.restored": entry(
    "استعاد الاستفسار",
    "Restored inquiry",
    "inquiries",
    ["archivedAt"],
    metadata,
  ),
  "request.updated": entry(
    "عدّل الطلب",
    "Updated request",
    "requests",
    conversationFields,
    metadata,
  ),
  "request.cancelled": entry(
    "ألغى الطلب",
    "Cancelled request",
    "requests",
    ["status"],
    metadata,
  ),
  "request.replied": entry(
    "أضاف ردًا للطلب",
    "Replied to request",
    "requests",
    [],
    metadata,
  ),
  "inquiry.replied": entry(
    "أضاف ردًا للاستفسار",
    "Replied to inquiry",
    "inquiries",
    ["status"],
    metadata,
  ),
  "request.internal_note": entry(
    "أضاف ملاحظة داخلية",
    "Added internal note",
    "requests",
    [],
    metadata,
  ),
  "inquiry.internal_note": entry(
    "أضاف ملاحظة داخلية",
    "Added internal note",
    "inquiries",
    [],
    metadata,
  ),
  "request.claimed": entry(
    "نفّذ خطوة ربط الطلب",
    "Processed request claim",
    "requests",
    ["clientId"],
    metadata,
    true,
  ),
  "batch.completed": entry(
    "أكمل عملية جماعية",
    "Completed batch",
    "batch",
    [],
    ["count", "requested", "unchanged", "operation"],
  ),
};
const families: [string, string, string, string, string[]][] = [
  [
    "user",
    "المستخدم",
    "User",
    "identity",
    [
      "name",
      "roleKey",
      "status",
      "locale",
      "phone",
      "company",
      "password",
      "emailVerifiedAt",
    ],
  ],
  ["session", "الجلسة", "Session", "security", []],
  ["sessions", "الجلسات", "Sessions", "security", []],
  [
    "page",
    "الصفحة",
    "Page",
    "content",
    [
      "status",
      "slug",
      "visibility",
      "draftRevision",
      "publishedRevision",
      "scheduledPublishAt",
      "scheduledRevision",
      "titleAr",
      "titleEn",
    ],
  ],
  [
    "template",
    "القالب",
    "Template",
    "content",
    ["nameAr", "nameEn", "revision"],
  ],
  [
    "media",
    "الوسائط",
    "Media",
    "content",
    ["filename", "folder", "altText", "title", "size"],
  ],
  ["attachment", "المرفق", "Attachment", "files", []],
  ["track", "رابط المتابعة", "Tracking link", "security", ["exception"]],
  ["settings", "الإعدادات", "Settings", "configuration", []],
  ["menu", "القائمة", "Menu", "configuration", ["items"]],
  [
    "saved_reply",
    "الرد المحفوظ",
    "Saved reply",
    "configuration",
    ["name", "content"],
  ],
  ["diagnostics", "التشخيص", "Diagnostics", "diagnostics", ["state"]],
  ["audit", "التدقيق", "Audit", "audit", []],
];
const operations: Record<string, [string, string]> = {
  register: ["سجّل", "Registered"],
  login: ["دخل", "Signed in"],
  login_failed: ["فشلت محاولة الدخول", "Sign-in failed"],
  logout: ["خرج", "Signed out"],
  email_verified: ["تحقق من البريد", "Verified email"],
  password_reset: ["نفّذ خطوة استعادة كلمة المرور", "Processed password reset"],
  password_changed: ["غيّر كلمة المرور", "Changed password"],
  invite_accepted: ["قبل الدعوة", "Accepted invitation"],
  development_admin_created: [
    "أنشأ مديرًا محليًا",
    "Created development administrator",
  ],
  invited: ["أرسل دعوة", "Invited"],
  updated: ["عدّل", "Updated"],
  profile_updated: ["عدّل الملف", "Updated profile"],
  suspended: ["علّق", "Suspended"],
  reactivated: ["فعّل", "Reactivated"],
  role_changed: ["غيّر الدور", "Changed role"],
  revoked: ["أبطل", "Revoked"],
  revoked_all: ["أبطل الجلسات", "Revoked sessions"],
  created: ["أنشأ", "Created"],
  draft_saved: ["حفظ المسودة", "Saved draft"],
  published: ["نشر", "Published"],
  archived: ["أرشف", "Archived"],
  version_restored: ["استعاد إصدارًا", "Restored version"],
  draft_discarded: ["تخلص من المسودة", "Discarded draft"],
  schedule_set: ["جدول النشر", "Scheduled publication"],
  schedule_cancelled: ["ألغى الجدولة", "Cancelled schedule"],
  schedule_skipped: ["تجاوز النشر المجدول", "Skipped scheduled publication"],
  deleted: ["حذف", "Deleted"],
  applied: ["طبّق", "Applied"],
  uploaded: ["رفع", "Uploaded"],
  downloaded: ["وصل إلى الملف", "Accessed file"],
  delete_blocked: ["رُفض الحذف", "Deletion denied"],
  link_issued: ["أصدر الرابط", "Issued link"],
  link_renewed: ["جدّد الرابط", "Renewed link"],
  link_revoked: ["أبطل الرابط", "Revoked link"],
  policy_changed: ["غيّر السياسة", "Changed policy"],
  guest_reply: ["أضاف ردًا بالرابط", "Replied through link"],
  attachment_downloaded: ["وصل إلى المرفق", "Accessed attachment"],
  classified: ["صنّف المتابعة", "Classified review"],
  opened: ["فتح السجل", "Opened audit log"],
  detail_viewed: ["فتح الحدث", "Opened event"],
  report_requested: ["طلب تقريرًا", "Requested report"],
  report_completed: ["جهّز التقرير", "Prepared report"],
  report_failed: ["فشل تجهيز التقرير", "Report preparation failed"],
  report_cancelled: ["ألغى التقرير", "Cancelled report"],
  report_downloaded: ["وصل إلى التقرير", "Accessed report"],
  review_changed: ["حدّث المراجعة", "Updated review"],
  case_changed: ["حدّث القضية", "Updated case"],
  rule_changed: ["عدّل القاعدة", "Changed rule"],
  hold_changed: ["غيّر منع الحذف", "Changed retention hold"],
  retention_completed: [
    "نفّذ صيانة الاحتفاظ",
    "Completed retention maintenance",
  ],
  health_probe: ["فحص الكاتب", "Probed audit writer"],
};
const familyActions: Record<string, string[]> = {
  user: [
    "register",
    "login",
    "login_failed",
    "logout",
    "email_verified",
    "password_reset",
    "password_changed",
    "invite_accepted",
    "development_admin_created",
    "invited",
    "updated",
    "profile_updated",
    "suspended",
    "reactivated",
    "role_changed",
  ],
  session: ["revoked"],
  sessions: ["revoked_all"],
  page: [
    "created",
    "draft_saved",
    "published",
    "archived",
    "version_restored",
    "draft_discarded",
    "schedule_set",
    "schedule_cancelled",
    "schedule_skipped",
  ],
  template: ["created", "updated", "deleted", "applied"],
  media: ["uploaded", "updated", "deleted", "delete_blocked"],
  attachment: ["uploaded", "downloaded"],
  track: [
    "link_issued",
    "link_renewed",
    "link_revoked",
    "policy_changed",
    "guest_reply",
    "attachment_downloaded",
  ],
  settings: ["updated"],
  menu: ["updated"],
  saved_reply: ["created", "updated", "deleted"],
  diagnostics: ["classified"],
  audit: [
    "opened",
    "detail_viewed",
    "report_requested",
    "report_completed",
    "report_failed",
    "report_cancelled",
    "report_downloaded",
    "review_changed",
    "case_changed",
    "rule_changed",
    "policy_changed",
    "hold_changed",
    "retention_completed",
    "health_probe",
  ],
};
for (const [family, ar, en, category, fields] of families)
  for (const operation of familyActions[family]) {
    const [verbAr, verbEn] = operations[operation];
    AUDIT_CATALOG[`${family}.${operation}`] = entry(
      `${verbAr} — ${ar}`,
      `${verbEn} — ${en}`,
      category,
      fields,
      [
        ...metadata,
        "roleKey",
        "fromRole",
        "toRole",
        "revision",
        "version",
        "versions",
        "slug",
        "locales",
        "publishAt",
        "scheduledRevision",
        "draftRevision",
        "cancelledAtRevision",
        "revertedFromRevision",
        "backupCreated",
        "pageId",
        "templateKey",
        "templateNameAr",
        "nameAr",
        "nameEn",
        "filename",
        "size",
        "folder",
        "usageCount",
        "requestId",
        "keys",
        "responseHours",
        "appliesToExisting",
        "effectiveAt",
        "state",
        "reportId",
        "resourceCount",
        "format",
        "scope",
        "caseId",
        "ruleId",
        "policyVersion",
        "held",
        "environment",
      ],
      [
        "role_changed",
        "suspended",
        "reactivated",
        "password_changed",
        "password_reset",
        "revoked",
        "revoked_all",
        "report_requested",
        "report_downloaded",
        "rule_changed",
        "policy_changed",
        "hold_changed",
      ].includes(operation),
    );
  }
for (const kind of ["requests", "inquiries"])
  AUDIT_CATALOG[`${kind}.exported`] = entry(
    "صدّر موارد",
    "Exported resources",
    "export",
    [],
    ["count", "resourceCount"],
    true,
  );
AUDIT_CATALOG["security.operation_denied"] = entry(
  "رُفضت العملية",
  "Operation denied",
  "security",
  [],
  ["operation", "status"],
  true,
);
AUDIT_CATALOG["security.operation_failed"] = entry(
  "فشلت العملية",
  "Operation failed",
  "security",
  [],
  ["operation", "status"],
  true,
);
export function auditLabel(code: string, locale: "ar" | "en") {
  return Object.hasOwn(AUDIT_CATALOG, code)
    ? AUDIT_CATALOG[code][locale]
    : locale === "ar"
      ? "حدث تاريخي غير مصنف"
      : "Unclassified historical event";
}

AUDIT_CATALOG["audit.rule_changed"].fields = [
  "enabled",
  "thresholdValue",
  "windowSeconds",
  "cooldownSeconds",
  "severity",
  "scope",
  "revision",
  "rationale",
];
AUDIT_CATALOG["audit.policy_changed"].fields = ["retentionDays", "revision"];

AUDIT_CATALOG["audit.retention_completed"].context = [
  ...AUDIT_CATALOG["audit.retention_completed"].context,
  "maintenanceUser",
];
