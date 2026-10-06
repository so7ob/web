import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
import {createDataSource} from '@so7ob/server';
import {getPortalContent} from '../../apps/web/src/content/portal';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en'] as const)test(`${locale}: repeated property labels edit the intended item and survive save, publication and reload`,async({page},info)=>{
 const te=getPortalContent(locale).admin.editor,{prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
 const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const headers={'x-csrf-token':csrfToken},db=await createDataSource().initialize();let id='';
 try{
  id=(await(await page.request.post('/api/admin/pages',{headers,data:{slug:prefix+'-properties-'+locale+'-'+info.project.name,titleAr:'خصائص',titleEn:'Properties'}})).json()).page.id;
  const tree=JSON.stringify({schemaVersion:1,blocks:[{id:'features',type:'featureGrid',props:{kicker:'',title:'Outer',columns:'3',items:[{title:'First',body:'One'},{title:'Second',body:'Two'}]}}]});
  expect((await page.request.patch('/api/admin/pages/'+id,{headers,data:{baseRevision:0,draftBlocksAr:tree,draftBlocksEn:tree}})).status()).toBe(200);
  await page.goto(`/${locale}/admin/pages/${id}/edit`,{waitUntil:'networkidle'});
  await page.locator('[data-editor-node="features"]').locator('button[aria-label^="'+te.selectedBlock+':"]').click();
  const sheet=page.getByRole('dialog',{name:te.properties,exact:true});
  const panel=info.project.name==='mobile'?sheet:page;
  const second=panel.locator('input[value="Second"]');
  await expect(second).toBeVisible();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await second.locator('..').locator('label').click();await expect(second).toBeFocused();
  await page.keyboard.press('Control+a');await page.keyboard.insertText('Updated second '+locale);
  if(info.project.name==='mobile')await page.keyboard.press('Escape');
  await page.keyboard.press('Control+s');
  const field=locale==='ar'?'draftBlocksAr':'draftBlocksEn';
  await expect.poll(async()=>JSON.parse((await db.query('SELECT '+field+' content FROM Page WHERE id=?',[id]))[0].content).blocks[0].props.items[1].title).toBe('Updated second '+locale);
  await page.reload({waitUntil:'networkidle'});
  await page.locator('[data-editor-node="features"]').locator('button[aria-label^="'+te.selectedBlock+':"]').click();
  await expect(panel.locator('input[value="Updated second '+locale+'"]')).toBeVisible();
  if(info.project.name==='mobile')await page.keyboard.press('Escape');
  const detail=(await(await page.request.get('/api/admin/pages/'+id)).json()).page;
  expect((await page.request.post('/api/admin/pages/'+id+'/publish',{headers,data:{baseRevision:detail.draftRevision}})).status()).toBe(200);
  const row=(await db.query('SELECT publishedBlocksAr,publishedBlocksEn FROM Page WHERE id=?',[id]))[0];
  const props=JSON.parse(row[locale==='ar'?'publishedBlocksAr':'publishedBlocksEn']).blocks[0].props;
  expect(props.title).toBe('Outer');expect(props.items[0].title).toBe('First');expect(props.items[1].title).toBe('Updated second '+locale);
 }finally{if(id){await db.query('DELETE FROM PageVersion WHERE pageId=?',[id]);await db.query('DELETE FROM Page WHERE id=?',[id]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);}await db.destroy();}
});
