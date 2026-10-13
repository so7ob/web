import {ThemeToggle} from '@/components/appearance/provider';
import {Logo} from '@/components/site/logo';

import {diagnosticsCopy} from '@/content/diagnostics';

/**
 * هيكل لوحة الإدارة: شريط جانبي كثيف (سطح المكتب) + درج (الجوال) + شريط علوي.
 * تُخفى ترويسة/تذييل الموقع العام عند وجود هذا الهيكل (body:has) لأن اللوحة
 * تطبيق قائم بذاته، والعودة للموقع متاحة من أسفل الشريط الجانبي.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "@/routing/link";
import { usePathname } from "@/routing/navigation";
import {
  LayoutDashboard,
  Users,
  Inbox,
  MessageSquareText,
  Bell,
  FileText,
  Images,
  ListTree,
  Settings,
  ScrollText,
  Send,
  Home,
  LogOut,
  Menu,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { getPortalContent } from "@/content/portal";
import { ar as siteAr } from "@/content/ar";
import { en as siteEn } from "@/content/en";
import { can } from "@/lib/auth/permissions";
import type { Permission } from "@/lib/auth/permissions";
import { localeMeta, swapLocalePath, type Locale } from "@/lib/i18n";
import { roleLabel } from "./badges";
import type { Me } from "./types";
import { CommandPalette } from "./command-palette";
import { cn } from "@/lib/utils";

interface AdminShellProps {
  me: Me;
  locale: Locale;
  siteName: string;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
}

/** اشتراك فارغ — قيمة «هل هذا ماك؟» تُقرأ عند التصيير عبر useSyncExternalStore
 *  (لقطة خادمية false ثم القيمة الفعلية بعد الإغراق، بلا عدم تطابق) */
const subscribePlatform = () => () => {};

export function AdminShell({
  me,
  locale,
  children,
}: AdminShellProps) {
  const pathname = usePathname() ?? `/${locale}/admin`;
  const [mobileOpen, setMobileOpen] = useState(false);
  // لوحة البحث الشاملة (Ctrl+K) — الحالة هنا ليصل إليها الزر ومستمع المفاتيح داخلها
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const t = getPortalContent(locale).admin.nav;
  const tn = getPortalContent(locale).admin.notifications;
  const ts = getPortalContent(locale).admin.search;
  const openMenuLabel = (locale === "en" ? siteEn : siteAr).common.openMenu;
  // اكتشاف ماك لعرض «⌘ K» بدل «Ctrl K» في رقاقة الاختصار
  const isMac = useSyncExternalStore(
    subscribePlatform,
    () => /mac|iphone|ipad|ipod/i.test(navigator.platform),
    () => false,
  );

  // نقطة إشعارات الفريق: جلب فوري ثم كل 30 ثانية، وتحديث عند تغيير الصفحة
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/account/notifications?unread=1");
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: number };
        if (active && typeof data.unread === "number") setUnread(data.unread);
      } catch {
        /* بلا اتصال — بصمت */
      }
    };
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pathname]);

  const identitySection = can(me, 'users.view') ? 'users' : can(me, 'roles.view') ? 'roles' : 'invitations';
  const identityHref = `/${locale}/admin/${identitySection}`;
  const items: NavItem[] = [
    { href: `/${locale}/admin`, label: t.dashboard, icon: LayoutDashboard },
    {
      href: identityHref,
      label: locale === "ar" ? "الهوية والمستخدمون" : "Identity & users",
      icon: Users,
      permission: identitySection === 'users' ? 'users.view' : identitySection === 'roles' ? 'roles.view' : 'invitations.manage',
    },
    {
      href: `/${locale}/admin/requests`,
      label: t.requests,
      icon: Inbox,
      permission: "requests.view.all",
    },
    {
      href: `/${locale}/admin/inquiries`,
      label: t.inquiries,
      icon: MessageSquareText,
      permission: "inquiries.view.all",
    },
    {href:`/${locale}/admin/workflows`,label:locale==='ar'?'مسارات العمل':'Workflows',icon:ListTree,permission:'workflows.view'},
    {
      href: `/${locale}/admin/notifications`,
      label: t.notifications,
      icon: Bell,
    },
    {
      href: `/${locale}/admin/pages`,
      label: t.pages,
      icon: FileText,
      permission: "pages.view",
    },
    {
      href: `/${locale}/admin/media`,
      label: t.media,
      icon: Images,
      permission: "media.manage",
    },
    {
      href: `/${locale}/admin/menus`,
      label: t.menus,
      icon: ListTree,
      permission: "menus.manage",
    },
    {
      href: `/${locale}/admin/settings`,
      label: t.settings,
      icon: Settings,
      permission: "settings.manage",
    },
    {href:`/${locale}/admin/diagnostics`,label:diagnosticsCopy[locale].title,icon:ScrollText,permission:"diagnostics.view"},
    {
      href: `/${locale}/admin/audit`,
      label: t.audit,
      icon: ScrollText,
      permission: "audit.view",
    },
    {
      href: `/${locale}/admin/outbox`,
      label: t.outbox,
      icon: Send,
      permission: "email.outbox",
    },
  ];
  const visibleItems = items.filter(
    (item) => !item.permission || can(me, item.permission),
  );

  const isActive = (href: string) =>
    href === `/${locale}/admin`
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`) ||
        (href === identityHref && ['users','roles','permissions','invitations'].some(section => pathname === `/${locale}/admin/${section}`));

  const titleFor = (path: string): string => {
    const rest = path
      .replace(new RegExp(`^/${locale}/admin/?`), "")
      .split("/")
      .filter(Boolean);
    const segment = rest[0] ?? "";
    const map: Record<string, string> = {
      users: t.users,
      roles: locale === 'ar' ? 'الأدوار' : 'Roles',
      permissions: locale === 'ar' ? 'دليل الصلاحيات' : 'Permission catalog',
      invitations: locale === 'ar' ? 'الدعوات' : 'Invitations',
      requests: t.requests,
      inquiries: t.inquiries,
      notifications: t.notifications,
      pages: t.pages,
      media: t.media,
      menus: t.menus,
      settings: t.settings,
      workflows: locale==='ar'?'مسارات العمل':'Workflows',
      diagnostics: diagnosticsCopy[locale].title,
      audit: t.audit,
      outbox: t.outbox,
    };
    return map[segment] ?? t.dashboard;
  };

  const otherLocaleHref = swapLocalePath(pathname, localeMeta[locale].other);
  const sheetSide = locale === "ar" ? "right" : "left";

  const groups = [
    { label: locale === "ar" ? "نظرة عامة" : "Overview", paths: ["", "notifications"] },
    { label: locale === "ar" ? "العمليات" : "Operations", paths: ["requests", "inquiries", "workflows"] },
    { label: locale === "ar" ? "المحتوى" : "Content", paths: ["pages", "media", "menus"] },
    { label: locale === "ar" ? "إدارة المنصة" : "Platform", paths: [identitySection, "settings"] },
    { label: locale === "ar" ? "المتابعة" : "Monitoring", paths: ["audit", "diagnostics", "outbox"] },
  ];
  const navList = (onNavigate?: () => void) => (
    <nav aria-label={locale === "ar" ? "أقسام الإدارة" : "Administration"} className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
      {groups.map(group => {
        const links = group.paths.flatMap(path => visibleItems.filter(item => item.href === `/${locale}/admin${path ? "/" + path : ""}`));
        if (!links.length) return null;
        return <div key={group.label}>
          <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">{group.label}</p>
          <ul className="space-y-1">{links.map(item => {
            const active = isActive(item.href);
            return <li key={item.href}><Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn("relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-(--duration-fast)", active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
              <item.icon className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{item.label}</span>
              {active && <span aria-hidden="true" className="ms-auto size-1.5 shrink-0 rounded-full bg-sidebar-primary" />}
            </Link></li>;
          })}</ul>
        </div>;
      })}
    </nav>
  );

  const sidebarFooter = (onNavigate?: () => void) => (
    <div className="border-t border-sidebar-border px-3 py-4">
      <Link
        href={`/${locale}`}
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-normal) hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Home className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{t.backSite}</span>
      </Link>
      <Link
        href={`/${locale}/auth/logout`}
        onClick={onNavigate}
        className="mt-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-normal) hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{t.logout}</span>
      </Link>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-primary"
          aria-hidden="true"
        >
          {me.name.trim().slice(0, 1).toUpperCase() || "·"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">{me.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {roleLabel(me.roleKey, locale)}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div id="admin-shell" className="flex min-h-dvh bg-background">
      {/* إخفاء ترويسة وتذييل الموقع العام وشريط الإعلان داخل اللوحة — اللوحة تطبيق مستقل */}
      <style>{`body:has(#admin-shell) > header, body:has(#admin-shell) > footer, body:has(#admin-shell) > #site-announcement { display: none !important; }`}</style>

      {/* الشريط الجانبي — سطح المكتب (مخفي عند الطباعة) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground print:hidden lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <Logo size="sm" nameLang={locale}/>
        </div>
        {navList()}
        {sidebarFooter()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* الشريط العلوي (مخفي عند الطباعة) */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 sm:gap-3 border-b border-border bg-card/90 px-3 backdrop-blur print:hidden sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-11 lg:hidden"
                aria-label={openMenuLabel}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={sheetSide}
              className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetHeader className="border-b border-sidebar-border p-0">
                <SheetTitle className="flex h-16 items-center gap-3 px-5 text-sidebar-foreground">
                  <Logo size="sm" nameLang={locale}/>
                </SheetTitle>
              </SheetHeader>
              {navList(() => setMobileOpen(false))}
              {sidebarFooter(() => setMobileOpen(false))}
            </SheetContent>
          </Sheet>

          <ThemeToggle locale={locale} compact/>
          <h2 className="hidden truncate text-sm font-semibold text-navy sm:block sm:text-base">
            {titleFor(pathname)}
          </h2>

          <div className="ms-auto flex items-center gap-2">
            {/* زر لوحة البحث الشامل — سطح المكتب: حبة تحمل الاختصار، الجوال: أيقونة */}
            <Button
              variant="outline"
              onClick={() => setPaletteOpen(true)}
              aria-keyshortcuts={isMac ? "Meta+k" : "Control+k"}
              className="hidden h-10 min-h-10 items-center gap-2 rounded-lg px-3 focus-visible:ring-2 focus-visible:ring-ring/40 sm:flex"
            >
              <Search
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-xs font-semibold text-muted-foreground">
                {ts.trigger}
              </span>
              <span className="ltr-isolate" aria-hidden="true">
                <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {isMac ? "⌘ K" : "Ctrl K"}
                </kbd>
              </span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPaletteOpen(true)}
              aria-label={ts.trigger}
              aria-keyshortcuts={isMac ? "Meta+k" : "Control+k"}
              className="size-11 sm:hidden"
            >
              <Search className="size-5" aria-hidden="true" />
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="relative size-11 rounded-full"
            >
              <Link
                href={`/${locale}/admin/notifications`}
                aria-label={unread > 0 ? `${tn.title} (${unread})` : tn.title}
              >
                <Bell className="size-5" aria-hidden="true" />
                {unread > 0 ? (
                  <span className="absolute -top-0.5 -end-0.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="min-h-9 rounded-lg px-3 text-xs font-semibold"
            >
              <Link href={otherLocaleHref} hrefLang={localeMeta[locale].other}>
                {localeMeta[locale].otherLabel}
              </Link>
            </Button>
            <div className="hidden items-center gap-2.5 rounded-full border border-border bg-card/90 py-1.5 pe-3 ps-1.5 shadow-sm backdrop-blur sm:flex">
              <span
                className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                aria-hidden="true"
              >
                {me.name.trim().slice(0, 1).toUpperCase() || "·"}
              </span>
              <p className="max-w-40 truncate text-sm font-medium text-navy">
                {me.name}
              </p>
            </div>
          </div>
        </header>

        {/* لوحة الأوامر الشاملة — تُفتح من الزر أعلاه أو Ctrl+K / ⌘K / «/» */}
        <CommandPalette
          me={me}
          locale={locale}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
        />

        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <Toaster position="top-center" closeButton toastOptions={{ classNames: { closeButton: "!size-6" } }} />
    </div>
  );
}
