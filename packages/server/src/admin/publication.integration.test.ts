import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SYSTEM_ROLES, parsePageSettings, type AuthUser } from '@so7ob/contracts';
import { createDataSource } from '../database/data-source.js';
import { PageAdministrationService } from './pages.js';
import { PagePublicationService } from './publication.js';
const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name))
    throw new Error('Actual isolated MariaDB required');
const db = createDataSource({ ...process.env, DATABASE_NAME: name }), prefix = 'pub' + randomBytes(6).toString('hex');
const pages = new PageAdministrationService(db), svc = new PagePublicationService(db), ids: string[] = [], originalRoles = new Set<string>();
const user = (suffix: string, roleKey: string): AuthUser => ({ id: prefix + suffix, email: prefix + suffix + '@example.invalid', name: suffix, status: 'active', roleKey, locale: 'en', emailVerified: true, permissions: SYSTEM_ROLES.find(r => r.key === roleKey)!.permissions });
const admin = user('admin', 'super_admin'), editor = user('editor', 'content_editor'), client = user('client', 'client');
const tree = (text: string) => JSON.stringify({ schemaVersion: 1, blocks: [{ id: 'heading', type: 'heading', props: { text } }] });
async function page() { const p = await pages.create(admin, { slug: prefix + '-' + ids.length, titleAr: 'صفحة', titleEn: 'Page', template: 'blank-section' }); ids.push(p.page.id); return p.page.id; }
async function row(id: string) { return (await db.query('SELECT * FROM Page WHERE id=?', [id]))[0]; }
async function draft(id: string, text = 'Draft') { const p = await row(id); return svc.save(editor, id, { baseRevision: p.draftRevision, draftBlocksAr: tree(text), draftSettings: parsePageSettings(p.draftSettings, p) }); }
async function publish(id: string) { const p = await row(id); return svc.publish(admin, id, { baseRevision: p.draftRevision }); }
async function due(id: string) { const p = await row(id); await svc.schedule(admin, id, { baseRevision: p.draftRevision, publishAt: new Date(Date.now() + 60000).toISOString() }); await db.query('UPDATE Page SET scheduledPublishAt=? WHERE id=?', [new Date(Date.now() - 1000), id]); }
beforeAll(async () => {
    await db.initialize();
    await db.runMigrations();
    for (const r of await db.query('SELECT `key` FROM Role'))
        originalRoles.add(r.key);
    for (const r of SYSTEM_ROLES)
        await db.query('INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE `key`=`key`', [r.key, r.nameAr, r.nameEn, JSON.stringify(r.permissions)]);
    for (const u of [admin, editor, client])
        await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status,locale) VALUES(?,?,?,'synthetic',?,'active','en')", [u.id, u.email, u.name, u.roleKey]);
});
afterAll(async () => {
    if (!db.isInitialized)
        return;
    await db.query('DROP TRIGGER IF EXISTS `' + prefix + 'audit`');
    for (const id of ids) {
        await db.query('DELETE FROM PageVersion WHERE pageId=?', [id]);
        await db.query('DELETE FROM Page WHERE id=?', [id]);
    }
    await db.query('DELETE FROM PageRedirect WHERE fromSlug LIKE ?', [prefix + '%']);
    await db.query("DELETE FROM Notification WHERE userId LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(payload,'$.slug')) LIKE ?", [prefix + '%', prefix + '%']);
    await db.query('DELETE FROM AuditLog WHERE actorEmail LIKE ?', [prefix + '%']);
    await db.query('DELETE FROM User WHERE id LIKE ?', [prefix + '%']);
    for (const r of SYSTEM_ROLES)
        if (!originalRoles.has(r.key) && !(await db.query('SELECT id FROM User WHERE roleKey=? LIMIT 1', [r.key])).length)
            await db.query('DELETE FROM Role WHERE `key`=?', [r.key]);
    await db.destroy();
});
it('denies unauthorized publication operations and requires explicit matching revisions', async () => {
    const id = await page();
    for (const call of [() => svc.save(client, id, {}), () => svc.publish(client, id, {}), () => svc.restore(client, id, '1', {}), () => svc.discard(client, id, {}), () => svc.schedule(client, id, {})])
        await expect(call()).rejects.toMatchObject({ status: 403 });
    await expect(svc.publish(admin, id, {})).rejects.toMatchObject({ code: 'revision_required' });
    await expect(svc.save(editor, id, { baseRevision: 99, draftSettings: { slug: 'x' } })).rejects.toMatchObject({ code: 'conflict' });
    await expect(svc.publish(admin, id, { baseRevision: 99 })).rejects.toMatchObject({ code: 'conflict' });
});
it('keeps settings and URLs private until explicit publish and rejects duplicate draft slugs', async () => {
    const id = await page(), original = await row(id), other = await page();
    await publish(id);
    const settings = { ...parsePageSettings(original.draftSettings, original), slug: prefix + '-renamed', titleAr: 'عنوان ظاهر', seoTitleEn: 'New SEO', visibility: 'role', allowedRoles: ['content_editor'] };
    await svc.save(editor, id, { baseRevision: 0, draftSettings: settings, draftBlocksAr: tree('New Arabic') });
    const draftRow = await row(id);
    expect(draftRow.slug).toBe(original.slug);
    expect(draftRow.visibility).toBe('public');
    expect(draftRow.publishedBlocksAr).not.toContain('New Arabic');
    await expect(svc.save(editor, other, { baseRevision: 0, draftSettings: settings })).rejects.toMatchObject({ code: 'slug_taken' });
    await publish(id);
    const live = await row(id);
    expect(live.slug).toBe(settings.slug);
    expect(live.visibility).toBe('role');
    expect(JSON.parse(live.publishedSettings).titleAr).toBe(settings.titleAr);
    expect((await db.query('SELECT toSlug FROM PageRedirect WHERE fromSlug=?', [original.slug]))[0].toSlug).toBe(settings.slug);
});
it('publishes only requested locales; repeated publication does not duplicate immutable versions', async () => {
    const id = await page();
    await publish(id);
    const original = await row(id);
    await svc.save(editor, id, { baseRevision: 0, draftBlocksAr: tree('New AR'), draftBlocksEn: tree('New EN') });
    await svc.publish(admin, id, { baseRevision: 1, locales: ['ar', 'ar'] });
    const updated = await row(id);
    expect(updated.publishedBlocksEn).toBe(original.publishedBlocksEn);
    expect(updated.publishedBlocksAr).toContain('New AR');
    await svc.publish(admin, id, { baseRevision: 1, locales: ['ar'] });
    expect((await db.query('SELECT id FROM PageVersion WHERE pageId=?', [id]))).toHaveLength(3);
    await expect(svc.publish(admin, id, { baseRevision: 1, locales: ['fr'] })).rejects.toMatchObject({ status: 400 });
});
it('serializes save against a publisher so it never publishes a different revision', async () => {
    const id = await page();
    const result = await Promise.allSettled([svc.save(editor, id, { baseRevision: 0, draftBlocksAr: tree('Race') }), svc.publish(admin, id, { baseRevision: 0 })]);
    const p = await row(id);
    if (result[1].status === 'fulfilled') {
        expect(p.publishedRevision).toBe(0);
        expect(p.publishedBlocksAr).not.toContain('Race');
    }
    else
        expect(result[1].reason).toMatchObject({ code: 'conflict' });
    expect(p.draftRevision).toBe(1);
});
it('discards to live content without reusing a revision that could admit stale writes or schedules', async () => {
    const id = await page();
    await publish(id);
    await draft(id, 'Discard me');
    await due(id);
    const before = await row(id);
    await svc.discard(editor, id, { baseRevision: 1 });
    const after = await row(id);
    expect(after.draftBlocksAr).toBe(before.publishedBlocksAr);
    expect(after.draftRevision).toBe(2);
    expect(after.publishedRevision).toBe(2);
    await expect(svc.save(editor, id, { baseRevision: 0, draftBlocksAr: tree('Stale') })).rejects.toMatchObject({ code: 'conflict' });
    expect(await svc.runDue()).toEqual({ published: 0, skipped: 1 });
    await expect(svc.discard(editor, id, { baseRevision: 2 })).rejects.toMatchObject({ code: 'nothing_to_discard' });
});
it('restores selected locale, backs up its current draft and rejects missing versions atomically', async () => {
    const id = await page();
    await publish(id);
    await draft(id, 'Unpublished backup');
    const before = await row(id);
    await expect(svc.restore(admin, id, '999', { locale: 'ar', baseRevision: 1 })).rejects.toMatchObject({ code: 'version_not_found' });
    expect((await row(id)).draftRevision).toBe(1);
    await svc.restore(admin, id, '1', { locale: 'ar', baseRevision: 1 });
    const after = await row(id);
    expect(after.draftBlocksEn).toBe(before.draftBlocksEn);
    expect(after.publishedBlocksAr).toBe(before.publishedBlocksAr);
    expect(after.draftBlocksAr).not.toContain('Unpublished backup');
    const [backup] = await db.query("SELECT blocks FROM PageVersion WHERE pageId=? AND note='auto-backup-before-restore'", [id]);
    expect(backup.blocks).toContain('Unpublished backup');
});
it('validates schedule time/revision; cancellation needs no revision and affects no content', async () => {
    const id = await page();
    await expect(svc.schedule(admin, id, { baseRevision: 0, publishAt: 'invalid' })).rejects.toMatchObject({ code: 'invalid_time' });
    await expect(svc.schedule(admin, id, { baseRevision: 0, publishAt: new Date().toISOString() })).rejects.toMatchObject({ code: 'past_time' });
    await expect(svc.schedule(admin, id, { publishAt: new Date(Date.now() + 60000).toISOString() })).rejects.toMatchObject({ code: 'revision_required' });
    await due(id);
    const before = await row(id);
    await svc.schedule(admin, id, { publishAt: null });
    const after = await row(id);
    expect(after.scheduledPublishAt).toBeNull();
    expect(after.draftBlocksAr).toBe(before.draftBlocksAr);
    expect(after.draftRevision).toBe(before.draftRevision);
    await expect(svc.schedule(admin, id, { publishAt: null })).rejects.toMatchObject({ code: 'nothing_scheduled' });
});
it('two independent worker services publish once, clear atomically and notify the scheduling actor', async () => {
    const id = await page();
    await due(id);
    const results = await Promise.all([svc.runDue(), new PagePublicationService(db).runDue()]);
    expect(results.reduce((n, r) => n + r.published, 0)).toBe(1);
    expect((await row(id)).scheduledPublishAt).toBeNull();
    expect(await svc.runDue()).toEqual({ published: 0, skipped: 0 });
    expect((await db.query("SELECT id FROM AuditLog WHERE entityId=? AND action='page.published'", [id]))).toHaveLength(1);
    expect((await db.query("SELECT id FROM Notification WHERE userId=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.event'))='schedule_published' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ref'))=?", [admin.id, (await row(id)).slug]))).toHaveLength(1);
});
it('skips changed/archived/inactive schedules with audit and never publishes unapproved content', async () => {
    for (const reason of ['changed', 'archived', 'inactive', 'revoked']) {
        const id = await page();
        await due(id);
        if (reason === 'changed')
            await draft(id);
        if (reason === 'archived')
            await pages.archive(admin, id);
        if (reason === 'revoked') await db.query("UPDATE User SET roleKey='client' WHERE id=?", [admin.id]);
        if (reason === 'inactive')
            await db.query("UPDATE User SET status='suspended' WHERE id=?", [admin.id]);
        try {
            expect(await svc.runDue()).toEqual({ published: 0, skipped: 1 });
            expect((await row(id)).publishedAt).toBeNull();
            expect((await db.query("SELECT id FROM AuditLog WHERE entityId=? AND action='page.schedule_skipped'", [id]))).toHaveLength(1);
        }
        finally {
            await db.query("UPDATE User SET status='active',roleKey='super_admin' WHERE id=?", [admin.id]);
        }
    }
});
it('rolls back publication and retains due schedule when infrastructure fails; recovery publishes once', async () => {
    const id = await page();
    await due(id);
    await db.query("CREATE TRIGGER `" + prefix + "audit` BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.actorEmail='" + admin.email + "' AND NEW.action='page.published' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'; END IF; END");
    try {
        await expect(svc.runDue()).rejects.toThrow('synthetic audit failure');
        const p = await row(id);
        expect(p.scheduledPublishAt).not.toBeNull();
        expect(p.publishedAt).toBeNull();
        expect(await db.query('SELECT id FROM PageVersion WHERE pageId=?', [id])).toHaveLength(0);
    }
    finally {
        await db.query('DROP TRIGGER `' + prefix + 'audit`');
    }
    expect(await new PagePublicationService(db).runDue()).toEqual({ published: 1, skipped: 0 });
});
