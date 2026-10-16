import {ThemeToggle,useSitePresentation} from '@/components/appearance/provider';


import { useEffect, useState } from "react";
import Link from "@/routing/link";
import { usePathname } from "@/routing/navigation";
import { Menu, X, UserCircle, LogIn, LayoutDashboard } from "lucide-react";
import { Logo } from "./logo";
import { LanguageSwitcher } from "./language-switcher";
import { localePath, type Locale } from "@/lib/i18n";
import type { SiteContent } from "@/content/types";
import type { NavLink } from "@/lib/site-data";

interface SiteHeaderProps {
  locale: Locale;
  content: SiteContent;
  items: NavLink[];
  auth: { loggedIn: boolean; isStaff: boolean; accountLabel: string; adminLabel: string; loginLabel: string };
}

/** الترويسة: قائمة لاصقة مع حالة التمرير ودرج جوال متاح بلوحة المفاتيح */
export function SiteHeader({ locale, content, items, auth }: SiteHeaderProps) {
  const identity=useSitePresentation();
  const brandName=identity[locale==="ar"?"site.nameAr":"site.nameEn"]||content.meta.siteName;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? `/${locale}`;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // منع تمرير الصفحة خلف الدرج المفتوح
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const homePath = localePath(locale);
  const isActive = (href: string) => (href === homePath ? pathname === href : pathname.startsWith(href));

  const accountLink = (
    <Link
      href={auth.loggedIn ? `/${locale}/account` : `/${locale}/auth/login`}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-navy transition-colors hover:border-brand hover:text-brand"
    >
      {auth.loggedIn ? (
        <UserCircle className="h-4 w-4" aria-hidden="true" />
      ) : (
        <LogIn className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{auth.loggedIn ? auth.accountLabel : auth.loginLabel}</span>
    </Link>
  );

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b bg-card transition-shadow ${
        scrolled ? "border-border shadow-sm" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex min-h-(--header-height) max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href={homePath} aria-label={brandName} className="shrink-0 rounded-md">
          <Logo size="md" nameLang={locale === "ar" ? "ar" : "en"} />
        </Link>

        <nav aria-label={content.nav.home + " — " + brandName} className="hidden xl:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => (
              <li key={item.href + item.label}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                    isActive(item.href) ? "text-brand" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden shrink-0 items-center gap-2.5 xl:flex">
          <ThemeToggle locale={locale}/>
          <LanguageSwitcher locale={locale} common={content.common} />
          {accountLink}
          {auth.loggedIn && auth.isStaff && (
            <Link
              href={`/${locale}/admin`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover hover:text-primary-hover-foreground"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">{auth.adminLabel}</span>
            </Link>
          )}
          {!auth.loggedIn && (
            <Link
              href={`${localePath(locale, "contact")}?type=quote`}
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover hover:text-primary-hover-foreground"
            >
              {content.actions.quote}
            </Link>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 xl:hidden [&>a]:px-2 [&>a>svg]:hidden sm:[&>a>svg]:block">
          <LanguageSwitcher locale={locale} common={content.common} />
          <ThemeToggle compact locale={locale}/>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? content.common.closeMenu : content.common.openMenu}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-foreground"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* درج الجوال */}
      {open && (
        <div id="mobile-nav" className="border-t border-border bg-card xl:hidden">
          <nav aria-label={content.common.openMenu} className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={"m-" + item.href + item.label}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex min-h-12 items-center rounded-md px-3 text-base font-medium ${
                      isActive(item.href) ? "bg-accent text-brand-strong" : "text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
              {accountLink}
              {auth.loggedIn && auth.isStaff && (
                <Link
                  href={`/${locale}/admin`}
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  {auth.adminLabel}
                </Link>
              )}
              <Link
                href={`${localePath(locale, "contact")}?type=discussion`}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-brand px-5 text-sm font-semibold text-brand"
              >
                {content.actions.discuss}
              </Link>
              <Link
                href={`${localePath(locale, "contact")}?type=quote`}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                {content.actions.quote}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
