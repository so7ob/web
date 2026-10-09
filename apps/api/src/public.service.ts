import { Injectable, NotFoundException } from "@nestjs/common";
import {
  database,
  PortalService,
  AdminDashboardService,
  formatAdminDashboard,
  PageAdministrationService,
} from "@so7ob/server";
import {
  authScreens,
  can,
  validateBlocks,
  validateContent,
  loadContentForRender,
  parsePageSettings,
  canAccessPage,
  type AdminPayload,
  type AdminScreen,
  type Permission,
  type AccountPayload,
  type AuthScreen,
  type AuthUser,
  type SiteViewBase,
  type PublicPage,
  type PublicView,
} from "@so7ob/contracts";
const settingsKeys = [
  "contact.email",
  "contact.phone",
  "contact.address",
  "social.github",
  "site.nameAr",
  "site.nameEn",
  "announcement.enabled",
  "announcement.messageAr",
  "announcement.messageEn",
  "announcement.ctaLabelAr",
  "announcement.ctaLabelEn",
  "announcement.ctaUrl",
  "announcement.variant",
  "announcement.revision",
  "announcement.startAt",
  "announcement.endAt",
];
function schedule(value: string, end = false): number | null {
  if (!value) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!day && !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = new Date(
    day ? `${value}T${end ? "23:59:59" : "00:00:00"}` : value,
  ).getTime();
  return Number.isNaN(time) ? null : time;
}
@Injectable()
export class PublicService {
  async view(
    path: string,
    viewer: AuthUser | null = null,
  ): Promise<PublicView | { redirect: string }> {
    const url = new URL(path, "http://local.invalid");
    const match = /^\/(ar|en)(?:\/(.*))?$/.exec(url.pathname);
    if (!match) throw new NotFoundException();
    const locale = match[1] as "ar" | "en";
    let slug: string;
    let decoded: string;
    try {
      decoded = decodeURIComponent(match[2] || "");
      slug = decoded.toLowerCase();
    } catch {
      throw new NotFoundException();
    }
    const db = await database();
    const shell = await this.shell(locale, viewer);
    if (slug === "track") return {...shell,kind:"track",parameters:{token:url.searchParams.get("t")??"",cardParam:url.searchParams.get("card")??""}};
    const adminRoute =
      /^admin(?:\/(users(?:\/([^/]+))?|requests(?:\/([^/]+))?|inquiries(?:\/([^/]+))?|pages(?:\/([^/]+)\/(edit|preview))?|notifications|media|menus|settings|audit|outbox))?\/?$/.exec(
        decoded,
      );
    if (adminRoute) {
      if (!viewer)
        return {
          redirect: `/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/admin`)}`,
        };
      if (!can(viewer, "admin.dashboard"))
        return { redirect: `/${locale}/account` };
      const section = adminRoute[1]?.split("/")[0] ?? "dashboard";
      const permissions: Record<string, Permission> = {
        users: "users.view",
        requests: "requests.view.all",
        inquiries: "inquiries.view.all",
        pages: adminRoute[6] === "edit" ? "pages.edit" : "pages.view",
        media: "media.manage",
        menus: "menus.manage",
        settings: "settings.manage",
        audit: "audit.view",
        outbox: "email.outbox",
      };
      if (permissions[section] && !can(viewer, permissions[section]))
        return { redirect: `/${locale}/admin` };
      const id =
        adminRoute[2] ?? adminRoute[3] ?? adminRoute[4] ?? adminRoute[5];
      const screen: AdminScreen =
        section === "pages" && id
          ? adminRoute[6] === "edit"
            ? "page-editor"
            : "page-preview"
          : id
            ? (
                {
                  users: "user-detail",
                  requests: "request-detail",
                  inquiries: "inquiry-detail",
                } as const
              )[section as "users" | "requests" | "inquiries"]
            : (section as AdminScreen);
      const admin: AdminPayload = { screen, ...(id ? { id } : {}) };
      if (screen === "dashboard") {
        const data = await new AdminDashboardService(db).dashboard(
          viewer,
          url.searchParams.get("range"),
        );
        admin.dashboard = {
          ...data,
          presentation: formatAdminDashboard(data, locale),
        };
      }
      if (screen === "page-preview") {
        const result = await new PageAdministrationService(db).detail(
            viewer,
            id!,
          ),
          contentLocale =
            url.searchParams.get("locale") === "en"
              ? "en"
              : url.searchParams.get("locale") === "ar"
                ? "ar"
                : locale;
        const checked = validateBlocks(
            contentLocale === "ar"
              ? result.page.draftBlocksAr
              : result.page.draftBlocksEn,
          ),
          rawDevice = url.searchParams.get("device");
        admin.preview = {
          blocks: checked.ok ? checked.blocks : [],
          nodes: (() => { const tree = validateContent(contentLocale === "ar" ? result.page.draftBlocksAr : result.page.draftBlocksEn); return tree.ok ? tree.tree : undefined; })(),
          locale: contentLocale,
          device:
            rawDevice === "tablet" || rawDevice === "mobile"
              ? rawDevice
              : "desktop",
        };
      }
      const {
        id: userId,
        name,
        email,
        roleKey,
        locale: userLocale,
        permissions: userPermissions,
      } = viewer;
      return {
        ...shell,
        kind: "admin",
        admin,
        user: {
          id: userId,
          name,
          email,
          roleKey,
          locale: userLocale,
          permissions: userPermissions,
        },
      };
    }
    const accountRoute =
      /^account(?:\/(requests(?:\/([^/]+))?|inquiries(?:\/([^/]+))?|profile|security|notifications))?\/?$/.exec(
        decoded,
      );
    if (accountRoute) {
      if (!viewer)
        return { redirect: `/${locale}/auth/login?next=/${locale}/account` };
      const portal = new PortalService(db);
      let account: AccountPayload;
      if (!accountRoute[1])
        account = {
          screen: "dashboard",
          dashboard: await portal.dashboard(viewer, locale),
        };
      else if (accountRoute[1] === "profile")
        account = { screen: "profile", profile: await portal.profile(viewer) };
      else if (accountRoute[2])
        account =
          accountRoute[2] === "new"
            ? { screen: "new-request" }
            : { screen: "request-detail", id: accountRoute[2] };
      else if (accountRoute[3])
        account = { screen: "inquiry-detail", id: accountRoute[3] };
      else
        account = {
          screen: accountRoute[1] as
            | "requests"
            | "inquiries"
            | "security"
            | "notifications",
        };
      return {
        ...shell,
        kind: "account",
        account,
        user: {
          name: viewer.name,
          email: viewer.email,
          roleKey: viewer.roleKey,
          emailVerified: viewer.emailVerified,
        },
      };
    }
    const screen = /^auth\/([^/]+)$/.exec(slug)?.[1];
    if (screen && (authScreens as readonly string[]).includes(screen))
      return {
        ...shell,
        kind: "auth",
        screen: screen as AuthScreen,
        parameters: {
          token: url.searchParams.get("token") ?? "",
          next: url.searchParams.get("next") ?? "",
          status: url.searchParams.get("status") ?? "",
        },
      };
    // Explicit publication projection: drafts, allowed-role lists and internal fields never reach this DTO.
    const pages: Array<
      Omit<PublicPage, "restricted"> & {
        visibility: string;
        allowedRoles: string;
        publishedSettings: string | null;
      }
    > = await db.query(
      "SELECT id,slug,titleAr,titleEn,seoTitleAr,seoTitleEn,seoDescAr,seoDescEn,publishedBlocksAr,publishedBlocksEn,visibility,allowedRoles,publishedSettings FROM Page WHERE slug=? AND status=? LIMIT 1",
      [slug, "published"],
    );
    const stored = pages[0];
    if (!stored) {
      const redirects: Array<{ toSlug: string }> = await db.query(
        "SELECT toSlug FROM PageRedirect WHERE fromSlug=? LIMIT 1",
        [slug],
      );
      if (redirects[0])
        return {
          redirect: `/${locale}${redirects[0].toSlug ? "/" + redirects[0].toSlug : ""}`,
        };
      throw new NotFoundException();
    }
    if (stored.visibility !== "public" && !viewer)
      return {
        redirect: `/${locale}/auth/login?next=/${locale}${slug ? "/" + slug : ""}`,
      };
    if (!canAccessPage(viewer, stored)) throw new NotFoundException();
    const { visibility, allowedRoles, publishedSettings, ...published } = stored;
    const settings = parsePageSettings(publishedSettings, stored);
    void allowedRoles; // Authorization-only metadata is deliberately omitted from the DTO.
    const page: PublicPage = {
      ...published,
      titleAr: settings.titleAr, titleEn: settings.titleEn,
      seoTitleAr: settings.seoTitleAr, seoTitleEn: settings.seoTitleEn,
      seoDescAr: settings.seoDescAr, seoDescEn: settings.seoDescEn,
      restricted: visibility !== "public",
    };
    const blocks =
      locale === "ar" ? page.publishedBlocksAr : page.publishedBlocksEn;
    let parsed: unknown;
    try { parsed = JSON.parse(blocks ?? "[]"); } catch { throw new NotFoundException(); }
    if (Array.isArray(parsed)) {
      // Keep the accepted v0 contract during the staged editor migration.
      if (parsed.length === 0) throw new NotFoundException();
    } else {
      const rendered = loadContentForRender(blocks);
      if (!rendered.ok || rendered.tree.length === 0) throw new NotFoundException();
    }
    return { ...shell, kind: "cms", page };
  }
  async shell(
    locale: "ar" | "en",
    viewer: AuthUser | null,
  ): Promise<SiteViewBase> {
    const db = await database();
    const [menus, rows]: [
      PublicView["menus"],
      Array<{ key: string; value: string }>,
    ] = await Promise.all([
      db.query(
        "SELECT location,labelAr,labelEn,url,pageSlug,`order`,enabled FROM MenuItem WHERE enabled=1 ORDER BY `order` ASC",
      ),
      db.query(
        `SELECT \`key\`,value FROM SiteSetting WHERE \`key\` IN (${settingsKeys.map(() => "?").join(",")})`,
        settingsKeys,
      ),
    ]);
    const settings = Object.fromEntries(
      rows.map((row) => [row.key, row.value]),
    );
    const start = schedule(settings["announcement.startAt"]);
    const end = schedule(settings["announcement.endAt"], true);
    const now = Date.now();
    settings["announcement.visible"] = String(
      settings["announcement.enabled"] === "true" &&
        !(start !== null && now < start) &&
        !(end !== null && now > end),
    );
    return {
      locale,
      menus,
      settings,
      canonicalOrigin: (
        process.env.SITE_URL ?? "http://127.0.0.1:3000"
      ).replace(/\/+$/, ""),
      viewer: viewer ? { name: viewer.name, roleKey: viewer.roleKey } : null,
    };
  }
}
