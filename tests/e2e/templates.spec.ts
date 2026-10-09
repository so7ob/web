import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
const login = async (context: APIRequestContext, actor: string) => {
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const { csrfToken } = await (await context.get('/api/auth/csrf')).json();
    expect((await context.post('/api/auth/callback/credentials', { form: { email: prefix + actor + '@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    return { 'x-csrf-token': csrfToken };
};
test('templates preserve legacy/v1 contracts, revision conflicts, private drafts, publication and restore', async ({ playwright, baseURL }) => {
    const editor = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const admin = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const client = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const guest = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const db = await createDataSource().initialize();
    const templateIds: string[] = [];
    let pageId = '';
    try {
        const eh = await login(editor, 'editor'), ah = await login(admin, 'admin');
        await login(client, 'owner');
        expect((await guest.get('/api/admin/templates')).status()).toBe(401);
        expect((await client.get('/api/v1/admin/templates')).status()).toBe(403);
        expect((await editor.post('/api/admin/templates', { data: { nameEn: 'No CSRF' } })).status()).toBe(403);
        expect((await editor.post('/api/admin/templates', { headers: { ...eh, origin: 'https://foreign.invalid' }, data: {} })).status()).toBe(403);
        const legacy = await editor.get('/api/admin/templates'), modern = await editor.get('/api/v1/admin/templates');
        expect(legacy.status()).toBe(200);
        expect(await modern.json()).toEqual(await legacy.json());
        const list = (await legacy.json()).templates;
        expect(list.filter((t: {
            kind: string;
        }) => t.kind === 'builtin')).toHaveLength(6);
        expect(list[0]).not.toHaveProperty('blocksAr');
        expect((await editor.delete('/api/admin/templates/' + list[0].id, { headers: eh })).status()).toBe(400);
        const created = await editor.post('/api/admin/pages', { headers: eh, data: { slug: 'tpl-' + Date.now(), titleAr: 'صفحة القالب', titleEn: 'Template page', template: 'blank-section' } });
        expect(created.status()).toBe(201);
        const page = (await created.json()).page;
        pageId = page.id;
        const content = JSON.stringify({ schemaVersion: 1, blocks: [{ id: 'title', type: 'heading', props: { text: 'PRIVATE TEMPLATE BODY' } }] });
        const c = await editor.post('/api/v1/admin/templates', { headers: eh, data: { nameEn: 'Synthetic template', blocksEn: content } });
        expect(c.status()).toBe(201);
        const template = (await c.json()).template;
        templateIds.push(template.id);
        expect(template.nameAr).toBe('Synthetic template');
        expect(template.hasAr).toBe(false);
        expect(JSON.stringify(template)).not.toContain('PRIVATE TEMPLATE BODY');
        expect((await editor.patch('/api/admin/templates/' + template.id, { headers: eh, data: { nameAr: 'اسم معدل', descEn: '' } })).status()).toBe(200);
        expect((await editor.post(`/api/admin/templates/${template.id}/apply`, { headers: eh, data: { pageId, locale: 'ar', baseRevision: 0 } })).status()).toBe(400);
        expect((await editor.post(`/api/admin/templates/${template.id}/apply`, { headers: eh, data: { pageId, locale: 'en' } })).status()).toBe(409);
        const results = await Promise.all(['/api/admin', '/api/v1/admin'].map(path => editor.post(`${path}/templates/${template.id}/apply`, { headers: eh, data: { pageId, locale: 'en', baseRevision: 0 } })));
        expect(results.map(r => r.status()).sort()).toEqual([200, 409]);
        expect((await guest.get('/en/' + page.slug)).status()).toBe(404);
        const detail = await (await editor.get('/api/admin/pages/' + pageId)).json();
        expect(detail.page.draftRevision).toBe(1);
        expect((await admin.post(`/api/admin/pages/${pageId}/publish`, { headers: ah })).status()).toBe(200);
        expect(await (await guest.get('/en/' + page.slug)).text()).toContain('PRIVATE TEMPLATE BODY');
        const [saved] = await db.query('SELECT blocks FROM PageVersion WHERE pageId=? AND locale=? ORDER BY version DESC LIMIT 1', [pageId, 'en']);
        expect(JSON.parse(saved.blocks).schemaVersion).toBe(1);
        expect((await admin.post(`/api/admin/pages/${pageId}/versions/1/restore`, { headers: ah })).status()).toBe(200);
        const restored = await (await editor.get('/api/admin/pages/' + pageId)).json();
        expect(restored.page.draftBlocksEn).not.toContain('PRIVATE TEMPLATE BODY');
        expect((await editor.delete('/api/v1/admin/templates/' + template.id, { headers: eh })).status()).toBe(200);
        expect((await editor.patch('/api/admin/templates/' + template.id, { headers: eh, data: { nameAr: 'gone' } })).status()).toBe(404);
    }
    finally {
        if (pageId) {
            await db.query('DELETE FROM PageVersion WHERE pageId=?', [pageId]);
            await db.query('DELETE FROM Page WHERE id=?', [pageId]);
        }
        for (const id of templateIds) {
            await db.query('DELETE FROM PageTemplate WHERE id=?', [id]);
            await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
        }
        await db.destroy();
        await Promise.all([editor, admin, client, guest].map(c => c.dispose()));
    }
});
test('template bodies authenticate before parsing and enforce byte/node limits above ordinary JSON size', async ({ playwright, baseURL }) => {
    const editor = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const guest = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const db = await createDataSource().initialize();
    let id = '';
    try {
        const headers = await login(editor, 'editor');
        const blocks = JSON.stringify({ schemaVersion: 1, blocks: Array.from({ length: 60 }, (_, i) => ({ id: 'text' + i, type: 'text', props: { paragraphs: ['x'.repeat(2500)] } })) });
        expect(Buffer.byteLength(blocks)).toBeGreaterThan(128 * 1024);
        expect(Buffer.byteLength(blocks)).toBeLessThan(300000);
        const made = await editor.post('/api/admin/templates', { headers, data: { nameEn: 'Large synthetic template', blocksEn: blocks } });
        expect(made.status()).toBe(201);
        id = (await made.json()).template.id;
        const tooLarge = JSON.stringify({ nameEn: 'Rejected', blocksEn: ' '.repeat(300001) });
        // Nonempty oversized content; whitespace-only is intentionally ignored by source contract.
        const response = await editor.post('/api/admin/templates', { headers, data: { nameEn: 'Rejected', blocksEn: blocks + ' '.repeat(300001) } });
        expect(response.status()).toBe(400);
        expect((await response.json()).code).toBe('content_too_large');
        const oversized = 'x'.repeat(4 * 1024 * 1024 + 1);
        expect((await guest.post('/api/v1/admin/templates', { headers: { 'content-type': 'application/json' }, data: oversized })).status()).toBe(401);
        expect((await editor.post('/api/v1/admin/templates', { headers: { ...headers, 'content-type': 'application/json' }, data: oversized })).status()).toBe(413);
        expect((await editor.post('/api/v1/admin/templates', { headers: { ...headers, 'content-type': 'application/json' }, data: tooLarge.slice(0, -1) })).status()).toBe(400);
    }
    finally {
        if (id) {
            await db.query('DELETE FROM PageTemplate WHERE id=?', [id]);
            await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
        }
        await db.destroy();
        await editor.dispose();
        await guest.dispose();
    }
});
