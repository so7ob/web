"use client";

import { Section, SectionHeading } from "@/components/site/section";
import { ServiceIcon } from "@/components/site/service-icon";
import { localePath, type Locale } from "@/lib/i18n";
import { ar } from "@/content/ar";
import { en } from "@/content/en";
import { type z } from "zod";
import type { blockSchemas } from "@/lib/blocks/types";
import type { ServiceType } from "@/lib/validation";
import { BlockLink } from "./block-link";

export type ServicesGridBlockProps = z.input<typeof blockSchemas.servicesGrid>["props"];

/** بطاقات الخدمات — نسخة من HomeServices: بطاقتان بارزتان + بقية مكثفة */
export function ServicesGridBlock({ props, locale }: { props: ServicesGridBlockProps; locale: Locale }) {
  const t = locale === "en" ? en : ar;
  const cards = (props.cards ?? []).map((c) => ({
    ...c,
    name:
      props.items?.find((i) => i.service === c.service)?.name ?? t.form.services[c.service as ServiceType],
  }));
  const learnMore = props.learnMore ?? t.actions.learnMore;
  const viewAllLabel = props.viewAllLabel ?? t.actions.viewAllServices;
  const viewAllHref = props.viewAllHref || localePath(locale, "services");

  const [first, second, ...rest] = cards;
  const featured = second ? [first, second] : first ? [first] : [];

  return (
    <Section className="bg-card">
      <SectionHeading kicker={props.kicker} title={props.title} description={props.description} />
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {featured.map((card) => (
          <BlockLink
            key={card.service}
            href={`${localePath(locale, "services")}#${card.service}`}
            locale={locale}
            className="ds-card group block border-t-3 border-t-primary p-4 transition-colors hover:border-primary"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ServiceIcon service={card.service as ServiceType} />
            </span>
            <h3 className="mt-3 text-lg font-medium">{card.name}</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{card.blurb}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              {learnMore}
              <Chevron />
            </span>
          </BlockLink>
        ))}
        {rest.map((card) => (
          <BlockLink
            key={card.service}
            href={`${localePath(locale, "services")}#${card.service}`}
            locale={locale}
            className="ds-card group block p-4 transition-colors hover:border-primary"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-brand-strong">
              <ServiceIcon service={card.service as ServiceType} />
            </span>
            <h3 className="mt-3 text-lg font-medium text-navy">{card.name}</h3>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{card.blurb}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
              {learnMore}
              <Chevron />
            </span>
          </BlockLink>
        ))}
      </div>
      <div className="mt-4">
        <BlockLink
          href={viewAllHref}
          locale={locale}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-semibold text-navy transition-colors hover:border-brand hover:text-brand"
        >
          {viewAllLabel}
        </BlockLink>
      </div>
    </Section>
  );
}

function Chevron() {
  return (
    <svg
      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 rtl:rotate-180"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
