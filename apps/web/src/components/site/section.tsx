"use client";

import type { ReactNode } from "react";
import { useIsNestedBlock } from "@/components/blocks/nested-context";

/** Public content header composed from the shared AdminLTE heading/badge language. */
export function SectionHeading({
  kicker,
  title,
  description,
  align = "start",
  tone = "light",
}: {
  kicker: string;
  title: string;
  description?: string;
  align?: "start" | "center";
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      <p
        className={`mb-2 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-semibold ${
          isDark ? "bg-card/10 text-skydrop" : "bg-accent text-brand-strong"
        }`}
      >
        <KickerDot />
        {kicker}
      </p>
      <h2 className={`text-balance text-[1.75rem] font-normal leading-snug ${isDark ? "text-inverse-foreground" : "text-navy"}`}>
        {title}
      </h2>
      {description && (
        <p className={`mt-3 text-pretty text-base leading-7 ${isDark ? "text-emphasis-muted" : "text-muted-foreground"}`}>
          {description}
        </p>
      )}
    </div>
  );
}

function KickerDot() {
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-skydrop" aria-hidden="true" />;
}

/** غلاف قسم موحد بعرض محتوى مريح وطول أسطر مضبوط.
 *  داخل حاوية شجرة المحتوى يُرسم عاريًا (بلا حشوة/عرض أقصى ذاتي) —
 *  مسؤولية التباعد للحاوية الأم وحدها. */
export function Section({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  const nested = useIsNestedBlock();
  if (nested) {
    return (
      <div id={id} className={className}>
        {children}
      </div>
    );
  }
  return (
    <section id={id} className={`py-6 sm:py-8 lg:py-10 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}
