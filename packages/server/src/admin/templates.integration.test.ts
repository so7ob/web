import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SYSTEM_ROLES, type AuthUser } from '@so7ob/contracts';
import { createDataSource } from '../database/data-source.js';
import { PageTemplateService } from './templates.js';
import { PageAdministrationService } from './pages.js';
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
    throw new Error('Isolated actual MariaDB required');
const db = createDataSource({ ...process.env, DATABASE_NAME: name });
const prefix = 'tpl' + randomBytes(6).toString('hex');
const originalRoles = new Set<string>();
const originalTemplates = new Set<string>();
const pageIds: string[] = [];
const ids: string[] = [];
const user = (suffix: string, roleKey: string): AuthUser => ({ id: prefix + suffix, email: prefix + suffix + '@example.invalid', name: prefix + suffix, roleKey, status: 'active', locale: 'ar', emailVerified: true, permissions: SYSTEM_ROLES.find(r => r.key === roleKey)!.permissions });
const editor = user('editor', 'content_editor'), admin = user('admin', 'super_admin'), client = user('client', 'client');
const svc = new PageTemplateService(db), pages = new PageAdministrationService(db);
const blocks = (text = 'Template secret') => JSON.stringify({ schemaVersion: 1, blocks: [{ id: 'heading', type: 'heading', props: { text }, discardMe: 'not stored' }] });
async function create() { const r = await svc.create(editor, { nameAr: 'قالب اصطناعي', blocksAr: blocks(), descAr: 'وصف' }); ids.push(r.template.id); return r.template.id; }
async function page() { const r = await pages.create(editor, { slug: prefix + '-' + pageIds.length, titleAr: 'صفحة', titleEn: 'Page', template: 'blank-section' }); pageIds.push(r.page.id); return r.page.id; }
beforeAll(async () => {
    await db.initialize();
    await db.runMigrations();
    for (const r of await db.query('SELECT `key` FROM Role'))
        originalRoles.add(r.key);
    for (const r of await db.query('SELECT id FROM PageTemplate'))
        originalTemplates.add(r.id);
    for (const r of SYSTEM_ROLES)
        await db.query('INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE `key`=`key`', [r.key, r.nameAr, r.nameEn, JSON.stringify(r.permissions)]);
    for (const u of [editor, admin, client])
        await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'synthetic',?,'active')", [u.id, u.email, u.name, u.roleKey]);
});
afterAll(async () => {
    if (!db.isInitialized)
        return;
    await db.query('DROP TRIGGER IF EXISTS `' + prefix + 'audit`');
    for (const id of pageIds) {
        await db.query('DELETE FROM PageVersion WHERE pageId=?', [id]);
        await db.query('DELETE FROM Page WHERE id=?', [id]);
    }
    for (const t of await db.query('SELECT id FROM PageTemplate'))
        if (!originalTemplates.has(t.id))
            await db.query('DELETE FROM PageTemplate WHERE id=?', [t.id]);
    await db.query("DELETE FROM Notification WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.slug')) LIKE ?", [prefix + '%']);
    await db.query('DELETE FROM AuditLog WHERE actorEmail LIKE ?', [prefix + '%']);
    await db.query('DELETE FROM User WHERE id LIKE ?', [prefix + '%']);
    for (const r of await db.query('SELECT `key` FROM Role'))
        if (!originalRoles.has(r.key) && !(await db.query('SELECT id FROM User WHERE roleKey=? LIMIT 1', [r.key])).length)
            await db.query('DELETE FROM Role WHERE `key`=?', [r.key]);
    await db.destroy();
});
it('denies all operations before exposing templates or mutating drafts', async () => {
    for (const call of [() => svc.list(client), () => svc.create(client, {}), () => svc.update(client, 'x', {}), () => svc.remove(client, 'x'), () => svc.apply(client, 'x', {})])
        await expect(call()).rejects.toMatchObject({ status: 403 });
});
it('initializes six builtins safely under simultaneous reads and never overwrites existing content', async () => {
    const [a, b] = await Promise.all([svc.list(editor), svc.list(editor)]);
    const builtins = a.templates.filter(t => t.kind === 'builtin');
    expect(builtins).toHaveLength(6);
    expect(b.templates.filter(t => t.kind === 'builtin')).toHaveLength(6);
    const id = builtins[0].id;
    const originalName = builtins[0].nameAr;
    await db.query('UPDATE PageTemplate SET nameAr=? WHERE id=?', ['اسم محفوظ', id]);
    expect((await svc.list(editor)).templates.find(t => t.id === id)?.nameAr).toBe('اسم محفوظ');
    await db.query('UPDATE PageTemplate SET nameAr=? WHERE id=?', [originalName, id]);
    await expect(svc.update(editor, id, { nameAr: 'no' })).rejects.toMatchObject({ code: 'builtin_readonly' });
    await expect(svc.remove(editor, id)).rejects.toMatchObject({ code: 'builtin_readonly' });
    expect(JSON.stringify(a.templates)).not.toContain('blocksAr');
});
it('normalizes custom content; patches only supplied metadata and audits without content', async () => {
    const id = await create();
    const [row] = await db.query('SELECT * FROM PageTemplate WHERE id=?', [id]);
    expect(row.blocksAr).not.toContain('discardMe');
    expect(row.blocksEn).toBeNull();
    const updated = await svc.update(editor, id, { nameEn: 'Name', descAr: '' });
    expect(updated.template.nameAr).toBe('قالب اصطناعي');
    expect(updated.template.descAr).toBeNull();
    await expect(svc.update(editor, id, {})).rejects.toMatchObject({ code: 'nothing_to_update' });
    await expect(svc.create(editor, { nameAr: 'bad', blocksAr: blocks().replace('"type":"heading"', '"type":"constructor"') })).rejects.toMatchObject({ status: 400 });
    await svc.remove(editor, id);
    await expect(svc.update(editor, id, { nameAr: 'gone' })).rejects.toMatchObject({ status: 404 });
    const logs = await db.query('SELECT details FROM AuditLog WHERE entityId=?', [id]);
    expect(logs).toHaveLength(3);
    expect(JSON.stringify(logs)).not.toContain('Template secret');
});
it('applies only the requested locale, preserves live content, backs up and supports publish/restore', async () => {
    const id = await create(), p = await page();
    await pages.publish(admin, p);
    const [before] = await db.query('SELECT * FROM Page WHERE id=?', [p]);
    const result = await svc.apply(editor, id, { pageId: p, locale: 'ar', baseRevision: 0 });
    expect(result.page.draftRevision).toBe(1);
    const [after] = await db.query('SELECT * FROM Page WHERE id=?', [p]);
    expect(after.draftBlocksEn).toBe(before.draftBlocksEn);
    expect(after.publishedBlocksAr).toBe(before.publishedBlocksAr);
    // Last published version already equals the current draft: avoid a duplicate backup.
    expect(result.page.backupCreated).toBe(false);
    await pages.publish(admin, p);
    const [live] = await db.query('SELECT publishedBlocksAr FROM Page WHERE id=?', [p]);
    expect(JSON.parse(live.publishedBlocksAr).schemaVersion).toBe(1);
    await pages.restore(admin, p, '1');
    const [restored] = await db.query('SELECT draftBlocksAr,draftRevision FROM Page WHERE id=?', [p]);
    expect(restored.draftBlocksAr).toBe(before.draftBlocksAr);
    expect(restored.draftRevision).toBe(2);
    expect((await pages.versions(editor, p)).versions.some((v: {
        blockCount: number;
    }) => v.blockCount === 1)).toBe(true);
});
it('rejects missing locale/revision, stale revision, missing page/template and archived page', async () => {
    const id = await create(), p = await page();
    for (const [body, code] of [[{ pageId: p }, 'locale_required'], [{ pageId: p, locale: 'ar' }, 'revision_required'], [{ pageId: p, locale: 'en', baseRevision: 0 }, 'template_locale_missing'], [{ pageId: p, locale: 'ar', baseRevision: 99 }, 'conflict'], [{ pageId: 'missing', locale: 'ar', baseRevision: 0 }, 'page_not_found']] as const)
        await expect(svc.apply(editor, id, body)).rejects.toMatchObject({ code });
    await expect(svc.apply(editor, 'missing', { pageId: p, locale: 'ar', baseRevision: 0 })).rejects.toMatchObject({ code: 'not_found' });
    await db.query("UPDATE Page SET status='archived' WHERE id=?", [p]);
    await expect(svc.apply(editor, id, { pageId: p, locale: 'ar', baseRevision: 0 })).rejects.toMatchObject({ code: 'archived' });
});
it('serializes simultaneous applications: one winner, one backup and one usage increment', async () => {
    const id = await create(), p = await page();
    const outcomes = await Promise.allSettled([svc.apply(editor, id, { pageId: p, locale: 'ar', baseRevision: 0 }), svc.apply(editor, id, { pageId: p, locale: 'ar', baseRevision: 0 })]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(x => x.status === 'rejected')).toMatchObject({ reason: { code: 'conflict' } });
    expect((await db.query('SELECT id FROM PageVersion WHERE pageId=?', [p]))).toHaveLength(1);
    expect((await db.query('SELECT usageCount FROM PageTemplate WHERE id=?', [id]))[0].usageCount).toBe(1);
});
it('rolls back draft, backup and usage if transactional auditing fails', async () => {
    const id = await create(), p = await page();
    const [before] = await db.query('SELECT * FROM Page WHERE id=?', [p]);
    await db.query(`CREATE TRIGGER \`${prefix}audit\` BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.actorId='${editor.id}' AND NEW.action='template.applied' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic template audit failure'; END IF; END`);
    try {
        await expect(svc.apply(editor, id, { pageId: p, locale: 'ar', baseRevision: 0 })).rejects.toThrow('Synthetic template audit failure');
    }
    finally {
        await db.query('DROP TRIGGER `' + prefix + 'audit`');
    }
    expect((await db.query('SELECT * FROM Page WHERE id=?', [p]))[0]).toEqual(before);
    expect(await db.query('SELECT id FROM PageVersion WHERE pageId=?', [p])).toHaveLength(0);
    expect((await db.query('SELECT usageCount FROM PageTemplate WHERE id=?', [id]))[0].usageCount).toBe(0);
});
it('legacy draft saves advance revisions so a stale template cannot replace newer edits', async () => {
    const id = await create(), p = await page();
    await pages.update(editor, p, { draftBlocksAr: '[]' });
    await expect(svc.apply(editor, id, { pageId: p, locale: 'ar', baseRevision: 0 })).rejects.toMatchObject({ code: 'conflict', extra: { serverRevision: 1 } });
});
it('requires a matching revision for tree saves while keeping timestamp-based legacy saves compatible', async () => {
    const p = await page();
    await expect(pages.update(editor, p, { draftBlocksAr: blocks() })).rejects.toMatchObject({ code: 'revision_required' });
    const changed = await pages.update(editor, p, { draftBlocksAr: blocks(), baseRevision: 0 });
    expect(changed.page.draftRevision).toBe(1);
    await expect(pages.update(editor, p, { draftBlocksAr: blocks(), baseRevision: 0 })).rejects.toMatchObject({ code: 'conflict' });
});

it('keeps list SELECT count constant as custom templates and creators grow', async () => {
    await svc.list(editor); // Builtin initialization is measured separately above.
    const logger = db.logger;
    const original = logger.logQuery;
    let selects = 0;
    logger.logQuery = function (query, parameters, runner) {
        if (/^SELECT\b/i.test(query)) selects++;
        return original.call(this, query, parameters, runner);
    };
    try {
        const small = await svc.list(editor);
        const initialSelects = selects;
        for (let index = 0; index < 20; index++) await create();
        selects = 0;
        const large = await svc.list(editor);
        expect(large.templates.length - small.templates.length).toBe(20);
        expect(selects).toBe(initialSelects);
        expect(selects).toBeGreaterThan(0);
    } finally {
        logger.logQuery = original;
    }
});
