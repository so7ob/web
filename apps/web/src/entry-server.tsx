import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router-dom';
import type { PublicView } from '@so7ob/contracts';
import { routes } from './app';
import { ar } from './content/ar';
import { en } from './content/en';
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export async function render(url: string, data: PublicView) {
  const handler = createStaticHandler(routes(() => data)); const context = await handler.query(new Request(url));
  if (context instanceof Response) throw context;
  const html = renderToString(<StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} hydrate={false} />);
  const { page, locale } = data; const isAr = locale === 'ar'; const meta = (isAr ? ar : en).meta;
  const title = (isAr ? page.seoTitleAr : page.seoTitleEn) ?? (isAr ? page.titleAr : page.titleEn);
  const description = (isAr ? page.seoDescAr : page.seoDescEn) ?? meta.pages.home.description;
  const path = (l: string) => `${data.canonicalOrigin}/${l}${page.slug ? '/' + page.slug : ''}`;
  const head = `<title>${escape(title)} | ${escape(meta.shortName)}</title><meta name="description" content="${escape(description)}"><meta name="application-name" content="${escape(meta.siteName)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${escape(path(locale))}"><link rel="alternate" hreflang="ar" href="${escape(path('ar'))}"><link rel="alternate" hreflang="en" href="${escape(path('en'))}"><link rel="alternate" hreflang="x-default" href="${escape(data.canonicalOrigin + '/ar')}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(path(locale))}"><meta property="og:site_name" content="${escape(meta.siteName)}"><meta property="og:type" content="website"><meta property="og:locale" content="${isAr ? 'ar_SA' : 'en_US'}"><meta property="og:locale:alternate" content="${isAr ? 'en_US' : 'ar_SA'}">`;
  return { html, head, lang: locale, dir: isAr ? 'rtl' : 'ltr' };
}
