import { PERMISSIONS, type Permission } from "./permissions.js";
const english: Record<Permission, string> = {
  "workflows.view": "View workflows",
  "workflows.manage": "Edit workflows and business calendars",
  "workflows.publish": "Publish workflow versions",
  "workflows.transfer": "Transfer conversations between workflows",
  "workflows.supervise": "Supervise restricted conversations",
  "teams.manage": "Manage work teams",
  "admin.dashboard": "View administration dashboard",
  "users.view": "View users",
  "users.create": "Invite users",
  "users.update": "Edit user profiles",
  "users.suspend": "Suspend and reactivate accounts",
  "users.roles": "Assign user roles",
  "users.provision": "Create accounts directly",
  "users.credentials.reset": "Request password setup",
  "users.credentials.temporary": "Issue temporary credentials",
  "users.sessions.manage": "View and revoke user sessions",
  "users.protected": "Manage protected accounts with fresh authentication",
  "roles.view": "View roles and permission catalog",
  "roles.create": "Create and copy roles",
  "roles.update": "Edit role descriptions",
  "roles.permissions": "Edit role permissions",
  "roles.delegate": "Configure permission delegation",
  "roles.archive": "Archive unused roles",
  "invitations.manage": "Manage invitations",
  "requests.view.all": "View all requests",
  "requests.reply": "Reply to requests",
  "requests.internal_notes": "Use internal request notes",
  "requests.assign": "Assign requests",
  "requests.status": "Change request status",
  "requests.archive": "Archive requests",
  "requests.export": "Export requests",
  "inquiries.view.all": "View all inquiries",
  "inquiries.reply": "Reply to inquiries",
  "inquiries.assign": "Assign inquiries",
  "inquiries.status": "Change inquiry status",
  "inquiries.archive": "Archive inquiries",
  "inquiries.export": "Export inquiries",
  "pages.view": "View administration pages",
  "pages.edit": "Edit page drafts",
  "pages.publish": "Publish pages",
  "pages.restore": "Restore page revisions",
  "pages.delete": "Delete pages",
  "media.upload": "Upload media",
  "media.manage": "Manage media library",
  "menus.manage": "Manage menus",
  "settings.manage": "Manage site settings",
  "notifications.send": "Send email notifications",
  "email.outbox": "View email outbox",
  "diagnostics.view": "View sanitized diagnostics",
  "diagnostics.manage": "Classify diagnostic groups",
  "audit.view": "View audit events",
  "audit.export": "Export audit events",
  "audit.review": "Review audit events",
  "audit.cases.manage": "Manage audit cases",
  "audit.rules.manage": "Manage audit rules",
  "audit.policy.manage": "Manage audit retention policy",
  "audit.sensitive.view": "View restricted sanitized audit evidence",
  "audit.health.view": "View audit recording health",
};
const dependencies: Partial<Record<Permission, Permission[]>> = {
  "workflows.manage": ["workflows.view"],
  "workflows.publish": ["workflows.view"],
  "workflows.transfer": ["workflows.view"],
  "teams.manage": ["workflows.view"],
  "users.roles": ["users.update"],
  "users.suspend": ["users.update"],
  "roles.permissions": ["roles.update"],
  "roles.archive": ["roles.update"],
  "roles.delegate": ["roles.update"],
};
const explanations: Partial<Record<Permission, [string, string]>> = {
  "users.create": [
    "يرسل دعوة؛ لا ينشئ حساباً مباشراً أو يمنح حق إدارة الأدوار.",
    "Sends an invitation; does not create a direct account or authorize role management.",
  ],
  "users.provision": [
    "ينشئ الحساب فوراً؛ إسناد أدوار الطاقم يحتاج تفويضاً مستقلاً.",
    "Creates an account immediately; staff assignment requires independent delegation.",
  ],
  "users.roles": [
    "يسند دوراً واحداً نشطاً ضمن حدود التفويض؛ لا يعدّل صلاحيات الدور.",
    "Assigns one active role within the explicit delegation ceiling; does not edit role permissions.",
  ],
  "roles.delegate": [
    "حدود منح الصلاحيات مستقلة عن امتلاكها؛ ضبط الحدود متاح لمدير النظام فقط.",
    "Delegation is separate from possession; only the protected root can configure delegation ceilings.",
  ],
  "users.credentials.temporary": [
    "يصدر اعتماداً مؤقتاً بعد التحقق من كلمة مرور المدير الحالية ويبطل الجلسات والرموز السابقة.",
    "Issues a one-time-displayed temporary password after verifying the administrator password; revokes old sessions and tokens.",
  ],
  "users.protected": [
    "يتطلب دور مدير النظام وكلمة مروره الحالية؛ لا يمكن منحه امتياز الجذر لدور مخصص.",
    "Requires protected root identity and its current password; a custom role cannot acquire root identity.",
  ],
};
export interface PermissionDefinition {
  key: Permission;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  group: string;
  sensitivity: "standard" | "sensitive";
  requires: Permission[];
  scope: "operation" | "all";
}
export const PERMISSION_CATALOG: PermissionDefinition[] = (
  Object.keys(PERMISSIONS) as Permission[]
).map((key) => ({
  key,
  nameAr: PERMISSIONS[key],
  nameEn: english[key],
  descriptionAr: explanations[key]?.[0] ?? PERMISSIONS[key],
  descriptionEn: explanations[key]?.[1] ?? english[key],
  group: key.split(".")[0],
  sensitivity:
    /^(users\.(roles|suspend|protected|credentials)|roles\.|settings\.|audit\.|workflows\.|teams\.)|export|publish/.test(
      key,
    )
      ? "sensitive"
      : "standard",
  requires: dependencies[key] ?? [],
  scope: key.endsWith(".all") ? "all" : "operation",
}));
