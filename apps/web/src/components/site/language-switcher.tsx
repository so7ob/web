"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "@/routing/navigation";
import { useNavigate } from "react-router-dom";
import { Languages } from "lucide-react";
import { LOCALE_COOKIE, localeMeta, swapLocalePath, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/content/types";

/**
 * مبدّل اللغة: ينقل إلى الصفحة المقابلة في اللغة الأخرى،
 * ويحفظ الاختيار في كوكي يستخدمه تحويل الجذر في الزيارات القادمة.
 */
export function LanguageSwitcher({ locale, common }: { locale: Locale; common: SiteContent["common"] }) {
  const pathname = usePathname() ?? `/${locale}`;
  const navigate = useNavigate();
  const other: Locale = localeMeta[locale].other;
  const searchParams = useSearchParams();
  const tracking = /^\/(?:ar|en)\/track\/?$/.test(pathname);
  // TrackClient exchanges t for a cookie before replacing it with card. Do not
  // interrupt that exchange or put the capability in another navigation URL.
  const exchanging = tracking && Boolean(searchParams.get("t"));
  const rawCard = tracking && searchParams.getAll("card").length === 1 ? searchParams.get("card") : null;
  const separator = rawCard?.indexOf(":") ?? -1;
  const scope = rawCard?.slice(0, separator);
  const id = rawCard?.slice(separator + 1) ?? "";
  const validCard = (scope === "request" || scope === "inquiry") && id.length > 0 && id.length <= 64 && !Array.from(id).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  const destination = swapLocalePath(pathname, other) + (validCard
    ? "?" + new URLSearchParams({ card: `${scope}:${id}` }).toString()
    : "");

  useEffect(() => {
    // مزامنة الكوكي مع الصفحة الحالية عند كل تنقل
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=Lax`;
  }, [locale]);

  return (
    <a
      href={exchanging ? undefined : destination}
      role="link"
      aria-disabled={exchanging || undefined}
      tabIndex={exchanging ? -1 : undefined}
      hrefLang={other}
      onClick={(event) => {
        if (exchanging) {
          event.preventDefault();
          return;
        }
        document.cookie = `${LOCALE_COOKIE}=${other}; path=/; max-age=31536000; samesite=Lax`;
        // Contact-only SPA navigation also preserves the memory fallback when storage is blocked.
        if (/^\/(?:ar|en)\/contact\/?$/.test(pathname) && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          navigate(destination);
        }
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card/80 px-4 text-sm font-semibold text-navy transition-colors hover:border-brand hover:text-brand"
      aria-label={common.switchLanguage}
      lang={other}
      dir="ltr"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      {localeMeta[locale].otherLabel}
    </a>
  );
}
