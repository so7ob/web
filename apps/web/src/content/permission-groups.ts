import type { Locale } from "@/lib/i18n";

const arabic: Record<string, string> = {
  admin: "الإدارة", users: "المستخدمون", roles: "الأدوار",
  invitations: "الدعوات", requests: "الطلبات", inquiries: "الاستفسارات",
  pages: "المحتوى", media: "الملفات", menus: "القوائم",
  settings: "الإعدادات", notifications: "الإشعارات", email: "البريد",
  diagnostics: "التشخيص", audit: "التدقيق", workflows: "سير العمل",
  teams: "فرق العمل",
};

export function permissionGroupLabel(group: string, locale: Locale): string {
  return (locale === "ar" ? arabic[group] : undefined) ?? group;
}
