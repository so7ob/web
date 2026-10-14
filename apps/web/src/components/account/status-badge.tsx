/**
 * شارة حالة الطلب — خريطة ألوان متناسقة مع هوية العلامة (بلا نيلي).
 * النص يُمرَّر من ترجمات البوابة — لا نصوص هنا.
 */
const STATUS_CLASSES: Record<string, string> = {
  new: "bg-brand-soft text-brand-strong",
  in_review: "bg-warning-soft text-warning-foreground",
  awaiting_info: "bg-highlight-soft text-highlight-foreground",
  in_progress: "bg-info-soft text-info-foreground",
  responded: "bg-success-soft text-success-foreground",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-danger-soft text-danger-foreground",
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
