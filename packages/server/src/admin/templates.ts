import {assertMediaReferences} from "../files/media-usage.js";
import type { DataSource, QueryRunner } from 'typeorm';
import { can, validateContent, type AuthUser, type Permission } from '@so7ob/contracts';
import type { Page, PageTemplate } from '../database/models.js';
import { AuthFault, transaction, newId, audit } from '../auth/persistence.js';
import { insertRecord, lockOperation } from '../business/persistence.js';
import { BUILTIN_TEMPLATES } from './templates/builtin.js';
import { parseCreateTemplateInput, parseUpdateTemplateInput, resolveTemplateBlocks, templateListItem } from './templates/contracts.js';
const permit = (actor: AuthUser, permission: Permission) => { if (!can(actor, permission))
    throw new AuthFault(403, 'forbidden'); };
export class PageTemplateService {
    constructor(private readonly db: DataSource) { }
    private async template(r: QueryRunner, id: string): Promise<PageTemplate> {
        const [row]: PageTemplate[] = await r.query('SELECT * FROM PageTemplate WHERE id=? FOR UPDATE', [id]);
        if (!row)
            throw new AuthFault(404, 'not_found');
        return row;
    }
    async list(actor: AuthUser) {
        permit(actor, 'pages.view');
        return transaction(this.db, async (r) => {
            await lockOperation(r, "cms-pages");
            await lockOperation(r, 'cms-templates');
            for (const def of BUILTIN_TEMPLATES) {
                const ar = validateContent(JSON.stringify({ schemaVersion: 1, blocks: def.blocksAr }));
                const en = validateContent(JSON.stringify({ schemaVersion: 1, blocks: def.blocksEn }));
                if (!ar.ok || !en.ok)
                    throw new Error('Invalid builtin template: ' + def.key);
                // Create-only: never replace customized/imported records sharing a builtin key.
                if (!(await r.query('SELECT id FROM PageTemplate WHERE `key`=?', [def.key])).length)
                    await insertRecord(r, 'PageTemplate', { id: newId(), key: def.key, nameAr: def.nameAr, nameEn: def.nameEn, descAr: def.descAr, descEn: def.descEn, kind: 'builtin', blocksAr: ar.json, blocksEn: en.json });
            }
            const rows: Array<PageTemplate & {
                creatorName: string | null;
            }> = await r.query('SELECT t.*,u.name creatorName FROM PageTemplate t LEFT JOIN User u ON u.id=t.createdById ORDER BY t.kind ASC,t.updatedAt DESC');
            return { ok: true, templates: rows.map(t => templateListItem({ ...t, createdBy: t.creatorName === null ? null : { name: t.creatorName } })) };
        });
    }
    async create(actor: AuthUser, body: Record<string, unknown>) {
        permit(actor, 'pages.edit');
        const parsed = parseCreateTemplateInput(body);
        if (!parsed.ok)
            throw new AuthFault(400, parsed.error);
        return transaction(this.db, async (r) => {
            await lockOperation(r, "cms-pages");
            await assertMediaReferences(r,parsed.data);
            const id = newId();
            await insertRecord(r, 'PageTemplate', { id, ...parsed.data, kind: 'custom', createdById: actor.id });
            const t = await this.template(r, id);
            await audit(r, 'template.created', actor, { nameAr: t.nameAr, nameEn: t.nameEn, locales: [t.blocksAr ? 'ar' : null, t.blocksEn ? 'en' : null].filter(Boolean) }, 'page_template', id);
            return { ok: true, template: templateListItem(t) };
        });
    }
    async update(actor: AuthUser, id: string, body: Record<string, unknown>) {
        permit(actor, 'pages.edit');
        return transaction(this.db, async (r) => {
            await lockOperation(r, "cms-pages");
            const current = await this.template(r, id);
            if (current.kind === 'builtin')
                throw new AuthFault(400, 'builtin_readonly');
            const parsed = parseUpdateTemplateInput(body, current);
            if (!parsed.ok)
                throw new AuthFault(400, parsed.error);
            const { changed, ...data } = parsed.data;
            await r.query('UPDATE PageTemplate SET nameAr=?,nameEn=?,descAr=?,descEn=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?', [data.nameAr, data.nameEn, data.descAr, data.descEn, id]);
            await audit(r, 'template.updated', actor, { changed, nameAr: data.nameAr, nameEn: data.nameEn }, 'page_template', id);
            return { ok: true, template: templateListItem(await this.template(r, id)) };
        });
    }
    async remove(actor: AuthUser, id: string) {
        permit(actor, 'pages.edit');
        return transaction(this.db, async (r) => {
            await lockOperation(r, "cms-pages");
            const t = await this.template(r, id);
            if (t.kind === 'builtin')
                throw new AuthFault(400, 'builtin_readonly');
            await r.query('DELETE FROM PageTemplate WHERE id=?', [id]);
            await audit(r, 'template.deleted', actor, { nameAr: t.nameAr, nameEn: t.nameEn }, 'page_template', id);
            return { ok: true };
        });
    }
    async apply(actor: AuthUser, id: string, body: Record<string, unknown>) {
        permit(actor, 'pages.edit');
        const locale = body.locale === 'en' ? 'en' : body.locale === 'ar' ? 'ar' : null;
        if (!locale)
            throw new AuthFault(400, 'locale_required');
        return transaction(this.db, async (r) => {
            await lockOperation(r, "cms-pages");
            // Same lock order as every existing CMS writer; backup, draft, usage and audit commit together.
            await lockOperation(r, 'cms-pages');
            const [page]: Page[] = await r.query('SELECT * FROM Page WHERE id=? FOR UPDATE', [typeof body.pageId === 'string' ? body.pageId : '']);
            if (!page)
                throw new AuthFault(404, 'page_not_found');
            if (page.status === 'archived')
                throw new AuthFault(409, 'archived');
            if (typeof body.baseRevision !== 'number' || !Number.isInteger(body.baseRevision))
                throw new AuthFault(409, 'revision_required');
            if (body.baseRevision !== page.draftRevision)
                throw new AuthFault(409, 'conflict', { serverRevision: page.draftRevision });
            const template = await this.template(r, id), resolved = resolveTemplateBlocks(template, locale);
            if (!resolved.ok)
                throw new AuthFault(400, 'template_locale_missing', { locale });
            const content = validateContent(resolved.blocks);
            if (!content.ok)
                throw new AuthFault(400, 'invalid_blocks', { error: content.error });
            await assertMediaReferences(r,{blocks:content.json});
            const field = locale === 'ar' ? 'draftBlocksAr' : 'draftBlocksEn';
            const [last]: Array<{
                version: number;
                blocks: string;
            }> = await r.query('SELECT version,blocks FROM PageVersion WHERE pageId=? AND locale=? ORDER BY version DESC LIMIT 1', [page.id, locale]);
            const backupCreated = last?.blocks !== page[field];
            if (backupCreated)
                await insertRecord(r, 'PageVersion', { id: newId(), pageId: page.id, locale, version: (last?.version ?? 0) + 1, blocks: page[field], authorId: actor.id, note: 'auto-backup-before-template' });
            const now = new Date(Math.max(Date.now(), (page.draftUpdatedAt?.getTime() ?? 0) + 1));
            await r.query(`UPDATE Page SET ${field}=?,draftRevision=draftRevision+1,draftUpdatedAt=?,draftUpdatedById=?,editorTouchedAt=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?`, [content.json, now, actor.id, now, page.id]);
            await r.query('UPDATE PageTemplate SET usageCount=usageCount+1,updatedAt=UTC_TIMESTAMP(3) WHERE id=?', [id]);
            await audit(r, 'template.applied', actor, { pageId: page.id, slug: page.slug, locale, templateKey: template.key, templateNameAr: template.nameAr }, 'page_template', id);
            return { ok: true, page: { id: page.id, draftRevision: page.draftRevision + 1, draftUpdatedAt: now.toISOString(), [field]: content.json, backupCreated } };
        });
    }
}
