export interface PublicPage {
  id: string; slug: string; titleAr: string; titleEn: string;
  seoTitleAr: string | null; seoTitleEn: string | null;
  seoDescAr: string | null; seoDescEn: string | null;
  publishedBlocksAr: string | null; publishedBlocksEn: string | null;
}
export interface PublicView {
  kind: 'cms'; locale: 'ar' | 'en'; page: PublicPage;
  menus: Array<{ location: string; labelAr: string; labelEn: string; url: string | null; pageSlug: string | null; order: number; enabled: boolean }>;
  settings: Record<string, string>; canonicalOrigin: string;
  viewer: { name: string; roleKey: string } | null;
}
