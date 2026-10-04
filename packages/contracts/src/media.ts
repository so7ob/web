// Adapted from Website fc4a959 (runtime-identical in 634e449); legacy and v1 media aliases.
export const MEDIA_URL_PREFIX = "/api/media/";

/**
 * استخراج كل معرفات الوسائط المشار إليها في نص JSON — مطابقة على حدود المعرف.
 * يعيدها كـ Set بلا تكرار. آمن على نصوص غير صالحة (يرجع فارغًا).
 */
export function extractMediaRefs(text: string | null | undefined): Set<string> {
  const refs = new Set<string>();
  if (!text || !(/\/api\/(?:v1\/)?media\//.test(text))) return refs;
  // الالتقاط الجائع يعيد المعرف الكامل دائمًا — الروابط في JSON تحمل معرفات مكتملة
  const global = new RegExp(`/api/(?:v1/)?media/([0-9a-zA-Z_-]+)`, "g");
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    refs.add(m[1]);
  }
  return refs;
}

/** هل يشير هذا النص إلى وسيلة معينة؟ مطابقة بحدود معرف صارمة (لا مطابقة جزئية). */
export function textReferencesMedia(text: string | null | undefined, mediaId: string): boolean {
  if (!text || !mediaId || !(/\/api\/(?:v1\/)?media\//.test(text))) return false;
  // حدود يسار: بداية السلسلة أو ما ليس [0-9a-zA-Z_-] قبل المعرف؛
  // حدود يمين: نهاية السلسلة أو ما ليس [0-9a-zA-Z_-] بعده.
  const pattern = new RegExp(`/api/(?:v1/)?media/${escapeRegExp(mediaId)}(?![0-9a-zA-Z_-])`);
  return pattern.test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ——— أنواع المواقع ———

export type MediaUsageKind = "page_published" | "page_draft" | "page_og" | "template";

export interface MediaUsageLocation {
  kind: MediaUsageKind;
  /** معرف الكيان (صفحة/قالب) — للروابط في الواجهة */
  entityId: string;
  /** عنوان عربي/إنجليزي لعرضه في الواجهة */
  titleAr: string;
  titleEn: string;
  /** اللغة التي يظهر فيها الاستخدام داخل المحتوى (أو null لصورة المشاركة) */
  locale: "ar" | "en" | null;
  /** مسودة أم منشور — يهم للرسالة */
  state: "draft" | "published" | null;
  /** صفحة مؤرشفة — لا تظهر للزوار لكن استعادتها تعيد الوسيلة (تُعرض بوضوح) */
  archived?: boolean;
}

/** تطبيع اسم مجلد الوسائط — نص غير فارغ 1-60 بلا محارف تحكم؛ الغائب/الفارغ يعني general. */
export function normalizeMediaFolder(raw: unknown): string | null {
  if (raw === undefined || raw === null) return "general";
  const s = Array.from(String(raw).trim()).filter(c => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join("");
  if (!s) return "general";
  if (s.length > 60) return null;
  return s;
}

export interface MediaLibraryItem {
  id:string;filename:string;url:string;mimeType:string;size:number;altText:string|null;title:string|null;folder:string;uploadedBy:string;createdAt:string;usageCount:number;
}
export interface MediaLibraryResponse {ok:boolean;total:number;unusedTotal:number;page:number;pageSize:number;folders:string[];media:MediaLibraryItem[]}
