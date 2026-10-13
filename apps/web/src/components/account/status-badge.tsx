/**
 * شارة حالة الطلب — خريطة ألوان متناسقة مع هوية العلامة (بلا نيلي).
 * النص يُمرَّر من ترجمات البوابة — لا نصوص هنا.
 */
const STATUS_CLASSES: Record<string, string> = {
  new: "bg-brand-soft text-brand-strong",
  in_review: "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200",
  awaiting_info: "bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-200",
  in_progress: "bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-200",
  responded: "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200",
};

const FALLBACK = "bg-muted text-muted-foreground";

export function StatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[status] ?? FALLBACK} ${className ?? ""}`}
    >
      {label}
    </span>
  );
}
