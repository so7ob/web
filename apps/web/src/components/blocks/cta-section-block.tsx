"use client";

import { type z } from "zod";
import type { blockSchemas } from "@/lib/blocks/types";
import type { Locale } from "@/lib/i18n";
import { buttonVariants } from "@/components/ui/button";
import { BlockLink } from "./block-link";

export type CtaSectionBlockProps = z.input<typeof blockSchemas.ctaSection>["props"];

const VARIANT_CLASSES: Record<string, string> = {
  primary: buttonVariants(),
  outline: buttonVariants({ variant: "outline" }),
  navy: buttonVariants({ variant: "secondary" }),
};

/** Public callout composed from the same card/button primitives as the workspaces. */
export function CtaSectionBlock({ props, locale }: { props: CtaSectionBlockProps; locale: Locale }) {
  const notes = [props.discussNote, props.quoteNote].filter(Boolean).join(" · ");

  return (
    <section className="border-y border-border bg-card py-8 sm:py-10">
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-balance text-[1.75rem] font-normal leading-snug text-card-foreground">{props.title}</h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-8 text-muted-foreground">{props.body}</p>
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
        {notes && <p className="mt-6 text-xs leading-6 text-muted-foreground">{notes}</p>}
      </div>
    </section>
  );
}
