export const ANNOUNCEMENT_VARIANTS = ["info", "warning", "success", "brand"] as const;
export interface NavLink {
  label: string;
  href: string;
  enabled: boolean;
  order: number;
}
export type AnnouncementVariant = (typeof ANNOUNCEMENT_VARIANTS)[number];
export interface AnnouncementSettings {
  enabled: boolean;
  messageAr: string;
  messageEn: string;
  ctaLabelAr: string;
  ctaLabelEn: string;
  ctaUrl: string;
  variant: AnnouncementVariant;
  /** بداية العرض (YYYY-MM-DD أو ISO) — قبلها يبقى الشريط مخفيًا */
  startAt: string;
  /** نهاية العرض (YYYY-MM-DD أو ISO) — بعدها يبقى الشريط مخفيًا */
  endAt: string;
  /** يُرفع مع كل حفظ — يستخدم لإعادة إظهار الشريط بعد الإخفاء */
  revision: string;
}
export interface SiteSettings {
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  socialGithub: string;
  nameAr: string;
  nameEn: string;
  announcement: AnnouncementSettings;
}
