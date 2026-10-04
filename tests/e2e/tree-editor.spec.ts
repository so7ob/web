import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createDataSource } from '@so7ob/server';
import { getPortalContent } from '../../apps/web/src/content/portal';
test.use({contextOptions:{reducedMotion:'reduce'}});
for (const locale of ['ar','en'] as const) test(`${locale}: tree editor templates, scheduling, revision conflict and accessibility`,async({page},info)=>{
 test.setTimeout(120000);
 const t=getPortalContent(locale),te=t.admin.editor,tt=t.admin.templates;
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
 const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const headers={'x-csrf-token':csrfToken};const db=await createDataSource().initialize();
 const slug=prefix+'-tree-'+locale+'-'+info.project.name;let id='';const templateIds:string[]=[];const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  const created=await page.request.post('/api/admin/pages',{headers,data:{slug,titleAr:'شجرة اصطناعية',titleEn:'Synthetic tree',template:'blank-section'}});expect(created.status()).toBe(201);id=(await created.json()).page.id;
  const detail=async()=> (await(await page.request.get('/api/admin/pages/'+id)).json()).page;
  const tree=JSON.stringify({schemaVersion:1,blocks:[{id:'section',type:'section',children:[{id:'container',type:'container',children:[{id:'row',type:'row',props:{columns:2},children:[{id:'column',type:'column',children:[{id:'heading',type:'heading',props:{text:'Nested heading'}}]}]}]}]}]});
  expect((await page.request.patch('/api/admin/pages/'+id,{headers,data:{baseRevision:0,draftBlocksAr:tree,draftBlocksEn:tree}})).status()).toBe(200);
  await page.goto(`/${locale}/admin/pages/${id}/edit`,{waitUntil:'networkidle'});
  await expect(page.getByRole('button',{name:tt.title,exact:true})).toBeVisible();
  await page.getByRole('button',{name:tt.title,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:tt.title,exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.locator('article')).toHaveCount(6);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await dialog.getByRole('button',{name:new RegExp(tt.saveFromCurrent)}).click();
  const templateName='Tree template '+locale+' '+info.project.name;
  await dialog.getByRole('textbox',{name:tt.formNameAr,exact:true}).fill(templateName);
  await dialog.getByRole('textbox',{name:tt.formNameEn,exact:true}).fill(templateName);
  await dialog.getByRole('button',{name:tt.saveAsTemplate,exact:true}).click();
  const card=dialog.locator('article').filter({has:page.getByRole('heading',{name:templateName,exact:true})});await expect(card).toBeVisible();
  const templates=(await(await page.request.get('/api/admin/templates')).json()).templates;const template=templates.find((x:{nameEn:string})=>x.nameEn===templateName);templateIds.push(template.id);
  expect(template[locale==='ar'?'arNodeCount':'enNodeCount']).toBe(5);
  await card.getByRole('button',{name:tt.applyTo,exact:true}).click();
  const confirm=page.getByRole('alertdialog',{name:tt.applyConfirmTitle});await expect(confirm).toBeVisible();
  await confirm.getByRole('button',{name:tt.apply,exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async()=>(await detail()).draftRevision).toBe(2);
  expect((await detail())[locale==='ar'?'draftBlocksAr':'draftBlocksEn']).toContain('Nested heading');
  // The latest template application is a draft: publication remains an explicit action.
  expect((await page.request.get(`/${locale}/${slug}`)).status()).toBe(404);
  await page.getByRole('button',{name:te.publish,exact:true}).click();
  await expect.poll(async()=>(await detail()).status).toBe('published');
  expect(await(await page.request.get(`/${locale}/${slug}`)).text()).toContain('Nested heading');
  await page.getByRole('button',{name:te.schedule,exact:true}).click();
  const schedule=page.getByRole('dialog',{name:te.schedule,exact:true});await expect(schedule).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  const when=await page.evaluate(()=>{const d=new Date(Date.now()+3600000);const p=(v:number)=>String(v).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;});
  await schedule.locator('#schedule-when').fill(when);await schedule.getByRole('button',{name:te.scheduleConfirm,exact:true}).click();
  await expect(schedule).not.toBeVisible();await expect.poll(async()=>(await detail()).scheduledRevision).toBe(2);
  await page.getByRole('button',{name:te.schedule,exact:true}).click();await schedule.getByRole('button',{name:te.scheduleCancelSchedule,exact:true}).click();
  await expect.poll(async()=>(await detail()).scheduledPublishAt).toBeNull();await page.keyboard.press('Escape');
  // Make a draft visible in this editor, then simulate another editor's later save.
  let current=await detail();await page.request.patch('/api/admin/pages/'+id,{headers,data:{baseRevision:current.draftRevision,draftSettings:{...current.draftSettings,seoTitleEn:'First edit'}}});
  await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('button',{name:te.discard,exact:true})).toBeVisible();
  current=await detail();await page.request.patch('/api/admin/pages/'+id,{headers,data:{baseRevision:current.draftRevision,draftSettings:{...current.draftSettings,seoTitleEn:'Other editor must survive'}}});
  let discardRequests=0;page.on('request',req=>{if(req.url().endsWith('/discard'))discardRequests++;});
  await page.getByRole('button',{name:te.discard,exact:true}).click();const discard=page.getByRole('alertdialog',{name:te.discard,exact:true});await expect(discard).toBeVisible();
  await discard.getByRole('button',{name:te.discardConfirm,exact:true}).click();
  await expect(page.getByRole('dialog',{name:te.conflictTitle})).toBeVisible();
  expect(discardRequests).toBe(1);expect((await detail()).draftSettings.seoTitleEn).toBe('Other editor must survive');
  await page.getByRole('dialog',{name:te.conflictTitle}).getByRole('button',{name:te.conflictLoadServer,exact:true}).click();
  await expect(page.getByRole('dialog',{name:te.conflictTitle})).not.toBeVisible();
  await expect(page.getByRole('button',{name:tt.title,exact:true})).toBeVisible();
  // Select the section using its real outer hit area; children remain independently interactive.
  const section=page.locator('[data-editor-node]').first();
  const sectionSelect=section.locator(':scope > div > button').first();
  await sectionSelect.click({position:{x:4,y:20}});
  if(info.project.name==='mobile'){
   const properties=page.getByRole('dialog',{name:te.properties,exact:true});await expect(properties).toBeVisible();await page.keyboard.press('Escape');await expect(properties).not.toBeVisible();
  }
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  await info.attach('tree-editor-axe',{body:JSON.stringify(axe.violations,null,2),contentType:'application/json'});
  expect(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
  mkdirSync('.migration/editor-refresh/captures',{recursive:true});await page.screenshot({path:`.migration/editor-refresh/captures/${locale}-${info.project.name}.png`,fullPage:true});
  writeFileSync(`.migration/editor-refresh/captures/${locale}-${info.project.name}.json`,JSON.stringify({sourceSHA:'fc4a959e87e7c3750a0546f9d4fa10e31ac3b63c',locale,viewport:page.viewportSize(),errors,axe:axe.violations},null,2));
  expect(errors).toEqual([]);
 }finally{
  if(id){await db.query('DELETE FROM PageVersion WHERE pageId=?',[id]);await db.query('DELETE FROM Page WHERE id=?',[id]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);}
  for(const tid of templateIds){await db.query('DELETE FROM PageTemplate WHERE id=?',[tid]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[tid]);}
  await db.destroy();
 }
});
