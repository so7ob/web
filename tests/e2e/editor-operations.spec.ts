import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createDataSource} from '@so7ob/server';
import {getPortalContent} from '../../apps/web/src/content/portal';
test.use({contextOptions:{reducedMotion:'reduce'}});
for(const locale of ['ar','en'] as const)test(`${locale}: inline editing, keyboard sorting, clipboard, duplicate, delete and history persist`,async({page},info)=>{
 test.setTimeout(120000);page.setDefaultTimeout(15000);const te=getPortalContent(locale).admin.editor;
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
 const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const headers={'x-csrf-token':csrfToken},db=await createDataSource().initialize();let id='';
 try{
  const create=await page.request.post('/api/admin/pages',{headers,data:{slug:prefix+'-operations-'+locale+'-'+info.project.name,titleAr:'عمليات',titleEn:'Operations'}});id=(await create.json()).page.id;
  const blocks=JSON.stringify({schemaVersion:1,blocks:[{id:'alpha',type:'heading',props:{text:'Alpha'}},{id:'beta',type:'heading',props:{text:'Beta'}}]});
  expect((await page.request.patch('/api/admin/pages/'+id,{headers,data:{baseRevision:0,draftBlocksAr:blocks,draftBlocksEn:blocks}})).status()).toBe(200);
  const stored=async()=>{const p=(await(await page.request.get('/api/admin/pages/'+id)).json()).page;return JSON.parse(p[locale==='ar'?'draftBlocksAr':'draftBlocksEn']).blocks as Array<{id:string;props:{text:string}}>;};
  const save=async()=>{await page.keyboard.press('Control+s');};
  const closeSheet=async()=>{const sheet=page.getByRole('dialog',{name:te.properties,exact:true});if(await sheet.isVisible()){await page.keyboard.press('Escape');await expect(sheet).not.toBeVisible();}};
  await page.goto(`/${locale}/admin/pages/${id}/edit`,{waitUntil:'networkidle'});
  const alpha=page.locator('[data-editor-node="alpha"]');await expect(alpha).toBeVisible();
  await alpha.locator('button[aria-label^="'+te.selectedBlock+':"]').click();await closeSheet();
  await alpha.getByRole('button',{name:te.inlineEdit,exact:true}).click();
  const editable=alpha.locator('[contenteditable="true"][data-editable-field="text"]');await expect(editable).toBeVisible();
  await page.evaluate(()=>{const events:unknown[]=[];(window as unknown as {inlineEvents:unknown[]}).inlineEvents=events;for(const type of ['keydown','focusin','focusout','input'])document.addEventListener(type,event=>{const e=event as KeyboardEvent,target=e.target as HTMLElement;events.push({type,key:e.key,tag:target.tagName,text:target.textContent?.slice(0,50),editable:target.isContentEditable});},true);});
  await editable.fill('Cancelled edit');await editable.press('Escape');await save();
  await info.attach('inline-focus-events',{body:JSON.stringify(await page.evaluate(()=>(window as unknown as {inlineEvents:unknown[]}).inlineEvents),null,2),contentType:'application/json'});
  expect((await stored()).find(n=>n.id==='alpha')?.props.text).toBe('Alpha');
  await alpha.getByRole('button',{name:te.inlineEdit,exact:true}).click();await editable.fill('Inline persisted '+locale);await editable.press('Enter');await page.keyboard.press('Escape');await save();
  await expect.poll(async()=>(await stored()).find(n=>n.id==='alpha')?.props.text).toBe('Inline persisted '+locale);
  await alpha.locator('button[aria-label^="'+te.selectedBlock+':"]').click();await closeSheet();
  // Sort using dnd-kit's actual keyboard sensor and verify stored sibling order.
  const handle=alpha.getByRole('button',{name:te.blocks,exact:true});await handle.focus();await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-editor-drag-overlay="canvas"]')).toHaveCSS('pointer-events','none');
  await expect(page.locator('[id^=DndLiveRegion]')).toContainText('over droppable area alpha');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[id^=DndLiveRegion]')).toContainText('over droppable area beta');
  await page.keyboard.press('Space');
  await expect(page.locator('[id^=DndLiveRegion]')).toContainText('dropped over droppable area beta');
  await save();
  await expect.poll(async()=>(await stored()).map(n=>n.id)).toEqual(['beta','alpha']);
  await alpha.getByRole('button',{name:te.copyToClipboard,exact:true}).click();
  await page.getByRole('button',{name:te.pasteFromClipboard,exact:true}).click();await page.getByRole('menuitem',{name:new RegExp('^'+te.paste+' —')}).first().click();await closeSheet();await save();
  await expect.poll(async()=>(await stored()).length).toBe(3);const pasted=(await stored()).find(n=>!['alpha','beta'].includes(n.id))!;
  expect(pasted.props.text).toBe('Inline persisted '+locale);
  const pastedNode=page.locator(`[data-editor-node="${pasted.id}"]`);await pastedNode.locator('button[aria-label^="'+te.selectedBlock+':"]').click();await closeSheet();await pastedNode.getByRole('button',{name:te.duplicate,exact:true}).click();await closeSheet();await save();
  await expect.poll(async()=>(await stored()).length).toBe(4);expect(new Set((await stored()).map(n=>n.id)).size).toBe(4);
  await pastedNode.locator('button[aria-label^="'+te.selectedBlock+':"]').click();await closeSheet();await pastedNode.getByRole('button',{name:te.delete,exact:true}).click();const confirm=page.getByRole('alertdialog',{name:te.confirmDelete,exact:true});await confirm.getByRole('button',{name:te.delete,exact:true}).click();await save();await expect.poll(async()=>(await stored()).length).toBe(3);
  await page.getByRole('button',{name:te.undo,exact:true}).click();await save();await expect.poll(async()=>(await stored()).length).toBe(4);
  await page.getByRole('button',{name:te.redo,exact:true}).click();await save();await expect.poll(async()=>(await stored()).length).toBe(3);
  await page.reload({waitUntil:'networkidle'});await expect(page.locator('[data-editor-node]')).toHaveCount(3);
  expect((await stored()).filter(n=>n.props.text==='Inline persisted '+locale)).toHaveLength(2);
 }finally{if(id){await db.query('DELETE FROM PageVersion WHERE pageId=?',[id]);await db.query('DELETE FROM Page WHERE id=?',[id]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);}await db.destroy();}
});
test('editor interaction test validates the actual form without submitting or replacing a real local draft',async({page})=>{
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const headers={'x-csrf-token':csrfToken},db=await createDataSource().initialize();let id='';
 try{
  const created=await page.request.post('/api/admin/pages',{headers,data:{slug:prefix+'-simulation',titleAr:'محاكاة',titleEn:'Simulation'}});id=(await created.json()).page.id;
  const tree=JSON.stringify({schemaVersion:1,blocks:[{id:'form',type:'requestForm',props:{showPrivacy:false,showNextSteps:false}}]});
  expect((await page.request.patch('/api/admin/pages/'+id,{headers,data:{baseRevision:0,draftBlocksAr:tree,draftBlocksEn:tree}})).status()).toBe(200);
  await page.addInitScript(()=>localStorage.setItem('so7ob-request-draft',JSON.stringify({description:'Keep my real draft',name:'Real draft placeholder'})));
  let submitted=0;
  page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/requests')submitted++;});
  await page.goto(`/en/admin/pages/${id}/edit`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:getPortalContent('en').admin.editor.testMode,exact:true}).click();
  const form=page.locator('form[aria-labelledby="form-title"]');await expect(form).toBeVisible();
  await form.locator('button[type=submit]').click();await expect(form.locator('#description')).toHaveAttribute('aria-invalid','true');
  await form.locator('#description').pressSequentially('Synthetic preview of accessible project request interactions without sending a real customer request.',{delay:25});
  await form.locator('#name').fill('Synthetic preview');await form.locator('#email').fill('preview@example.invalid');
  await form.locator('button[type=submit]').click();await expect(page.getByRole('status').filter({hasText:'TEST-'})).toBeVisible();
  expect(submitted).toBe(0);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('so7ob-request-draft')!).description)).toBe('Keep my real draft');
  expect((await db.query('SELECT id FROM ProjectRequest WHERE email=?',['preview@example.invalid']))).toHaveLength(0);
 }finally{if(id){await db.query('DELETE FROM PageVersion WHERE pageId=?',[id]);await db.query('DELETE FROM Page WHERE id=?',[id]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);}await db.destroy();}
});
test('publication drains edits made while its save request is in flight',async({page})=>{
 test.setTimeout(60000);const te=getPortalContent('en').admin.editor;
 const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
 expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
 const headers={'x-csrf-token':csrfToken},db=await createDataSource().initialize();let id='';let release=()=>{};
 try{
  id=(await(await page.request.post('/api/admin/pages',{headers,data:{slug:prefix+'-inflight',titleAr:'حفظ',titleEn:'In-flight save'}})).json()).page.id;
  const content=JSON.stringify({schemaVersion:1,blocks:[{id:'heading',type:'heading',props:{text:'Original'}}]});
  expect((await page.request.patch('/api/admin/pages/'+id,{headers,data:{baseRevision:0,draftBlocksAr:content,draftBlocksEn:content}})).status()).toBe(200);
  await page.goto(`/en/admin/pages/${id}/edit`,{waitUntil:'networkidle'});
  const node=page.locator('[data-editor-node="heading"]'),selection=node.locator('button[aria-label^="'+te.selectedBlock+':"]');
  await selection.click();const sheet=page.getByRole('dialog',{name:te.properties,exact:true});if(await sheet.isVisible()){await page.keyboard.press('Escape');await expect(sheet).not.toBeVisible();}
  await node.getByRole('button',{name:te.inlineEdit,exact:true}).click();let editable=node.locator('[contenteditable="true"]');await editable.fill('First save');await editable.press('Enter');
  let held=false;const barrier=new Promise<void>(r=>{release=r;});
  await page.route('**/api/admin/pages/'+id,async route=>{if(route.request().method()==='PATCH'&&!held){held=true;await barrier;}await route.continue();});
  await page.getByRole('button',{name:te.publish,exact:true}).click();await expect.poll(()=>held).toBe(true);
  await node.getByRole('button',{name:te.inlineEdit,exact:true}).click();editable=node.locator('[contenteditable="true"]');await editable.fill('Edited during save');await editable.press('Enter');release();
  const detail=async()=>(await(await page.request.get('/api/admin/pages/'+id)).json()).page;
  await expect.poll(async()=>(await detail()).status).toBe('published');
  const row=(await db.query('SELECT publishedBlocksEn,draftBlocksEn,publishedRevision,draftRevision FROM Page WHERE id=?',[id]))[0];
  expect(row.publishedBlocksEn).toContain('Edited during save');expect(row.publishedBlocksEn).toBe(row.draftBlocksEn);expect(row.publishedRevision).toBe(row.draftRevision);
 }finally{release();if(id){await db.query('DELETE FROM PageVersion WHERE pageId=?',[id]);await db.query('DELETE FROM Page WHERE id=?',[id]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[id]);}await db.destroy();}
});
