"use client";

import { type z } from "zod";
import type { blockSchemas } from "@/lib/blocks/types";
import type { Locale } from "@/lib/i18n";
import { BlockLink } from "./block-link";

export type CtaSectionBlockProps = z.input<typeof blockSchemas.ctaSection>["props"];

/** أنماط الأزرار على الخلفية الكحلية الداكنة (من الأصل FinalCta) */
const VARIANT_CLASSES: Record<string, string> = {
  primary:
    "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emphasis-action px-7 text-base font-bold text-emphasis-action-foreground transition-colors hover:bg-emphasis-action/90 sm:w-auto",
  outline:
    "inline-flex min-h-12 w-full items-center justify-center rounded-lg border-2 border-inverse-foreground/25 px-7 text-base font-semibold text-inverse-foreground transition-colors hover:border-skydrop hover:text-skydrop sm:w-auto",
  navy: "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-card px-7 text-base font-semibold text-navy transition-colors hover:bg-card/90 sm:w-auto",
};

/** الدعوة الختامية «ما الذي تريد إنجازه؟» — شريط كحلي برسمة زخرفية (الأصل FinalCta) */
export function CtaSectionBlock({ props, locale }: { props: CtaSectionBlockProps; locale: Locale }) {
  const notes = [props.discussNote, props.quoteNote].filter(Boolean).join(" · ");

  return (
    <section className="relative overflow-hidden bg-inverse py-16 sm:py-20 lg:py-24">
      {/* زخارف خفيفة */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-20 start-[10%] h-64 w-64 rounded-full bg-emphasis-action/10 blur-3xl" />
        <div className="absolute bottom-0 end-[5%] h-72 w-72 rounded-full bg-digital/20 blur-3xl opacity-60" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-balance text-3xl font-bold leading-snug text-inverse-foreground sm:text-4xl">{props.title}</h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-8 text-emphasis-muted">{props.body}</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {(props.links ?? []).map((link, i) => (
            <BlockLink
              key={`${i}-${link.label}`}
              href={link.href}
              locale={locale}
              className={VARIANT_CLASSES[link.variant ?? "primary"] ?? VARIANT_CLASSES.primary}
            >
              {link.label}
            </BlockLink>
          ))}
        </div>
        {notes && <p className="mt-6 text-xs leading-6 text-emphasis-muted">{notes}</p>}
      </div>
    </section>
  );
}
