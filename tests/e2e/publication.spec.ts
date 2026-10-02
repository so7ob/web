import { test,expect } from '@playwright/test';
import { createDataSource } from '@so7ob/server';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

test('publication updates HTML and SEO immediately; redirects and page authorization survive direct requests',async({page})=>{
  const db=await createDataSource().initialize(); const id='publication'+randomBytes(8).toString('hex'); const slug=id.toLowerCase();
  const blocks=(title:string)=>JSON.stringify([{id:'synthetic-hero',type:'hero',props:{title,titleAccent:'',description:'Synthetic published content'}}]);
  try {
    await db.query('INSERT INTO Page(id,slug,titleAr,titleEn,status,visibility,allowedRoles,publishedBlocksAr,publishedBlocksEn,draftBlocksAr,draftBlocksEn,seoTitleEn) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[id,slug,'منشور اصطناعي','Synthetic publication','published','public','[]',blocks('نسخة أولى'),blocks('First published revision'),blocks('PRIVATE DRAFT'),blocks('PRIVATE DRAFT'),'First SEO revision']);
    const first=await page.request.get('/en/'+slug); const html=await first.text(); expect(first.status()).toBe(200); expect(html).toContain('First published revision'); expect(html).toContain('First SEO revision'); expect(html).not.toContain('PRIVATE DRAFT');
    await db.query('UPDATE Page SET publishedBlocksEn=?,seoTitleEn=? WHERE id=?',[blocks('Second published revision'),'Second SEO revision',id]);
    const second=await page.request.get('/en/'+slug); expect(second.headers()['cache-control']).toBe('no-store'); const published=await second.text(); expect(published).toContain('Second published revision'); expect(published).toContain('Second SEO revision'); expect(published).not.toContain('First published revision');
    await db.query('INSERT INTO PageRedirect(id,fromSlug,toSlug) VALUES(?,?,?)',[id,slug+'-old',slug]);
    const redirect=await page.request.get('/en/'+slug+'-old',{maxRedirects:0}); expect(redirect.status()).toBe(307); expect(redirect.headers().location).toBe('/en/'+slug);
    await db.query("UPDATE Page SET visibility='role',allowedRoles=? WHERE id=?",[JSON.stringify(['content_editor']),id]);
    const anonymous=await page.request.get('/en/'+slug,{maxRedirects:0}); expect(anonymous.status()).toBe(307); expect(anonymous.headers().location).toBe('/en/auth/login?next=/en/'+slug);
    const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
    const login=async(actor:string)=>{const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json(); const response=await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+actor+'@example.invalid',password,csrfToken,json:'true'}});expect(response.status()).toBe(200);};
    await login('owner'); expect((await page.request.get('/en/'+slug)).status()).toBe(404); expect((await page.request.get('/api/v1/public/view',{params:{path:'/en/'+slug}})).status()).toBe(404);
    await login('editor'); const authorized=await page.goto('/en/'+slug); expect(authorized?.status()).toBe(200); await expect(page.locator('h1')).toContainText('Second published revision'); await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex, nofollow');
    const dto=await(await page.request.get('/api/v1/public/view',{params:{path:'/en/'+slug}})).json(); expect(dto.page).not.toHaveProperty('draftBlocksEn'); expect(dto.page).not.toHaveProperty('allowedRoles');
    const sitemap=await(await page.request.get('/sitemap.xml')).text(); expect(sitemap).not.toContain(slug);
  } finally { await db.query('DELETE FROM PageRedirect WHERE id=?',[id]); await db.query('DELETE FROM Page WHERE id=?',[id]); await db.destroy(); }
});
