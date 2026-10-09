import {assertMediaReferences} from "../files/media-usage.js";
import type { DataSource, QueryRunner } from 'typeorm';
import { can, isValidSlug, parsePageSettings, serializePageSettings, settingsFromInput, validateContent, parseScheduleInput, decideScheduledPublish, type AuthUser, type Permission, type PageSettings } from '@so7ob/contracts';
import type { Page } from '../database/models.js';
import { AuthFault, audit, newId, transaction } from '../auth/persistence.js';
import { insertRecord, lockOperation } from '../business/persistence.js';
type Locale = 'ar' | 'en';
function field(locale: Locale, prefix: 'draft'): 'draftBlocksAr' | 'draftBlocksEn';
function field(locale: Locale, prefix: 'published'): 'publishedBlocksAr' | 'publishedBlocksEn';
function field(locale: Locale, prefix: 'draft' | 'published') { return `${prefix}Blocks${locale === 'ar' ? 'Ar' : 'En'}`; }
const permit = (actor: AuthUser, permission: Permission) => { if (!can(actor, permission))
    throw new AuthFault(403, 'forbidden'); };
export const revision = (page: Page, value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value))
        throw new AuthFault(409, 'revision_required');
    if (value !== page.draftRevision)
        throw new AuthFault(409, 'conflict', { serverRevision: page.draftRevision });
};
export async function lockedPage(r: QueryRunner, id: string): Promise<Page> {
    await lockOperation(r, 'cms-pages');
    const [p]: Page[] = await r.query('SELECT * FROM Page WHERE id=? FOR UPDATE', [id]);
    if (!p)
        throw new AuthFault(404, 'not_found');
    return p;
}
const editable = (p: Page) => { if (p.status === 'archived')
    throw new AuthFault(409, 'archived'); };
export async function writePage(r: QueryRunner, id: string, data: Record<string, unknown>) {
    await assertMediaReferences(r,data);
    await r.query(`UPDATE Page SET ${Object.keys(data).map(k => '`' + k + '`=?').join(',')},updatedAt=UTC_TIMESTAMP(3) WHERE id=?`, [...Object.values(data), id]);
}
function document(raw: string) {
    const result = validateContent(raw);
    if (!result.ok)
        throw new AuthFault(400, 'invalid_blocks', { error: result.error });
    return result;
}
function locales(body: Record<string, unknown>, restore = false): Locale[] {
    const raw = Array.isArray(body.locales) ? body.locales : restore ? [body.locale] : ['ar', 'en'];
    const selected = [...new Set(raw.filter((l): l is Locale => l === 'ar' || l === 'en'))];
    if (!selected.length)
        throw new AuthFault(400, restore ? 'locale_required' : 'invalid');
    return selected;
}
async function validateSlug(r: QueryRunner, p: Page, settings: PageSettings) {
    if (!isValidSlug(settings.slug))
        throw new AuthFault(400, 'invalid_slug');
    if (settings.slug === '' && !p.isHome)
        throw new AuthFault(400, 'home_slug');
    if ((await r.query('SELECT id FROM Page WHERE slug=? AND id<>?', [settings.slug, p.id])).length)
        throw new AuthFault(409, 'slug_taken');
    if (settings.slug !== p.slug && (await r.query('SELECT id FROM PageRedirect WHERE fromSlug=?', [settings.slug])).length)
        throw new AuthFault(409, 'redirect_loop');
    const others: Array<{
        draftSettings: string;
    }> = await r.query('SELECT draftSettings FROM Page WHERE id<>?', [p.id]);
    if (others.some(o => o.draftSettings !== '{}' && parsePageSettings(o.draftSettings, {}).slug === settings.slug))
        throw new AuthFault(409, 'slug_taken');
}
async function backup(r: QueryRunner, p: Page, locale: Locale, actor: AuthUser, note: string | null) {
    const [last]: Array<{
        version: number;
        blocks: string;
    }> = await r.query('SELECT version,blocks FROM PageVersion WHERE pageId=? AND locale=? ORDER BY version DESC LIMIT 1', [p.id, locale]);
    const blocks = p[field(locale, 'draft')];
    if (last?.blocks === blocks)
        return false;
    await insertRecord(r, 'PageVersion', { id: newId(), pageId: p.id, locale, version: (last?.version ?? 0) + 1, blocks, authorId: actor.id, note });
    return true;
}
const stamp = (p: Page) => new Date(Math.max(Date.now(), (p.draftUpdatedAt?.getTime() ?? 0) + 1));
/** Shared transactional publication core for explicit-revision HTTP and independent workers. */
export class PagePublicationService {
    constructor(private readonly db: DataSource) { }
    async save(actor: AuthUser, id: string, body: Record<string, unknown>) {
        permit(actor, 'pages.edit');
        return transaction(this.db, async (r) => {
            const p = await lockedPage(r, id);
            editable(p);
            revision(p, body.baseRevision);
            const data: Record<string, unknown> = {};
            let settings = parsePageSettings(p.draftSettings, p);
            for (const key of ['draftBlocksAr', 'draftBlocksEn'] as const)
                if (typeof body[key] === 'string')
                    data[key] = document(body[key]).json;
            if (body.draftSettings !== undefined) {
                const incoming = settingsFromInput(body.draftSettings);
                if (!incoming)
                    throw new AuthFault(400, 'invalid_settings');
                await validateSlug(r, p, incoming);
                settings = incoming;
                data.draftSettings = serializePageSettings(settings);
            }
            if (!Object.keys(data).length)
                throw new AuthFault(400, 'invalid');
            for (const key of ['titleAr', 'titleEn'])
                if (typeof body[key] === 'string')
                    data[key] = body[key].slice(0, 200);
            const now = stamp(p);
            await writePage(r, id, { ...data, draftRevision: p.draftRevision + 1, draftUpdatedAt: now, draftUpdatedById: actor.id, editorTouchedAt: now });
            await audit(r, 'page.draft_saved', actor, { slug: p.slug, revision: p.draftRevision + 1 }, 'page', id);
            return { ok: true, page: { id, slug: p.slug, status: p.status, draftUpdatedAt: now, draftRevision: p.draftRevision + 1, draftSettings: settings } };
        });
    }
    async publish(actor: AuthUser, id: string, body: Record<string, unknown>) {
        permit(actor, 'pages.publish');
        const selected = locales(body);
        return transaction(this.db, async (r) => {
            const p = await lockedPage(r, id);
            editable(p);
            revision(p, body.baseRevision);
            return this.publishLocked(r, p, actor, selected, 'manual');
        });
    }
    private async publishLocked(r: QueryRunner, p: Page, actor: AuthUser, selected: Locale[], via: 'manual' | 'scheduled') {
        const [user] = await r.query('SELECT status FROM User WHERE id=?', [actor.id]);
        if (user?.status !== 'active')
            throw new AuthFault(403, 'actor_inactive');
        const settings = parsePageSettings(p.draftSettings, p);
        await validateSlug(r, p, settings);
        const data: Record<string, unknown> = {};
        let nonempty = false;
        for (const locale of selected) {
            const content = document(p[field(locale, 'draft')]);
            nonempty ||= content.tree.length > 0;
            data[field(locale, 'published')] = content.tree.length ? content.json : null;
        }
        if (!nonempty)
            throw new AuthFault(400, 'empty_page');
        const now = new Date();
        await writePage(r, p.id, { ...data, slug: settings.slug, visibility: settings.visibility, allowedRoles: JSON.stringify(settings.allowedRoles), seoTitleAr: settings.seoTitleAr, seoTitleEn: settings.seoTitleEn, seoDescAr: settings.seoDescAr, seoDescEn: settings.seoDescEn, order: settings.order, publishedSettings: serializePageSettings(settings), publishedAt: now, publishedById: actor.id, publishedRevision: p.draftRevision, status: 'published' });
        for (const locale of selected)
            await backup(r, p, locale, actor, via === 'scheduled' ? 'scheduled' : null);
        if (p.slug && p.slug !== settings.slug)
            await r.query('INSERT INTO PageRedirect(id,fromSlug,toSlug) VALUES(?,?,?) ON DUPLICATE KEY UPDATE toSlug=VALUES(toSlug)', [newId(), p.slug, settings.slug]);
        await audit(r, 'page.published', actor, { slug: settings.slug, locales: selected, revision: p.draftRevision, via }, 'page', p.id);
        const recipients: Array<{
            id: string;
            locale: string;
        }> = await r.query("SELECT id,locale FROM User WHERE status='active' AND roleKey IN ('super_admin','content_editor','ops_manager') AND id<>?", [actor.id]);
        if (recipients.length)
            await r.query('INSERT INTO Notification(id,userId,type,payload,link) VALUES ' + recipients.map(() => '(?,?,?,?,?)').join(','), recipients.flatMap(u => [newId(), u.id, 'content_published', JSON.stringify({ slug: settings.slug || 'home', title: p.titleAr }), `/${u.locale === 'en' ? 'en' : 'ar'}/admin/pages`]));
        return { ok: true, publishedAt: now, page: { slug: settings.slug, status: 'published', draftRevision: p.draftRevision, publishedRevision: p.draftRevision, hasUnpublishedChanges: false } };
    }
    async discard(actor: AuthUser, id: string, body: Record<string, unknown>) {
        permit(actor, 'pages.edit');
        return transaction(this.db, async (r) => {
            const p = await lockedPage(r, id);
            editable(p);
            revision(p, body.baseRevision);
            if (p.publishedRevision === null || p.publishedAt === null)
                throw new AuthFault(409, 'not_discardable');
            if (p.draftRevision === p.publishedRevision)
                throw new AuthFault(409, 'nothing_to_discard');
            // Never reuse a revision: source rewinds create an ABA lost-update/scheduling hazard.
            const next = p.draftRevision + 1, now = stamp(p);
            await writePage(r, id, { draftBlocksAr: p.publishedBlocksAr ?? '[]', draftBlocksEn: p.publishedBlocksEn ?? '[]', draftSettings: p.publishedSettings ?? p.draftSettings, draftRevision: next, publishedRevision: next, draftUpdatedAt: now, draftUpdatedById: actor.id, editorTouchedAt: now });
            await audit(r, 'page.draft_discarded', actor, { slug: p.slug, revertedFromRevision: p.draftRevision, revision: next }, 'page', id);
            return { ok: true, page: { slug: p.slug, draftRevision: next, publishedRevision: next, hasUnpublishedChanges: false, draftUpdatedAt: now } };
        });
    }
    async restore(actor: AuthUser, id: string, rawVersion: string, body: Record<string, unknown>) {
        permit(actor, 'pages.restore');
        const version = Number(rawVersion), selected = locales(body, true);
        if (!Number.isInteger(version) || version < 1)
            throw new AuthFault(400, 'invalid');
        return transaction(this.db, async (r) => {
            const p = await lockedPage(r, id);
            editable(p);
            revision(p, body.baseRevision);
            const data: Record<string, unknown> = {};
            for (const locale of selected) {
                const [v] = await r.query('SELECT blocks FROM PageVersion WHERE pageId=? AND locale=? AND version=?', [id, locale, version]);
                if (!v)
                    throw new AuthFault(404, 'version_not_found', { locale });
                data[field(locale, 'draft')] = document(v.blocks).json;
            }
            let backupCreated = false;
            for (const locale of selected)
                backupCreated = (await backup(r, p, locale, actor, 'auto-backup-before-restore')) || backupCreated;
            const now = stamp(p);
            await writePage(r, id, { ...data, draftRevision: p.draftRevision + 1, draftUpdatedAt: now, draftUpdatedById: actor.id, editorTouchedAt: now });
            await audit(r, 'page.version_restored', actor, { version, locales: selected, slug: p.slug, backupCreated }, 'page', id);
            return { ok: true, restoredVersion: version, locales: selected, draftRevision: p.draftRevision + 1, draftUpdatedAt: now };
        });
    }
    async schedule(actor: AuthUser, id: string, body: Record<string, unknown>) {
        permit(actor, 'pages.publish');
        return transaction(this.db, async (r) => {
            const p = await lockedPage(r, id);
            editable(p);
            if (body.publishAt === null) {
                if (!p.scheduledPublishAt)
                    throw new AuthFault(409, 'nothing_scheduled');
                await this.clearSchedule(r, id);
                await audit(r, 'page.schedule_cancelled', actor, { slug: p.slug, cancelledAtRevision: p.draftRevision }, 'page', id);
                return { ok: true, scheduledPublishAt: null };
            }
            revision(p, body.baseRevision);
            const parsed = parseScheduleInput(body.publishAt, new Date());
            if (!parsed.ok)
                throw new AuthFault(400, parsed.code);
            await writePage(r, id, { scheduledPublishAt: parsed.date, scheduledRevision: p.draftRevision, scheduledPublishById: actor.id });
            await audit(r, 'page.schedule_set', actor, { slug: p.slug, publishAt: parsed.date.toISOString(), revision: p.draftRevision }, 'page', id);
            return { ok: true, scheduledPublishAt: parsed.date, scheduledRevision: p.draftRevision };
        });
    }
    private async clearSchedule(r: QueryRunner, id: string) { await writePage(r, id, { scheduledPublishAt: null, scheduledRevision: null, scheduledPublishById: null }); }
    /** DB-backed claim, publication, audit, notification and schedule removal commit together.
     * Unexpected failures roll back and remain due; competing/restarted workers cannot double-publish. */
    async runDue(now = new Date()) {
        const due: Array<{
            id: string;
        }> = await this.db.query('SELECT id FROM Page WHERE scheduledPublishAt<=? ORDER BY scheduledPublishAt,id LIMIT 100', [now]);
        let published = 0, skipped = 0;
        for (const { id } of due) {
            const outcome = await transaction(this.db, async (r) => {
                const p = await lockedPage(r, id);
                if (!p.scheduledPublishAt || p.scheduledPublishAt > now)
                    return 'none';
                const decision = decideScheduledPublish(p, now, p.scheduledPublishAt);
                const [u] = await r.query('SELECT u.id,u.email,u.name,u.roleKey,u.status,u.locale,u.emailVerifiedAt,r.permissions FROM User u LEFT JOIN Role r ON r.`key`=u.roleKey WHERE u.id=?', [p.scheduledPublishById]);
                const actor: AuthUser | null = u ? { ...u, emailVerified: !!u.emailVerifiedAt, permissions: JSON.parse(u.permissions ?? '[]') } : null;
                let reason = decision.action === 'skip' ? decision.reason as string : !actor || actor.status !== 'active' ? 'actor_inactive' : !can(actor, 'pages.publish') ? 'forbidden' : null;
                if (!reason && actor) {
                    // Savepoint keeps validation errors recoverable without swallowing infrastructure failures.
                    await r.query('SAVEPOINT scheduled_publication');
                    try {
                        await this.publishLocked(r, p, actor, ['ar', 'en'], 'scheduled');
                    }
                    catch (error) {
                        if (!(error instanceof AuthFault))
                            throw error;
                        await r.query('ROLLBACK TO SAVEPOINT scheduled_publication');
                        reason = error.code;
                    }
                }
                if (reason)
                    await audit(r, 'page.schedule_skipped', actor, { slug: p.slug, reason, scheduledRevision: p.scheduledRevision, draftRevision: p.draftRevision }, 'page', id);
                if (actor)
                    await insertRecord(r, 'Notification', { id: newId(), userId: actor.id, type: 'content_schedule', payload: JSON.stringify({ ref: p.slug || 'home', event: reason ? 'schedule_skipped' : 'schedule_published', reason, name: reason ? (actor.locale === 'en' ? 'Scheduled publish skipped' : 'أُسقط النشر المجدول') : (actor.locale === 'en' ? 'Scheduled publish executed' : 'نُفّذ النشر المجدول') }), link: `/${actor.locale === 'en' ? 'en' : 'ar'}/admin/pages` });
                await this.clearSchedule(r, id);
                return reason ? 'skipped' : 'published';
            });
            if (outcome === 'published')
                published++;
            else if (outcome === 'skipped')
                skipped++;
        }
        return { published, skipped };
    }
}
