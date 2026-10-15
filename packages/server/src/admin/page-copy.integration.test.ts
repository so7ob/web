import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SYSTEM_ROLES, isValidSlug, parsePageSettings, type AuthUser } from '@so7ob/contracts';
import { createDataSource } from '../database/data-source.js';
import { PageAdministrationService } from './pages.js';
import { mediaUsageIndex } from '../files/media-usage.js';
import { safeContext } from '../audit/redaction.js';

const name = process.env.TEST_DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name)) throw new Error('Isolated MariaDB required');
const db = createDataSource({ ...process.env, DATABASE_NAME: name });
const pages = new PageAdministrationService(db), prefix = 'copy' + randomBytes(5).toString('hex');
const ids: string[] = [], mediaIds: string[] = [], roles: string[] = [];
const actor = (suffix: string): AuthUser => ({ id: prefix + suffix, email: prefix + suffix + '@example.invalid', name: 'Synthetic page copier', roleKey: 'super_admin', status: 'active', locale: 'en', emailVerified: true, permissions: [] });
const admin = actor('admin'), fault = actor('fault');
let serial = 0;
const document = (text: string) => JSON.stringify({ schemaVersion: 1, blocks: [{ id: 'section', type: 'section', children: [{ id: 'heading', type: 'heading', props: { text } }] }] });
async function create(slug = prefix + '-' + (++serial)) {
  const page = (await pages.create(admin, { slug, titleAr: 'عنوان إداري', titleEn: 'Administrative title' })).page;
  ids.push(page.id); return page.id;
}
async function row(id: string) { return (await db.query('SELECT * FROM Page WHERE id=?', [id]))[0]; }
async function duplicate(id: string, who = admin) {
  const result = await pages.duplicate(who, id); ids.push(result.page.id); return result.page;
}
async function unchanged(id: string, before: unknown) { expect(await row(id)).toEqual(before); }
beforeAll(async () => {
  await db.initialize(); await db.runMigrations();
  for (const role of SYSTEM_ROLES) if (!(await db.query('SELECT `key` FROM Role WHERE `key`=?', [role.key])).length) {
    await db.query('INSERT INTO Role(`key`,nameAr,nameEn,permissions,isSystem) VALUES(?,?,?,?,1)', [role.key, role.nameAr, role.nameEn, JSON.stringify(role.permissions)]); roles.push(role.key);
  }
  for (const user of [admin, fault]) await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'unusable-synthetic-fixture','super_admin','active')", [user.id, user.email, user.name]);
});
afterAll(async () => {
  if (!db.isInitialized) return;
  try {
    await db.query('DROP TRIGGER IF EXISTS `' + prefix + 'audit`');
    for (const id of ids) { await db.query('DELETE FROM PageVersion WHERE pageId=?', [id]); await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]); await db.query('DELETE FROM Page WHERE id=?', [id]); }
    await db.query('DELETE FROM PageRedirect WHERE fromSlug LIKE ?', [prefix + '%']);
    for (const id of mediaIds) await db.query('DELETE FROM MediaItem WHERE id=?', [id]);
    for (const user of [admin, fault]) { await db.query('DELETE FROM AuditLog WHERE actorId=?', [user.id]); await db.query('DELETE FROM User WHERE id=?', [user.id]); }
    for (const key of roles) if (!(await db.query('SELECT id FROM User WHERE roleKey=?', [key])).length) await db.query('DELETE FROM Role WHERE `key`=?', [key]);
  } finally { await db.destroy(); }
});

it('copies the latest bilingual nested draft and SEO into a fresh unpublished document, leaving source and history intact', async () => {
  const id = await create();
  const settings = { ...parsePageSettings('{}', await row(id)), titleAr: 'عنوان المسودة', titleEn: 'Draft display title', seoTitleAr: 'بحث عربي', seoTitleEn: null, seoDescAr: 'وصف بحث', seoDescEn: 'Draft SEO description', visibility: 'role', allowedRoles: ['ops_manager'] };
  await pages.update(admin, id, { baseRevision: 0, draftSettings: settings, draftBlocksAr: document('المسودة العربية'), draftBlocksEn: document('English draft') });
  await db.query("UPDATE Page SET status='published',publishedBlocksAr=?,publishedBlocksEn=?,publishedRevision=0,publishedAt=UTC_TIMESTAMP(3),publishedById=?,scheduledPublishAt='2035-01-01',scheduledRevision=1,scheduledPublishById=?,sourceKey='synthetic-source' WHERE id=?", [document('منشور قديم'), document('Old publication'), admin.id, admin.id, id]);
  await db.query("INSERT INTO PageVersion(id,pageId,locale,version,blocks,authorId) VALUES(?,?,'ar',1,?,?)", [prefix + 'history', id, document('Historical content'), admin.id]);
  const before = await row(id), history = await db.query('SELECT * FROM PageVersion WHERE pageId=?', [id]);
  const copy = await duplicate(id), created = await row(copy.id);
  expect(copy.id).not.toBe(id); expect(copy.slug).toBe(before.slug + '-copy');
  expect(created).toMatchObject({ status: 'draft', isHome: 0, visibility: 'public', allowedRoles: '[]', draftRevision: 0, publishedRevision: null, publishedAt: null, publishedById: null, publishedBlocksAr: null, publishedBlocksEn: null, publishedSettings: null, scheduledPublishAt: null, scheduledRevision: null, scheduledPublishById: null, sourceKey: null, draftUpdatedById: admin.id });
  expect(JSON.parse(created.draftBlocksAr)).toEqual(JSON.parse(before.draftBlocksAr)); expect(JSON.parse(created.draftBlocksEn)).toEqual(JSON.parse(before.draftBlocksEn));
  expect(parsePageSettings(created.draftSettings, created)).toMatchObject({ slug: copy.slug, titleAr: settings.titleAr, titleEn: settings.titleEn, seoTitleAr: settings.seoTitleAr, seoTitleEn: null, seoDescAr: settings.seoDescAr, seoDescEn: settings.seoDescEn, visibility: 'public', allowedRoles: [] });
  expect(await db.query('SELECT * FROM PageVersion WHERE pageId=?', [copy.id])).toEqual([]);
  await pages.update(admin, copy.id, { baseRevision: 0, draftBlocksAr: document('Changed copy only') });
  const edited = await row(copy.id); await pages.archive(admin, copy.id);
  expect(await row(copy.id)).toMatchObject({ status: 'archived', draftBlocksAr: edited.draftBlocksAr, draftBlocksEn: edited.draftBlocksEn });
  await unchanged(id, before); expect(await db.query('SELECT * FROM PageVersion WHERE pageId=?', [id])).toEqual(history);
  const audit = await db.query('SELECT action,entityId,details FROM AuditLog WHERE entityId=? ORDER BY createdAt,id', [copy.id]);
  expect(audit.filter((event: { action: string }) => event.action === 'page.created')).toHaveLength(1);
  expect(audit.find((event: { action: string }) => event.action === 'page.created').details).toContain(id);
  expect(safeContext('page.created', { sourcePageId: id, passwordHash: 'SYNTHETIC_SECRET', content: 'Private draft' })).toEqual({ sourcePageId: id });
  expect(safeContext('page.updated', { sourcePageId: id })).toEqual({});
});

it('keeps empty drafts and a missing language empty, while preserving supported legacy documents', async () => {
  const empty = await create(), first = await duplicate(empty);
  expect(await row(first.id)).toMatchObject({ draftBlocksAr: '[]', draftBlocksEn: '[]' });
  const legacy = await create(), raw = JSON.stringify([{ id: 'legacy', type: 'heading', props: { text: 'Legacy content', level: 2, align: 'start' } }]);
  await pages.update(admin, legacy, { draftBlocksAr: raw }); const before = await row(legacy);
  const copy = await duplicate(legacy); expect((await row(copy.id)).draftBlocksAr).toBe(before.draftBlocksAr); expect((await row(copy.id)).draftBlocksEn).toBe('[]'); await unchanged(legacy, before);
});

it('allocates distinct slugs atomically for concurrent copies and avoids redirects and reserved draft slugs', async () => {
  const id = await create(), source = await row(id), other = await create();
  await db.query('INSERT INTO PageRedirect(id,fromSlug,toSlug) VALUES(?,?,?)', [prefix + 'redirect', source.slug + '-copy', source.slug]);
  await pages.update(admin, other, { baseRevision: 0, draftSettings: { ...parsePageSettings('{}', await row(other)), slug: source.slug + '-copy-2' } });
  const copies = await Promise.all([duplicate(id), duplicate(id)]);
  expect(copies.map(copy => copy.slug).sort()).toEqual([source.slug + '-copy-3', source.slug + '-copy-4']);
  expect(new Set(copies.map(copy => copy.id)).size).toBe(2); await unchanged(id, source);
});

it('copies valid maximum-length and home slugs into valid non-home drafts', async () => {
  for (const slug of ['p'.repeat(60), '']) {
    const id = await create(slug); if (!slug) await db.query('UPDATE Page SET isHome=1 WHERE id=?', [id]);
    const before = await row(id), copy = await duplicate(id);
    expect(copy.slug).not.toBe(''); expect(copy.slug.length).toBeLessThanOrEqual(60); expect(isValidSlug(copy.slug)).toBe(true);
    expect((await row(copy.id)).isHome).toBe(0); await unchanged(id, before);
  }
});

it('fails exhausted suffix allocation without partial pages or audit success', async () => {
  const id = await create(); for (let i = 0; i < 5; i++) await duplicate(id);
  const before = await row(id), count = await db.query('SELECT COUNT(*) n FROM Page'), audit = await db.query('SELECT COUNT(*) n FROM AuditLog');
  await expect(pages.duplicate(admin, id)).rejects.toMatchObject({ status: 409, code: 'slug_taken' });
  expect(await db.query('SELECT COUNT(*) n FROM Page')).toEqual(count); expect(await db.query('SELECT COUNT(*) n FROM AuditLog')).toEqual(audit); await unchanged(id, before);
});

it('requires source read and destination edit authority before revealing missing or archived source state', async () => {
  const id = await create(), before = await row(id);
  for (const permissions of [[], ['pages.view'], ['pages.edit']]) for (const source of [id, 'missing'])
    await expect(pages.duplicate({ ...admin, roleKey: 'content_editor', permissions: permissions as AuthUser['permissions'] }, source)).rejects.toMatchObject({ status: 403 });
  await expect(pages.duplicate(admin, 'missing')).rejects.toMatchObject({ status: 404 }); await unchanged(id, before);
  await pages.archive(admin, id); const archived = await row(id);
  await expect(pages.duplicate(admin, id)).rejects.toMatchObject({ status: 409, code: 'archived' }); await unchanged(id, archived);
});

it('retains media references without creating another media row and registers the new draft usage', async () => {
  const id = await create(), media = prefix + 'media'; mediaIds.push(media);
  await db.query("INSERT INTO MediaItem(id,filename,storedName,mimeType,size,uploadedById,folder) VALUES(?,?,?,'image/png',1,?,'general')", [media, 'synthetic.png', media + '.png', admin.id]);
  const raw = JSON.stringify({ schemaVersion: 1, blocks: [{ id: 'image', type: 'image', props: { src: '/api/media/' + media, alt: 'Synthetic image' } }] });
  await pages.update(admin, id, { baseRevision: 0, draftBlocksAr: raw, draftBlocksEn: raw }); await db.query('UPDATE Page SET ogMediaId=? WHERE id=?', [media, id]);
  const before = await row(id), copy = await duplicate(id);
  expect(await row(copy.id)).toMatchObject({ draftBlocksAr: before.draftBlocksAr, draftBlocksEn: before.draftBlocksEn, ogMediaId: media });
  expect(await db.query('SELECT id FROM MediaItem WHERE id=?', [media])).toHaveLength(1);
  const runner = db.createQueryRunner(); await runner.connect();
  try { expect((await mediaUsageIndex(runner)).get(media)).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: id, kind: 'page_draft' }), expect.objectContaining({ entityId: copy.id, kind: 'page_draft' })])); }
  finally { await runner.release(); }
  await unchanged(id, before);
});

it('rejects invalid content or vanished media without silently creating an empty copy', async () => {
  for (const [raw, code] of [['invalid-json', 'invalid_blocks'], [JSON.stringify([{ id: 'image', type: 'image', props: { src: '/api/media/missing-copy120', alt: 'Missing' } }]), 'media_not_found']]) {
    const id = await create(); await db.query('UPDATE Page SET draftBlocksAr=? WHERE id=?', [raw, id]); const before = await row(id), count = await db.query('SELECT COUNT(*) n FROM Page');
    await expect(pages.duplicate(admin, id)).rejects.toMatchObject({ code });
    expect(await db.query('SELECT COUNT(*) n FROM Page')).toEqual(count); await unchanged(id, before);
  }
});

it('rolls back the new page when its fresh creation audit fails', async () => {
  const id = await create(), before = await row(id), count = await db.query('SELECT COUNT(*) n FROM Page');
  await db.query('CREATE TRIGGER `' + prefix + "audit` BEFORE INSERT ON AuditLog FOR EACH ROW BEGIN IF NEW.actorEmail='" + fault.email + "' AND NEW.action='page.created' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic copy audit failure'; END IF; END");
  try { await expect(pages.duplicate(fault, id)).rejects.toThrow('Synthetic copy audit failure'); }
  finally { await db.query('DROP TRIGGER `' + prefix + 'audit`'); }
  expect(await db.query('SELECT COUNT(*) n FROM Page')).toEqual(count); await unchanged(id, before);
});
