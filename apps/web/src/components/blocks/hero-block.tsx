"use client";

import { APPEARANCE_MOTION } from "@so7ob/contracts";
import Link from "@/routing/link";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ArrowLeft, ArrowRight } from "lucide-react";
import { CloudHeroArt } from "@/components/site/cloud-hero-art";
import { localePath, type Locale } from "@/lib/i18n";
import { ar } from "@/content/ar";
import { en } from "@/content/en";
import { type z } from "zod";
import type { blockSchemas } from "@/lib/blocks/types";

export type HeroBlockProps = z.input<typeof blockSchemas.hero>["props"];

/**
 * الواجهة الافتتاحية — نسخة من Hero الرئيسية تقرأ نصوصها من خصائص البلوك،
 * وتأخذ تسميتي زرّي الإجراء من ملفات الترجمة (actions).
 */
export function HeroBlock({
  props,
  locale,
}: {
  props: HeroBlockProps;
  locale: Locale;
}) {
  const reduce = useReducedMotion();
  const t = locale === "en" ? en : ar;
  const arrow =
    locale === "ar" ? (
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    ) : (
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    );
  const support = props.support ?? [];

  return (
    <section className="border-b border-border bg-card">
      <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-10">
        <motion.div
          {...(reduce
            ? {
                initial: false as const,
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0 },
              }
            : {
                initial: { opacity: 0, y: 24 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: APPEARANCE_MOTION.panel / 1000, ease: "easeOut" },
              })}
        >
          <p className="mb-3 inline-flex items-center gap-2 rounded-lg bg-accent px-2 py-1 text-sm text-accent-foreground">
            <span
              className="inline-block h-2 w-2 rounded-full bg-skydrop"
              aria-hidden="true"
            />
            {props.kicker}
          </p>
          <h1 className="text-balance text-4xl font-normal leading-[1.25] text-navy sm:text-5xl lg:text-[3.4rem]">
            {props.title}{" "}
            <span className="relative inline-block text-brand">
              {props.titleAccent}
              <svg
                className="absolute -bottom-2 start-0 w-full text-skydrop"
                viewBox="0 0 220 12"
                fill="none"
                aria-hidden="true"
                preserveAspectRatio="none"
              >
                <path
                  d="M3 9C60 3 160 3 217 8"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  opacity="0.55"
                />
              </svg>
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">
            {props.description}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`${localePath(locale, "contact")}?type=discussion`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-7 text-base font-semibold text-primary-foreground shadow-sm transition-[color,background-color,border-color,box-shadow,opacity,transform] hover:bg-primary-hover hover:text-primary-hover-foreground hover:shadow-sm"
            >
              {t.actions.discuss}
              {arrow}
            </Link>
            <Link
              href={`${localePath(locale, "contact")}?type=quote`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-navy/15 bg-card px-7 text-base font-semibold text-navy transition-colors hover:border-brand hover:text-brand"
            >
              {t.actions.quote}
            </Link>
          </div>

          <ul className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            {support.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm font-medium text-foreground/80"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
                  <Check
                    className="h-3 w-3"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          {...(reduce
            ? {
                initial: false as const,
                animate: { opacity: 1, scale: 1 },
                transition: { duration: 0 },
              }
            : {
                initial: { opacity: 0, scale: 0.96 },
                animate: { opacity: 1, scale: 1 },
                transition: { duration: APPEARANCE_MOTION.panel / 1000, ease: "easeOut" },
              })}
          className="relative"
        >
          <CloudHeroArt />
        </motion.div>
      </div>
    </section>
  );
}
