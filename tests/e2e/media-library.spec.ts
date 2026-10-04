import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync,unlinkSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {createDataSource} from '@so7ob/server';
import {getPortalContent} from '../../apps/web/src/content/portal';
for(const locale of ['ar','en']as const)test(`${locale}: media upload, folders, search and in-use deletion barrier`,async({page},info)=>{
 test.setTimeout(60000);const t=getPortalContent(locale),m=t.admin.media,{prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8')),db=await createDataSource().initialize();
 const suffix=randomBytes(5).toString('hex'),folder='synthetic-'+suffix,filename='image-'+suffix+'.png';let id='',pageId='',storedName='';const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);const headers={'x-csrf-token':csrfToken};
  let release!:()=>void;const chunkGate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/assets/media-*.js',async route=>{await chunkGate;await route.continue();});
  try{
   await page.goto(`/${locale}/admin/media`,{waitUntil:'commit'});await expect(page.getByRole('heading',{name:m.title,exact:true})).toBeVisible();
   for(const selector of ['#media-folder','#media-alt','#media-file'])await expect(page.locator(selector)).toBeDisabled();
   await expect(page.getByRole('button',{name:m.upload,exact:true})).toBeDisabled();
  }finally{release();}
  await expect(page.locator('#media-folder')).toBeEnabled();
  await page.locator('#media-folder').fill(folder);await page.locator('#media-alt').fill('Synthetic blue image');await page.locator('#media-file').setInputFiles({name:filename,mimeType:'image/png',buffer:await sharp({create:{width:16,height:16,channels:3,background:'#12486b'}}).png().toBuffer()});
  const upload=page.waitForResponse(r=>r.url().endsWith('/api/admin/media')&&r.request().method()==='POST');await page.getByRole('button',{name:m.upload,exact:true}).click();const response=await upload;expect(response.status()).toBe(201);id=(await response.json()).media.id;
  const card=page.locator('article').filter({has:page.getByText(filename,{exact:true})});await expect(card).toBeVisible();const [record]=await db.query('SELECT storedName,folder,altText FROM MediaItem WHERE id=?',[id]);storedName=record.storedName;expect(record.folder).toBe(folder);expect(record.altText).toBe('Synthetic blue image');
  await page.getByRole('textbox',{name:m.search,exact:true}).fill('nothing-'+suffix);await expect(card).toHaveCount(0);await page.getByRole('textbox',{name:m.search,exact:true}).fill(filename);await expect(card).toBeVisible();
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/admin/media/'+id)&&r.request().method()==='PATCH');await card.getByRole('textbox',{name:m.alt+' — '+filename}).fill('Updated alternative text');await page.keyboard.press('Tab');expect((await saved).status()).toBe(200);expect((await db.query('SELECT altText FROM MediaItem WHERE id=?',[id]))[0].altText).toBe('Updated alternative text');
  const created=await page.request.post('/api/admin/pages',{headers,data:{slug:prefix+'-'+suffix,titleAr:'موضع الصورة',titleEn:'Image usage location'}});expect(created.status()).toBe(201);pageId=(await created.json()).page.id;
  const blocks=JSON.stringify([{id:'image',type:'image',props:{src:'/api/media/'+id,alt:'Synthetic image'}}]);expect((await page.request.patch('/api/admin/pages/'+pageId,{headers,data:{baseRevision:0,draftBlocksAr:blocks}})).status()).toBe(200);
  await page.reload();await page.getByRole('textbox',{name:m.search,exact:true}).fill(filename);await expect(card).toBeVisible();
  await page.getByRole('group',{name:m.usageFilterLabel}).getByRole('button',{name:m.usageFilterInUse,exact:true}).click();await expect(card).toBeVisible();
  await card.hover();await card.getByRole('button',{name:m.delete,exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:m.delete,exact:true}).click();
  const blocked=page.getByRole('alertdialog',{name:m.deleteBlockedTitle});await expect(blocked).toBeVisible();await expect(blocked).toContainText(locale==='ar'?'موضع الصورة':'Image usage location');
  // Radix keeps the closing confirmation mounted for its exit animation. A visible
  // replacement does not imply that the previous dialog or its painted colors settled.
  const handoff=await page.locator('[data-slot="alert-dialog-content"]').evaluateAll(nodes=>nodes.map(node=>({state:node.getAttribute('data-state'),opacity:getComputedStyle(node).opacity,animations:node.getAnimations().map(a=>a.playState)})));
  await expect(page.locator('[data-slot="alert-dialog-content"][data-state="closed"]')).toHaveCount(0);
  await blocked.evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished));});
  await expect(page.getByRole('alertdialog')).toHaveCount(1);
  await expect(blocked).toHaveCSS('opacity','1');
  const handoffDirectory='.migration/media-library/browser';mkdirSync(handoffDirectory,{recursive:true});writeFileSync(`${handoffDirectory}/${locale}-${info.project.name}-handoff.json`,JSON.stringify({handoff,settled:true},null,2));
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');await expect(blocked).not.toBeVisible();
  // Clear current usage through the real revision API. Historical versions are validated on restore.
  expect((await page.request.patch('/api/v1/admin/pages/'+pageId,{headers,data:{baseRevision:1,draftBlocksAr:'[]'}})).status()).toBe(200);
  await page.reload();await page.getByRole('textbox',{name:m.search,exact:true}).fill(filename);await expect(card).toBeVisible();await card.hover();
  const directory='.migration/media-library/browser';mkdirSync(directory,{recursive:true});await page.screenshot({path:`${directory}/${locale}-${info.project.name}.png`,fullPage:true});const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(axe.violations).toEqual([]);expect(errors).toEqual([]);writeFileSync(`${directory}/${locale}-${info.project.name}.json`,JSON.stringify({locale,width:info.project.use.viewport?.width,axe:axe.violations,errors},null,2));
  await card.getByRole('button',{name:m.delete,exact:true}).click();const removed=page.waitForResponse(r=>r.url().endsWith('/api/admin/media/'+id)&&r.request().method()==='DELETE');await page.getByRole('alertdialog').getByRole('button',{name:m.delete,exact:true}).click();expect((await removed).status()).toBe(200);await expect(card).toHaveCount(0);expect(await db.query('SELECT id FROM MediaItem WHERE id=?',[id])).toHaveLength(0);
 }finally{
  if(pageId){await db.query('DELETE FROM PageVersion WHERE pageId=?',[pageId]);await db.query('DELETE FROM Page WHERE id=?',[pageId]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[pageId]);}
  if(id){await db.query('DELETE FROM MediaItem WHERE id=?',[id]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);}
  if(storedName){await db.query('DELETE FROM FileCleanupJob WHERE storedName=?',[storedName]);const {dataDir}=JSON.parse(readFileSync('.migration/e2e/storage.json','utf8'));try{unlinkSync(dataDir+'/uploads/'+storedName);}catch{/* Already removed by an owned cleanup worker. */}}
  await db.destroy();
 }
});
