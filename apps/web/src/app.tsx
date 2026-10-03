import { useLoaderData, Outlet, useRouteError, isRouteErrorResponse, ScrollRestoration, type LoaderFunction, type RouteObject } from 'react-router-dom';
import type { PublicView } from '@so7ob/contracts';
import { ar } from './content/ar';
import { en } from './content/en';
import { getPortalContent } from './content/portal';
import { SiteHeader } from './components/site/site-header';
import { SiteFooter } from './components/site/site-footer';
import { AnnouncementBar } from './components/site/announcement-bar';
import { NotFound } from './screens/not-found';
import { siteConfig } from './config/site';
import type { NavLink, SiteSettings, AnnouncementVariant } from './lib/site-data';
function presentation(data: PublicView) {
  const locale = data.locale; const content = locale === 'ar' ? ar : en; const values = data.settings;
  const menu = (location: string): NavLink[] => {
    const rows = data.menus.filter(m => m.location === location && m.enabled);
    if (!rows.length) return (['about', 'services', 'works', 'process', 'faq', 'contact'] as const).map((key, order) => ({ label: content.nav[key], href: `/${locale}/${key}`, enabled: true, order }));
    return rows.map(m => ({ label: locale === 'ar' ? m.labelAr : m.labelEn, href: m.url ?? (m.pageSlug === null ? '#' : `/${locale}${m.pageSlug ? '/' + m.pageSlug : ''}`), enabled: m.enabled, order: m.order }));
  };
  const settings: SiteSettings = {
    nameAr: values['site.nameAr'] || siteConfig.nameAr, nameEn: values['site.nameEn'] || siteConfig.nameEn,
    contactEmail: values['contact.email'] || siteConfig.contact.email, contactPhone: values['contact.phone'] || siteConfig.contact.phone,
    contactAddress: values['contact.address'] || siteConfig.contact.address, socialGithub: values['social.github'] || siteConfig.github,
    announcement: { enabled: values['announcement.visible'] === 'true', messageAr: values['announcement.messageAr'] ?? '', messageEn: values['announcement.messageEn'] ?? '', ctaLabelAr: values['announcement.ctaLabelAr'] ?? '', ctaLabelEn: values['announcement.ctaLabelEn'] ?? '', ctaUrl: values['announcement.ctaUrl'] ?? '', variant: (values['announcement.variant'] || 'info') as AnnouncementVariant, startAt: values['announcement.startAt'] ?? '', endAt: values['announcement.endAt'] ?? '', revision: values['announcement.revision'] ?? '' },
  };
  return { content, settings, header: menu('header'), footer: menu('footer') };
}
export function App() {
  const data = useLoaderData<PublicView>();
  if (data.kind === 'not-found') return <NotFound />;
  const { content, settings, header, footer } = presentation(data);
  const portal = getPortalContent(data.locale);
  return <>
    <AnnouncementBar announcement={settings.announcement} locale={data.locale} labels={{ ariaLabel: portal.announce.ariaLabel, dismiss: portal.announce.dismiss }} />
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-navy focus:px-4 focus:py-2 focus:text-white">{content.common.skipToContent}</a>
    <SiteHeader locale={data.locale} content={content} items={header} auth={{ loggedIn: !!data.viewer, isStaff: !!data.viewer && data.viewer.roleKey !== 'client', accountLabel: portal.account.nav.dashboard, adminLabel: portal.admin.nav.dashboard, loginLabel: portal.auth.loginTitle }} />
    <main id="main-content" className="flex-1 overflow-x-clip"><Outlet /></main>
    <SiteFooter locale={data.locale} content={content} settings={settings} items={footer} />
    <ScrollRestoration />
  </>;
}
function RouteError() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return status === 404 ? <NotFound /> : <main id="main-content" className="p-12"><h1>{status}</h1><a href="/ar">سُحُب — so7ob</a></main>;
}
export const routes = (loader: LoaderFunction): RouteObject[] => [{ id: 'root', path: '/', loader, shouldRevalidate: () => true, Component: App, ErrorBoundary: RouteError,
  children: [{ path: ':locale/auth/:screen', lazy: () => import('./screens/auth') }, { path: '*', lazy: () => import('./screens/cms') }],
}];
