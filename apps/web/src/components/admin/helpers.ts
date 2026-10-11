/**
 * مساعدات مشتركة لمكونات لوحة الإدارة (آمنة للعميل):
 * طلبات الواجهة + تنسيق التواريخ والأحجام + خرائط ألوان الحالات.
 */
import { format, formatDistanceToNow } from "date-fns";
import { ar as arDfns } from "date-fns/locale";
import type { PortalContent } from "@/content/portal/types";
import type { Locale } from "@/lib/i18n";

export {ApiError} from '@/lib/errors/transport';
import {ApiError,requestJson} from '@/lib/errors/transport';
export async function apiGet<T>(url:string,signal?:AbortSignal):Promise<T>{return (await requestJson<T>(url,{cache:'no-store',signal})).data;}
export async function apiSend<T>(url:string,method:'POST'|'PATCH'|'PUT'|'DELETE',body?:unknown):Promise<T>{return (await requestJson<T>(url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)},{requireOk:true})).data;}
export async function apiUpload<T>(url:string,form:FormData):Promise<T>{return (await requestJson<T>(url,{method:'POST',body:form},{requireOk:true})).data;}

/** رسالة خطأ مفهومة من رمز الواجهة — كل النصوص من ترجمات المنصة */
export function apiErrorMessage(
  err: unknown,
  errors: PortalContent["auth"]["errors"],
): string {
  const code = err instanceof ApiError ? err.code : "generic";
  const map: Record<string, string> = {
    email_taken: errors.emailTaken,
    rate_limited: errors.rateLimited,
    invalid: errors.invalid,
    required: errors.required,
    empty: errors.required,
    email_invalid: errors.emailInvalid,
    invalid_email: errors.emailInvalid,
    not_found: errors.diagnostic.unavailable,
    forbidden: errors.diagnostic.authorization,
    unauthorized: errors.diagnostic.authentication,
    bad_origin: errors.generic,
  };
  if(err instanceof ApiError&&err.category==='cancelled')return '';
  const message=map[code]??(err instanceof ApiError?errors.diagnostic[err.category]:errors.generic);
  const reference=err instanceof ApiError?(err.errorId??err.requestId):undefined;
  return reference?`${message} (${reference})`:message;
}

const dfnsLocale = (locale: Locale) => (locale === "ar" ? arDfns : undefined);

/** تاريخ مختصر مترجم (PP = 12 يناير 2026) */
export function fmtDate(
  value: string | null | undefined,
  locale: Locale,
  pattern = "PP",
): string {
  if (!value) return "";
  return format(new Date(value), pattern, { locale: dfnsLocale(locale) });
}

/** تاريخ ووقت مترجم */
export function fmtDateTime(
  value: string | null | undefined,
  locale: Locale,
): string {
  return fmtDate(value, locale, "P p");
}

/** زمن نسبي مترجم (قبل 3 دقائق) */
export function fmtRelative(
  value: string | null | undefined,
  locale: Locale,
): string {
  if (!value) return "";
  return formatDistanceToNow(new Date(value), {
    addSuffix: true,
    locale: dfnsLocale(locale),
  });
}

/** يوم مختصر من تاريخ (للرسم البياني) */
export function fmtDayLabel(date: string, locale: Locale): string {
  return format(new Date(`${date}T00:00:00`), "EEEEEE", {
    locale: dfnsLocale(locale),
  });
}

/** حجم ملف بصيغة مقروءة — الوحدات رموز قياسية */
export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** الحد الأقصى لعدد الصفحات من الإجمالي وحجم الصفحة */
export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** مبني استعلام URL نظيف من قيم غير فارغة */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === false) continue;
    if (value === true) {
      sp.set(key, "1");
      continue;
    }
    sp.set(key, String(value));
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}
