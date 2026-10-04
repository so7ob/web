import type { AccountPayload, AccountIdentity } from "./account.js";
import type { AdminPayload, AdminIdentity } from "./admin.js";
export interface PublicPage {
  id: string;
  slug: string;
  titleAr: string;
  titleEn: string;
  seoTitleAr: string | null;
  seoTitleEn: string | null;
  seoDescAr: string | null;
  seoDescEn: string | null;
  publishedBlocksAr: string | null;
  publishedBlocksEn: string | null;
  restricted: boolean;
}
export interface SiteViewBase {
  locale: "ar" | "en";
  menus: Array<{
    location: string;
    labelAr: string;
    labelEn: string;
    url: string | null;
    pageSlug: string | null;
    order: number;
    enabled: boolean;
  }>;
  settings: Record<string, string>;
  canonicalOrigin: string;
  viewer: { name: string; roleKey: string } | null;
}
export const authScreens = [
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "invite",
  "verified",
  "logout",
] as const;
export type AuthScreen = (typeof authScreens)[number];
export type PublicView =
  | (SiteViewBase & { kind: "cms"; page: PublicPage })
  | (SiteViewBase & {
      kind: "auth";
      screen: AuthScreen;
      parameters: { token: string; next: string; status: string };
    })
  | (SiteViewBase & {
      kind: "account";
      account: AccountPayload;
      user: AccountIdentity;
    })
  | (SiteViewBase & { kind: "admin"; admin: AdminPayload; user: AdminIdentity })
  | (SiteViewBase & { kind: "track"; parameters: {token:string;cardParam:string} })
  | (SiteViewBase & { kind: "not-found" });
