import { Injectable, NotFoundException } from '@nestjs/common';
import { database } from '@so7ob/server';
import type { PublicPage, PublicView } from '@so7ob/contracts';
const settingsKeys = ['contact.email','contact.phone','contact.address','social.github','site.nameAr','site.nameEn','announcement.enabled','announcement.messageAr','announcement.messageEn','announcement.ctaLabelAr','announcement.ctaLabelEn','announcement.ctaUrl','announcement.variant','announcement.revision','announcement.startAt','announcement.endAt'];
function schedule(value: string, end = false): number | null {
  if (!value) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!day && !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = new Date(day ? `${value}T${end ? '23:59:59' : '00:00:00'}` : value).getTime();
  return Number.isNaN(time) ? null : time;
}
@Injectable()
export class PublicService {
  async view(path: string): Promise<PublicView | { redirect: string }> {
    const url = new URL(path, 'http://local.invalid');
    const match = /^\/(ar|en)(?:\/(.*))?$/.exec(url.pathname);
    if (!match) throw new NotFoundException();
    const locale = match[1] as 'ar' | 'en'; const slug = decodeURIComponent(match[2] || '').toLowerCase();
    const db = await database();
    // Explicit publication projection: drafts, allowed-role lists and internal fields never reach this DTO.
    const pages: PublicPage[] = await db.query('SELECT id,slug,titleAr,titleEn,seoTitleAr,seoTitleEn,seoDescAr,seoDescEn,publishedBlocksAr,publishedBlocksEn FROM Page WHERE slug=? AND status=? AND visibility=? LIMIT 1', [slug, 'published', 'public']);
    const page = pages[0];
    if (!page) {
      const redirects: Array<{ toSlug: string }> = await db.query('SELECT toSlug FROM PageRedirect WHERE fromSlug=? LIMIT 1', [slug]);
      if (redirects[0]) return { redirect: `/${locale}${redirects[0].toSlug ? '/' + redirects[0].toSlug : ''}` };
      throw new NotFoundException();
    }
    const blocks = locale === 'ar' ? page.publishedBlocksAr : page.publishedBlocksEn;
    try { if (!Array.isArray(JSON.parse(blocks ?? '[]')) || JSON.parse(blocks ?? '[]').length === 0) throw new Error(); }
    catch { throw new NotFoundException(); }
    const [menus, rows]: [PublicView['menus'], Array<{ key: string; value: string }>] = await Promise.all([
      db.query('SELECT location,labelAr,labelEn,url,pageSlug,`order`,enabled FROM MenuItem WHERE enabled=1 ORDER BY `order` ASC'),
      db.query(`SELECT \`key\`,value FROM SiteSetting WHERE \`key\` IN (${settingsKeys.map(() => '?').join(',')})`, settingsKeys),
    ]);
    const settings = Object.fromEntries(rows.map(row => [row.key, row.value]));
    const start = schedule(settings['announcement.startAt']); const end = schedule(settings['announcement.endAt'], true); const now = Date.now();
    settings['announcement.visible'] = String(settings['announcement.enabled'] === 'true' && !(start !== null && now < start) && !(end !== null && now > end));
    return { kind: 'cms', locale, page, menus, settings, canonicalOrigin: (process.env.SITE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, ''), viewer: null };
  }
}
