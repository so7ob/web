import {SOCIAL_CHANNELS} from '@so7ob/contracts';
import {useSitePresentation} from '@/components/appearance/provider';
import Link from "@/routing/link";
import { ExternalLink } from "lucide-react";
import { Logo } from "./logo";
import { localePath, type Locale, type RouteName } from "@/lib/i18n";
import type { SiteContent } from "@/content/types";
import type { NavLink, SiteSettings } from "@/lib/site-data";

const SERVICE_ROUTES = ["web", "mobile", "systems", "ux", "automation", "maintenance"] as const;

/** Product footer retains all real destinations on the shared card surface. */
export function SiteFooter({
  locale,
  content,
  settings,
  items,
}: {
  locale: Locale;
  content: SiteContent;
  settings: SiteSettings;
  items: NavLink[];
}) {
  const presentation=useSitePresentation();
  const socials=SOCIAL_CHANNELS.map(key=>({key,url:Object.hasOwn(presentation,"social."+key)?presentation["social."+key]:key==="github"?settings.socialGithub:""})).filter(item=>!!item.url);
  const year = new Date().getFullYear();
  const channels: { label: string; value: string; href: string }[] = [];
  if (settings.contactEmail) {
    channels.push({ label: content.form.emailLabel, value: settings.contactEmail, href: `mailto:${settings.contactEmail}` });
  }
  if (settings.contactPhone) {
    channels.push({
      label: content.form.phoneLabel,
      value: settings.contactPhone,
      href: `tel:${settings.contactPhone.replace(/\s+/g, "")}`,
    });
  }

  return (
    <footer className="mt-auto border-t border-border bg-card text-card-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div className="space-y-4">
            <Logo size="md" nameLang={locale === "ar" ? "ar" : "en"} />
            <p className="max-w-sm text-sm leading-7 text-muted-foreground">{content.footer.about}</p>
            {channels.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {channels.map((c) => (
                  <li key={c.label}>
                    <span className="text-muted-foreground">{c.label}: </span>
                    <a
                      href={c.href}
                      className="inline-flex min-h-6 min-w-6 items-center ltr-isolate font-medium text-primary underline-offset-4 transition-colors hover:underline hover:decoration-primary"
                    >
                      {c.value}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav aria-label={content.footer.pagesTitle}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{content.footer.pagesTitle}</h2>
            <ul className="mt-4 space-y-3">
              {items.map((item) => (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-6 min-w-6 items-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline hover:decoration-primary"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={content.footer.servicesTitle}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{content.footer.servicesTitle}</h2>
            <ul className="mt-4 space-y-3">
              {SERVICE_ROUTES.map((key) => {
                const item = content.services.items.find((s) => s.service === key);
                return (
                  <li key={key}>
                    <Link
                      href={`${localePath(locale, "services")}#${key}`}
                      className="inline-flex min-h-6 min-w-6 items-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline hover:decoration-primary"
                    >
                      {item?.name ?? key}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {locale==='ar'?settings.nameAr:settings.nameEn} — {content.footer.rights}
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-5">
            <span>{content.footer.illustrativeNote}</span>
            <nav aria-label={locale==='ar'?'روابط التواصل':'Social links'} className="flex flex-wrap gap-3">{socials.map(item=><a key={item.key} href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground underline-offset-4 hover:underline"><ExternalLink className="size-3.5" aria-hidden="true"/>{item.key==='x'?'X':item.key.charAt(0).toUpperCase()+item.key.slice(1)}</a>)}</nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
