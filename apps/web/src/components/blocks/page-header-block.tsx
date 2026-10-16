"use client";

import { type z } from "zod";
import type { blockSchemas } from "@/lib/blocks/types";
import type { Locale } from "@/lib/i18n";
import { BlockLink } from "./block-link";

export type PageHeaderBlockProps = z.input<typeof blockSchemas.pageHeader>["props"];

/**
 * ترويسة صفحة داخلية — من AboutPage (PageHero) مع صف «روابط قفز» اختياري
 * بأسلوب ترويسة صفحة الخدمات.
 */
export function PageHeaderBlock({ props, locale }: { props: PageHeaderBlockProps; locale: Locale }) {
  const intro = props.intro ?? [];
  const quickLinks = props.quickLinks ?? [];

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="mb-2 inline-block rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-brand-strong">
          {props.kicker}
        </p>
        <h1 className="text-balance text-[1.75rem] font-normal leading-snug text-navy">
          {props.title}
        </h1>
        <div className="mt-4 max-w-3xl space-y-3">
          {intro.map((p, i) => (
            <p key={i} className="text-pretty text-base leading-7 text-muted-foreground">
              {p}
            </p>
          ))}
        </div>
        {quickLinks.length > 0 && (
          <nav aria-label={props.kicker} className="mt-4 flex flex-wrap gap-2">
            {quickLinks.map((l, i) => (
              <BlockLink
                key={`${i}-${l.label}`}
                href={l.href}
                locale={locale}
                className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-brand hover:text-brand"
              >
                {l.label}
              </BlockLink>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
