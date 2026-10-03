import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDataSource } from '@so7ob/server';
import { randomBytes } from 'node:crypto';

for (const locale of ['ar','en'] as const) test(`${locale}: published v1 tree renders SSR, responsive styles and keyboard links without draft leakage`, async ({page}, info) => {
  const db=await createDataSource().initialize();
  const id='tree'+randomBytes(8).toString('hex');
  const title=locale==='ar'?'عنوان الشجرة الاصطناعية':'Synthetic tree heading';
  const content=JSON.stringify({schemaVersion:1,blocks:[{id:'section',type:'section',anchorId:'tree-root',style:{base:{paddingY:'sm',background:'white'},desktop:{paddingY:'lg'}},children:[{id:'row',type:'row',children:[{id:'column',type:'column',children:[{id:'heading',type:'heading',props:{text:title,level:2}},{id:'text',type:'text',props:{paragraphs:['Synthetic nested content']}},{id:'link',type:'buttonLink',props:{label:'Tree contact',href:'/contact'}}]}]}]}]});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await db.query('INSERT INTO Page(id,slug,titleAr,titleEn,status,publishedBlocksAr,publishedBlocksEn,draftBlocksAr,draftBlocksEn) VALUES(?,?,?,?,?,?,?,?,?)',[id,id,title,title,'published',content,content,'PRIVATE DRAFT','PRIVATE DRAFT']);
    const res=await page.request.get(`/${locale}/${id}`);
    expect(res.status()).toBe(200);
    const html=await res.text();expect(html).toContain(title);expect(html).not.toContain('PRIVATE DRAFT');
    await page.goto(`/${locale}/${id}`);
    await expect(page.locator('#tree-root h2')).toHaveText(title);
    await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
    await expect(page.locator('#tree-root')).toHaveCSS('padding-top',info.project.name==='mobile'?'24px':'80px');
    await expect(page.locator('#tree-root')).toHaveCSS('background-color','rgb(255, 255, 255)');
    const link=page.getByRole('link',{name:'Tree contact',exact:true});await link.focus();await expect(link).toBeFocused();
    expect((await new AxeBuilder({page}).include('#tree-root').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({path:`.migration/content-tree/${locale}-${info.project.name}.png`,fullPage:true});
    await page.keyboard.press('Enter');await expect(page).toHaveURL(new RegExp(`/${locale}/contact$`));
    expect(errors).toEqual([]);
    await db.query('UPDATE Page SET publishedBlocksAr=?,publishedBlocksEn=? WHERE id=?',['{"schemaVersion":1,"blocks":[{"id":"bad","type":"unknown"}]}','{"schemaVersion":1,"blocks":[]}',id]);
    expect((await page.request.get(`/${locale}/${id}`)).status()).toBe(404);
  } finally { await db.query('DELETE FROM Page WHERE id=?',[id]);await db.destroy(); }
});
