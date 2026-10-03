import type { PublicView } from "@so7ob/contracts";
import { ar } from "./content/ar";
import { en } from "./content/en";
import { getPortalContent } from "./content/portal";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function headMarkup(data: PublicView): string {
  const isAr = data.locale === "ar";
  const meta = (isAr ? ar : en).meta;
  const auth = getPortalContent(data.locale).auth;
  let title = meta.pages.home.title,
    description = meta.pages.home.description,
    ogTitle = title,
    robots = "index, follow",
    alternates = "",
    ogUrl = "";
  if (data.kind === "cms") {
    const page = data.page;
    ogTitle =
      (isAr ? page.seoTitleAr : page.seoTitleEn) ??
      (isAr ? page.titleAr : page.titleEn);
    title = ogTitle + " | " + meta.shortName;
    description =
      (isAr ? page.seoDescAr : page.seoDescEn) ?? meta.pages.home.description;
    robots = page.restricted ? "noindex, nofollow" : "index, follow";
    const path = (locale: string) =>
      data.canonicalOrigin + "/" + locale + (page.slug ? "/" + page.slug : "");
    alternates = `<link data-so7ob-meta rel="canonical" href="${escape(path(data.locale))}">${["ar", "en", "x-default"].map((l) => `<link data-so7ob-meta rel="alternate" hreflang="${l}" href="${escape(l === "x-default" ? data.canonicalOrigin + "/ar" : path(l))}">`).join("")}`;
    ogUrl = `<meta data-so7ob-meta property="og:url" content="${escape(path(data.locale))}">`;
  } else if (data.kind === "auth") {
    const names = {
      login: auth.loginTitle,
      register: auth.registerTitle,
      "forgot-password": auth.forgotTitle,
      "reset-password": auth.resetTitle,
      invite: auth.registerTitle,
      verified: auth.verifyTitle,
      logout: meta.pages.home.title,
    };
    title =
      data.screen === "logout"
        ? meta.pages.home.title
        : names[data.screen] + " | " + meta.shortName;
    ogTitle = title;
    if (["logout", "reset-password", "invite"].includes(data.screen))
      robots = "noindex, nofollow";
  } else if (data.kind === "account") {
    const portal = getPortalContent(data.locale).account;
    const titles = {
      dashboard: portal.dashboard.title,
      requests: portal.requests.title,
      "new-request": portal.nav.newRequest,
      "request-detail": portal.requests.title,
      inquiries: portal.inquiries.title,
      "inquiry-detail": portal.inquiries.title,
      profile: portal.profile.title,
      security: portal.security.title,
      notifications: portal.notifications.title,
    };
    title = titles[data.account.screen] + " | " + meta.shortName;
    ogTitle = title;
  } else if (data.kind === "admin") {
    title =
      getPortalContent(data.locale).admin.nav.dashboard +
      " | " +
      meta.shortName;
    ogTitle = title;
    robots = "noindex, nofollow";
  } else robots = "noindex, nofollow";
  const tag = (name: string, value: string, property = false) =>
    `<meta data-so7ob-meta ${property ? "property" : "name"}="${name}" content="${escape(value)}">`;
  return (
    `<title data-so7ob-meta>${escape(title)}</title>` +
    tag("description", description) +
    tag("application-name", meta.siteName) +
    tag("robots", robots) +
    alternates +
    tag("og:title", ogTitle, true) +
    tag("og:description", description, true) +
    ogUrl +
    (data.kind === "cms"
      ? ""
      : tag("og:site_name", meta.siteName, true) +
        tag("og:type", "website", true)) +
    tag("og:locale", isAr ? "ar_SA" : "en_US", true) +
    tag("og:locale:alternate", isAr ? "en_US" : "ar_SA", true) +
    tag("twitter:card", "summary") +
    tag("twitter:title", ogTitle) +
    tag("twitter:description", description)
  );
}
export function updateMetadata(data: PublicView): void {
  document.documentElement.lang = data.locale;
  document.documentElement.dir = data.locale === "ar" ? "rtl" : "ltr";
  for (const element of document.head.querySelectorAll("[data-so7ob-meta]"))
    element.remove();
  const template = document.createElement("template");
  template.innerHTML = headMarkup(data);
  document.head.append(template.content);
}
