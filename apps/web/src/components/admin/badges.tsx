/**
 * شارات الحالة والأولوية والدور — ألوان دلالية ثابتة من لوحة الهوية.
 * النصوص تمرر من الترجمات، هنا الألوان والشكل فقط.
 * كل شارة: خلفية ملوّنة خفيفة + حد بنفس العائلة + نقطة مؤشر — بنفس دلالات الألوان الأصلية.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SYSTEM_ROLES } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";

interface Tone {
  chip: string;
  dot: string;
}

const FALLBACK_TONE: Tone = {
  chip: "border-border bg-secondary/70 text-secondary-foreground",
  dot: "bg-muted",
};

function ToneBadge({
  tone,
  label,
  className,
}: {
  tone: Tone;
  label: string;
  className?: string;
}) {
  return (
    <Badge className={cn("gap-1.5 rounded-full", tone.chip, className)}>
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", tone.dot)}
      />
      {label}
    </Badge>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  new: {
    chip: "border-info-border bg-accent/70 text-brand-strong",
    dot: "bg-brand",
  },
  in_review: {
    chip: "border-border bg-secondary/70 text-secondary-foreground",
    dot: "bg-muted",
  },
  awaiting_info: {
    chip: "border-warning-border bg-warning-soft text-warning-foreground",
    dot: "bg-warning",
  },
  in_progress: {
    chip: "border-info-border bg-brand-soft/70 text-brand-strong",
    dot: "bg-brand",
  },
  responded: {
    chip: "border-success-border bg-success-soft text-success-foreground",
    dot: "bg-success",
  },
  closed: {
    chip: "border-border bg-muted text-foreground text-muted-foreground",
    dot: "bg-muted",
  },
  cancelled: {
    chip: "border-danger-border bg-danger-soft text-danger-foreground",
    dot: "bg-danger",
  },
};

/** شارة حالة الطلب/الاستفسار */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  return (
    <ToneBadge
      tone={STATUS_TONES[status] ?? FALLBACK_TONE}
      label={label}
      className={className}
    />
  );
}

const PRIORITY_TONES: Record<string, Tone> = {
  low: {
    chip: "border-border bg-muted/70 text-muted-foreground",
    dot: "bg-muted",
  },
  normal: {
    chip: "border-info-border bg-accent/70 text-brand-strong",
    dot: "bg-brand",
  },
  high: {
    chip: "border-warning-border bg-warning-soft text-warning-foreground",
    dot: "bg-warning",
  },
  urgent: { chip: "border-danger-border bg-danger-soft text-danger-foreground", dot: "bg-danger" },
};

/** شارة الأولوية */
export function PriorityBadge({
  priority,
  label,
  className,
}: {
  priority: string;
  label: string;
  className?: string;
}) {
  return (
    <ToneBadge
      tone={PRIORITY_TONES[priority] ?? FALLBACK_TONE}
      label={label}
      className={className}
    />
  );
}

const USER_STATUS_TONES: Record<string, Tone> = {
  active: {
    chip: "border-success-border bg-success-soft text-success-foreground",
    dot: "bg-success",
  },
  pending_verification: {
    chip: "border-warning-border bg-warning-soft text-warning-foreground",
    dot: "bg-warning",
  },
  suspended: {
    chip: "border-danger-border bg-danger-soft text-danger-foreground",
    dot: "bg-danger",
  },
};

/** شارة حالة حساب المستخدم */
export function UserStatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  return (
    <ToneBadge
      tone={USER_STATUS_TONES[status] ?? FALLBACK_TONE}
      label={label}
      className={className}
    />
  );
}

const ROLE_TONES: Record<string, Tone> = {
  super_admin: { chip: "border-navy bg-inverse text-inverse-foreground", dot: "bg-skydrop" },
  ops_manager: {
    chip: "border-info-border bg-brand-soft/70 text-brand-strong",
    dot: "bg-brand",
  },
  support: {
    chip: "border-info-border bg-accent/70 text-brand-strong",
    dot: "bg-brand",
  },
  content_editor: {
    chip: "border-highlight-border bg-highlight-soft text-highlight-foreground",
    dot: "bg-highlight",
  },
  client: {
    chip: "border-border bg-secondary/70 text-secondary-foreground",
    dot: "bg-muted",
  },
};

/** شارة الدور — الاسم من SYSTEM_ROLES بلغة الواجهة */
export function RoleBadge({
  roleKey,
  locale,
  className,
  role:suppliedRole,
}: {
  roleKey: string;
  locale: Locale;
  role?:{nameAr:string;nameEn:string};
  className?: string;
}) {
  const role = suppliedRole ?? SYSTEM_ROLES.find((r) => r.key === roleKey);
  const label =
    locale === "en" ? (role?.nameEn ?? roleKey) : (role?.nameAr ?? roleKey);
  return (
    <ToneBadge
      tone={ROLE_TONES[roleKey] ?? FALLBACK_TONE}
      label={label}
      className={className}
    />
  );
}

/** اسم الدور المترجم (بدون شارة) */
export function roleLabel(roleKey: string, locale: Locale): string {
  const role = SYSTEM_ROLES.find((r) => r.key === roleKey);
  return locale === "en"
    ? (role?.nameEn ?? roleKey)
    : (role?.nameAr ?? roleKey);
}

const OUTBOX_TONES: Record<string, Tone> = {
  sent: {
    chip: "border-success-border bg-success-soft text-success-foreground",
    dot: "bg-success",
  },
  dev_logged: {
    chip: "border-info-border bg-accent/70 text-brand-strong",
    dot: "bg-brand",
  },
  failed: {
    chip: "border-destructive/60 bg-destructive text-inverse-foreground",
    dot: "bg-card/80",
  },
};

/** شارة حالة البريد */
export function OutboxStatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  return (
    <ToneBadge
      tone={OUTBOX_TONES[status] ?? FALLBACK_TONE}
      label={label}
      className={className}
    />
  );
}

/** شارة رمز فعل التدقيق — تقنية بحتة (رمز لا نصًا مترجمًا) */
export function ActionBadge({ action }: { action: string }) {
  return (
    <Badge
      variant="outline"
      className="rounded-full bg-muted/50 font-mono text-xs tracking-tight"
    >
      {action}
    </Badge>
  );
}
