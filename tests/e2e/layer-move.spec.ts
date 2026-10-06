import {test,expect,type Locator} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync} from 'node:fs';
import {createDataSource} from '@so7ob/server';
import {BLOCK_REGISTRY,type ContentNode} from '@so7ob/contracts';
import {getPortalContent} from '../../apps/web/src/content/portal';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en']as const)test(`${locale}: layer drag preserves IDs, constraints, undo and saved structure`,async({page},info)=>{
 test.setTimeout(90000);const te=getPortalContent(locale).admin.editor,{prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8')),db=await createDataSource().initialize();let id='';const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);const headers={'x-csrf-token':csrfToken};
  const created=await page.request.post('/api/admin/pages',{headers,data:{slug:prefix+'-layers-'+locale+'-'+info.project.name,titleAr:'نقل الطبقات',titleEn:'Layer moves'}});expect(created.status()).toBe(201);id=(await created.json()).page.id;
  const initial:ContentNode[]=[{id:'alpha',type:'heading',props:{text:'Movable heading'}},{id:'section',type:'section',children:[]},{id:'row',type:'row',children:[{id:'column',type:'column',children:[]}]}];const content=JSON.stringify({schemaVersion:1,blocks:initial});
  expect((await page.request.patch('/api/admin/pages/'+id,{headers,data:{baseRevision:0,draftBlocksAr:content,draftBlocksEn:content}})).status()).toBe(200);
  const stored=async()=>{const row=(await db.query('SELECT draftBlocksAr,draftBlocksEn FROM Page WHERE id=?',[id]))[0];return JSON.parse(row[locale==='ar'?'draftBlocksAr':'draftBlocksEn']).blocks as ContentNode[];};
  await page.goto(`/${locale}/admin/pages/${id}/edit`,{waitUntil:'networkidle'});
  const openLayers=async()=>{if(info.project.name==='mobile'){await page.getByRole('button',{name:te.library,exact:true}).click();}await page.getByRole('tab',{name:te.layers,exact:true}).click();};
  const closeLibrary=async()=>{if(info.project.name==='mobile'){await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:te.library,exact:true})).not.toBeVisible();}};
  await openLayers();const panel=page.getByRole('tabpanel').filter({has:page.getByRole('textbox',{name:te.searchLayers,exact:true})});await expect(panel).toHaveCSS('direction',locale==='ar'?'rtl':'ltr');
  if(info.project.name==='mobile'){const sheet=page.getByRole('dialog',{name:te.library,exact:true}),title=await sheet.getByRole('heading',{name:te.library,exact:true}).evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();return {x:rect.x,width:rect.width};}),close=await sheet.getByRole('button',{name:'Close',exact:true}).boundingBox();expect(title).not.toBeNull();expect(close).not.toBeNull();expect(locale==='ar'?close!.x+close!.width<=title!.x:title!.x+title!.width<=close!.x).toBe(true);}

  const handle=(type:'heading'|'section'|'row')=>panel.getByRole('button',{name:te.layerDragHandle+': '+BLOCK_REGISTRY[type][locale],exact:true});
  const into=(type:'section'|'row')=>handle(type).locator('xpath=ancestor::li[1]').getByRole('button',{name:te.dropIntoContainer,exact:true}).last();
  const drag=async(from:Locator,to:Locator)=>{await from.scrollIntoViewIfNeeded();await to.scrollIntoViewIfNeeded();await from.hover();const a=await from.boundingBox(),b=await to.boundingBox();expect(a).not.toBeNull();expect(b).not.toBeNull();await page.mouse.move(a!.x+a!.width/2,a!.y+a!.height/2);await page.mouse.down();await page.mouse.move(a!.x+a!.width/2+8,a!.y+a!.height/2,{steps:3});await expect(from).toHaveAttribute('aria-pressed','true');const target=await to.boundingBox();expect(target).not.toBeNull();await page.mouse.move(target!.x+target!.width/2,target!.y+target!.height/2,{steps:15});await info.attach('drag-target',{body:JSON.stringify({target:await to.boundingBox(),pointer:{x:target!.x+target!.width/2,y:target!.y+target!.height/2},live:await page.locator('[id^=DndLiveRegion]').allTextContents()}),contentType:'application/json'});await page.mouse.up();await page.keyboard.press('Control+s');};
  await drag(handle('heading'),handle('row'));await expect.poll(async()=>(await stored()).map(n=>n.id)).toEqual(['section','row','alpha']);
  await closeLibrary();await page.getByRole('button',{name:te.undo,exact:true}).click();await page.keyboard.press('Control+s');await expect.poll(async()=>(await stored()).map(n=>n.id)).toEqual(['alpha','section','row']);if(info.project.name==='mobile')await openLayers();
  await drag(handle('heading'),into('section'));await expect.poll(async()=>(await stored()).find(n=>n.id==='section')?.children?.map(n=>n.id)).toEqual(['alpha']);expect((await stored()).map(n=>n.id)).toEqual(['section','row']);
  const before=await stored();await drag(handle('heading'),into('row'));await expect(page.locator('[data-sonner-toast]').filter({hasText:te.moveNotAllowedHere})).toBeVisible();expect(await stored()).toEqual(before);
  await panel.getByRole('textbox',{name:te.searchLayers,exact:true}).fill(BLOCK_REGISTRY.heading[locale]);await expect(handle('heading')).toBeDisabled();await panel.getByRole('textbox',{name:te.searchLayers,exact:true}).fill('');await expect(handle('heading')).toBeEnabled();
  await closeLibrary();await page.getByRole('button',{name:te.undo,exact:true}).click();await page.keyboard.press('Control+s');await expect.poll(async()=>(await stored()).map(n=>n.id)).toEqual(['alpha','section','row']);await page.getByRole('button',{name:te.redo,exact:true}).click();await page.keyboard.press('Control+s');await expect.poll(async()=>(await stored()).find(n=>n.id==='section')?.children?.map(n=>n.id)).toEqual(['alpha']);
  await page.reload({waitUntil:'networkidle'});await openLayers();await expect(handle('heading')).toBeVisible();
  // Exercise the actual keyboard sensor after the pointer-specific correction.
  const sectionHandle=handle('section');await sectionHandle.focus();await page.keyboard.press('Space');await expect(sectionHandle).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-editor-drag-overlay="layers"]')).toHaveCSS('pointer-events','none');
  for(let step=0;step<8;step++){await page.keyboard.press('ArrowDown');if((await page.locator('[id^=DndLiveRegion]').allTextContents()).some(text=>text.includes('over droppable area row.')))break;}
  await expect(page.locator('[id^=DndLiveRegion]').filter({hasText:'over droppable area row.'})).toHaveCount(1);await page.keyboard.press('Space');await page.keyboard.press('Control+s');await expect.poll(async()=>(await stored()).map(n=>n.id)).toEqual(['row','section']);
  await handle('heading').focus();await expect(handle('heading')).toBeFocused();
  const savedToast=page.locator('[data-sonner-toast]').filter({hasText:te.saved});await expect(savedToast).toBeVisible();await expect(savedToast.getByRole('button',{name:'Close toast'})).toHaveCSS('width','24px');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();await info.attach('layer-axe',{body:JSON.stringify(axe.violations),contentType:'application/json'});expect(axe.violations).toEqual([]);expect(errors).toEqual([]);
 }finally{if(id){await db.query('DELETE FROM PageVersion WHERE pageId=?',[id]);await db.query('DELETE FROM Page WHERE id=?',[id]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);}await db.destroy();}
});
