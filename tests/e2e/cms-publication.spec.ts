import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
const login = async (context: APIRequestContext, actor: string) => {
    const { prefix, password } = JSON.parse(readFileSync('.migration/e2e/run.json', 'utf8'));
    const { csrfToken } = await (await context.get('/api/auth/csrf')).json();
    expect((await context.post('/api/auth/callback/credentials', { form: { email: prefix + actor + '@example.invalid', password, csrfToken, json: 'true' } })).status()).toBe(200);
    return { 'x-csrf-token': csrfToken };
};
test('revision publication keeps draft settings private and immediately updates HTML, redirects and scheduling contracts', async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true }), guest = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
    const db = await createDataSource().initialize();
    let id = '';
    const slug = 'publication-' + Date.now();
    try {
        const headers = await login(admin, 'admin');
        const created = await admin.post('/api/admin/pages', { headers, data: { slug, titleAr: 'داخلي', titleEn: 'Internal', template: 'blank-section' } });
        expect(created.status()).toBe(201);
        id = (await created.json()).page.id;
        const detail = async () => (await (await admin.get('/api/admin/pages/' + id)).json()).page;
        expect((await admin.post(`/api/v1/admin/pages/${id}/publish`, { headers, data: { baseRevision: 0 } })).status()).toBe(200);
        const before = await detail();
        const settings = { ...before.draftSettings, slug: slug + '-live', titleEn: 'Visible published title', seoTitleEn: 'Publication SEO', seoDescEn: 'Publication description' };
        expect((await admin.patch('/api/v1/admin/pages/' + id, { headers, data: { baseRevision: 0, draftSettings: settings, draftBlocksEn: JSON.stringify({ schemaVersion: 1, blocks: [{ id: 'title', type: 'heading', props: { text: 'New live content' } }] }) } })).status()).toBe(200);
        expect((await guest.get('/en/' + settings.slug)).status()).toBe(404);
        const oldHtml = await (await guest.get('/en/' + slug)).text();
        expect(oldHtml).not.toContain('New live content');
        expect(oldHtml).not.toContain('Publication SEO');
        expect((await admin.post(`/api/admin/pages/${id}/publish`, { headers, data: { baseRevision: 0 } })).status()).toBe(409);
        expect((await admin.post(`/api/admin/pages/${id}/publish`, { headers, data: { baseRevision: 1, locales: ['en'] } })).status()).toBe(200);
        const live = await guest.get('/en/' + settings.slug);
        expect(live.status()).toBe(200);
        const html = await live.text();
        expect(html).toContain('New live content');
        expect(html).toContain('Publication SEO');
        expect(html).toContain('Publication description');
        expect(html).not.toContain('draftSettings');
        expect((await guest.get('/en/' + slug, { maxRedirects: 0 })).status()).toBe(307);
        expect((await admin.post(`/api/admin/pages/${id}/schedule`, { data: { baseRevision: 1, publishAt: new Date(Date.now() + 60000).toISOString() } })).status()).toBe(403);
        expect((await guest.post(`/api/admin/pages/${id}/schedule`, { data: { baseRevision: 1, publishAt: null } })).status()).toBe(401);
        expect((await admin.post(`/api/v1/admin/pages/${id}/schedule`, { headers, data: { baseRevision: 1, publishAt: new Date(Date.now() + 60000).toISOString() } })).status()).toBe(200);
        expect((await detail()).scheduledRevision).toBe(1);
        expect((await admin.post(`/api/admin/pages/${id}/schedule`, { headers, data: { publishAt: null } })).status()).toBe(200);
        expect((await admin.patch('/api/admin/pages/' + id, { headers, data: { baseRevision: 1, draftSettings: { ...settings, seoTitleEn: 'Discard SEO' } } })).status()).toBe(200);
        expect((await admin.post(`/api/v1/admin/pages/${id}/discard`, { headers, data: { baseRevision: 2 } })).status()).toBe(200);
        expect((await detail()).draftSettings.seoTitleEn).toBe('Publication SEO');
        expect((await admin.post(`/api/v1/admin/pages/${id}/versions/1/restore`, { headers, data: { baseRevision: 3, locale: 'en' } })).status()).toBe(200);
        expect((await detail()).draftRevision).toBe(4);
    }
    finally {
        if (id) {
            await db.query('DELETE FROM PageVersion WHERE pageId=?', [id]);
            await db.query('DELETE FROM Page WHERE id=?', [id]);
            await db.query('DELETE FROM AuditLog WHERE entityId=?', [id]);
        }
        await db.query('DELETE FROM PageRedirect WHERE fromSlug=?', [slug]);
        await db.destroy();
        await admin.dispose();
        await guest.dispose();
    }
});
