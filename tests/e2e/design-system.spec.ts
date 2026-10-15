import { expect, type Page } from '@playwright/test';
import { test } from './quota-fixture';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
import { createDataSource } from '@so7ob/server';
import { SETTING_SECTIONS, appearanceTokens, BLOCK_REGISTRY, defaultNode, validateContent, type BlockType } from '@so7ob/contracts';
import { getPortalContent } from '../../apps/web/src/content/portal';
import { auditCopy } from '../../apps/web/src/components/admin/audit/copy';
import { PerformanceLedger } from './performance';
import { documentAudit, VisualReadiness } from './visual-checks';

const frozenCoverage=JSON.parse(readFileSync(new URL('./fixtures/design-coverage.json',import.meta.url),'utf8')) as {views:string[];blockTypes:string[]};
const palette = {
  'appearance.primaryLight':'#9d174d', 'appearance.accentLight':'#0f766e',
  'appearance.primaryDark':'#f9a8d4', 'appearance.accentDark':'#5eead4',
};
const rgb=(hex:string)=>'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
// Full-page review PNGs already capture every view. Keep action traces on failure
// without duplicating hundreds of screenshots and DOM snapshots in temporary storage.
test.use({contextOptions:{reducedMotion:'reduce'},trace:{mode:'retain-on-failure',screenshots:false,snapshots:false}});
async function audit(page: Page, label: string, ledger: PerformanceLedger) {
  await page.evaluate(()=>document.fonts.ready);
  expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' overflow').toBe(true);
  for(const dialog of await page.locator('[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"]').filter({visible:true}).all())expect.soft(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth),label+' dialog overflow').toBe(true);
  for(const close of await page.locator('[data-slot="dialog-close"], [data-slot="sheet-close"]').filter({visible:true}).all()){
    const box=(await close.boundingBox())!;expect.soft(box.width,label+' close width').toBe(44);expect.soft(box.height,label+' close height').toBe(44);
  }
  const result=await ledger.measure('axe-page',()=>documentAudit(page,true));
  // Sandboxed editor/settings frames are independently measured below when present.
  expect.soft(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),label).toEqual([]);
  for(const frame of await page.locator('iframe[srcdoc]').all()){
    await expect(frame).toHaveAttribute('title',/.+/);
    const preview=await ledger.measure('preview-open',()=>page.context().newPage());
    try {
      await ledger.measure('preview-navigation',()=>preview.goto(new URL('/api/health/ready',page.url()).href));
      await preview.setContent((await frame.getAttribute('srcdoc'))!);
      await preview.evaluate(()=>document.fonts.ready);
      expect.soft((await ledger.measure('axe-preview',()=>documentAudit(preview))).violations,label+' preview').toEqual([]);
    } finally {await preview.close();}
  }
}
for(const locale of ['ar','en'] as const)for(const mode of ['light','dark'] as const)
 test(`${locale}/${mode}: every platform workspace follows the design system`,async({page},info)=>{
  test.setTimeout(480000);page.setDefaultTimeout(10000);
  const ledger=new PerformanceLedger(), readiness=new VisualReadiness(page), started=performance.now();
  const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
  const db=await createDataSource().initialize(),id=prefix+'design'+randomBytes(4).toString('hex');
  const keys=Object.keys(palette),saved=await db.query('SELECT * FROM SiteSetting WHERE `key` IN (?,?,?,?)',keys);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydration|did not match|server rendered/i.test(m.text()))errors.push(m.text());});
  page.on('response',response=>{if(response.status()>=500)errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);});
  const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
  expect((await ledger.measure('login',()=>page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}}))).status()).toBe(200);
  const headers={'x-csrf-token':csrfToken};let pageId='';
  const visited:string[]=[];
  const folder=`.migration/design-system/screenshots/${locale}-${info.project.name}-${mode}`;
  mkdirSync(folder,{recursive:true});
  async function capture(name:string){
    await ledger.measure('ready',()=>readiness.wait());
    await expect(page.locator('html')).toHaveAttribute('data-color-mode',mode);
    await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
    expect(errors,name+' failed responses or hydration').toEqual([]);
    await audit(page,name,ledger);
    await ledger.measure('screenshot',()=>page.screenshot({path:`${folder}/${name}.png`,fullPage:true}));visited.push(name);
  }
  async function captureTabs(name:string, scope=page.locator('main')){
    const tabs=scope.getByRole('tab').filter({visible:true});
    await expect(tabs.first()).toBeVisible();
    const count=await tabs.count();
    for(let i=0;i<count;i++){await tabs.nth(i).click();await expect.soft(tabs.nth(i)).toHaveCSS('color',rgb(appearanceTokens(palette,mode).primary));await capture(`${name}-tab-${i+1}`);}
  }
  async function visit(path:string,name=path.replaceAll('/','-').replaceAll('?','-').replaceAll('=','-')){
    const response=await ledger.measure('navigation',()=>page.goto(`/${locale}${path}`));
    expect(response?.status()).toBe(path==='/design-system-missing-page'?404:200);
    await capture(name||'home');
    if(path==='/admin/requests')await expect(page.locator('input[type=checkbox]').first()).toHaveCSS('accent-color',rgb(appearanceTokens(palette,mode).primary));
    if(['/admin/menus','/account/requests','/account/inquiries',`/admin/requests/${id}`,`/admin/inquiries/${id}`].includes(path))await captureTabs(name);
    if(path===`/admin/pages/${pageId}/preview` || path===`/admin/pages/${pageId}/edit`){
      const te=getPortalContent(locale).admin.editor;
      const editor=path.endsWith('/edit');
      for(const [device,label] of [['tablet',te.deviceTablet],['mobile',te.deviceMobile],['desktop',te.deviceDesktop]]){
        await page.getByRole('button',{name:label,exact:true}).filter({visible:true}).first().click();
        const host=editor?page.locator('[data-editor-node="leaf-surface"]'):page.locator('#leaf-surface');
        const painted=editor?host.locator('#leaf-surface'):host;
        const tokens=appearanceTokens(palette,mode);
        await expect(painted).toHaveCSS('background-color',rgb(device==='tablet'?tokens.emphasis:tokens.card));
        await expect(painted.locator('h2')).toHaveCSS('color',rgb(device==='tablet'?tokens['emphasis-foreground']:tokens.foreground));
        await capture((editor?'editor':'preview')+'-device-'+device);
      }
    }
    if(path===`/admin/pages/${pageId}/edit`){
      const t=getPortalContent(locale),te=t.admin.editor;
      for(const lang of ['en','ar']){await page.locator(`#editor-language-${lang}-${pageId}`).click();await capture('editor-language-'+lang);}
      if(info.project.name==='desktop')await captureTabs('editor-library',page.locator('aside').filter({has:page.getByRole('tab')}));
      else {
        const libraryTrigger=page.getByRole('button',{name:te.library,exact:true});await libraryTrigger.click();
        const library=page.getByRole('dialog',{name:te.library,exact:true});await captureTabs('editor-library',library);
        await page.keyboard.press('Escape');await expect(library).not.toBeVisible();await expect.soft(libraryTrigger).toBeFocused();
      }
      await page.locator('[data-editor-node="surface"]').locator('button[aria-label^="'+te.selectedBlock+':"]').first().focus();
      await page.keyboard.press('Enter');
      const sheet=page.getByRole('dialog',{name:te.properties,exact:true});
      await captureTabs('editor-properties',info.project.name==='mobile'?sheet:page.locator('aside').filter({has:page.getByRole('tab',{name:te.style,exact:true})}));
      if(await sheet.isVisible())await page.keyboard.press('Escape');
      const activeToolbar=page.locator('[data-editor-toolbar]:not([inert])');
      const toolbarBox=(await activeToolbar.boundingBox())!,contentBox=(await activeToolbar.locator('..').locator(':scope > [data-editor-content]').boundingBox())!;
      expect.soft(toolbarBox.y+toolbarBox.height,'canvas toolbar must not cover content').toBeLessThanOrEqual(contentBox.y);
      for(const control of await page.locator('[data-editor-toolbar]:not([inert]) button').filter({visible:true}).all()){const box=(await control.boundingBox())!;expect.soft(box.width,'canvas action width').toBeGreaterThanOrEqual(44);expect.soft(box.height,'canvas action height').toBeGreaterThanOrEqual(44);}
      for(const [name,label] of [['versions',t.admin.pages.versions],['templates',t.admin.templates.title]]){
        const trigger=page.getByRole('button',{name:label,exact:true});await trigger.click();
        const dialog=page.getByRole('dialog').filter({visible:true});
        await captureTabs('editor-'+name,dialog);
        await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect.soft(trigger).toBeFocused();
      }
    }
  }
  try{
    expect((await page.request.patch('/api/admin/settings',{headers,data:palette})).status()).toBe(200);
    await page.addInitScript(mode=>localStorage.setItem('so7ob-appearance-mode',mode),mode);
    await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale,clientId) VALUES(?,?,'quote','web','Synthetic design review','synthetic','unspecified','flexible','Synthetic',?,'email',?,?)",[id,id,prefix+'admin@example.invalid',locale,prefix+'admin']);
    await db.query("INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale,clientId,assigneeId) VALUES(?,?,'Synthetic design review','Synthetic',?,'general',?,?,?)",[id,id,prefix+'admin@example.invalid',locale,prefix+'admin',prefix+'admin']);
    const created=await page.request.post('/api/admin/pages',{headers,data:{slug:id,titleAr:'معاينة نظام التصميم',titleEn:'Design system preview'}});
    expect(created.status()).toBe(201);pageId=(await created.json()).page.id;
    const tree=JSON.stringify({schemaVersion:1,blocks:[
      {id:'surface',type:'section',props:{},style:{base:{background:'white',paddingY:'sm'},tablet:{background:'navy'},desktop:{background:'white'}},children:[{id:'surface-title',type:'heading',props:{text:'Synthetic surface — سطح متكيف',level:2}}]},
      {id:'leaf-surface',anchorId:'leaf-surface',type:'heading',props:{text:'Synthetic leaf — كتلة متكيفة',level:2},style:{base:{background:'white',paddingY:'sm'},tablet:{background:'navy'}}},
      {id:'sparse-surface',anchorId:'sparse-surface',type:'section',props:{},style:{tablet:{background:'navy'}},children:[{id:'sparse-title',type:'heading',props:{text:'Synthetic device override — تجاوز الجهاز',level:2}},{id:'nested-card',type:'simpleTable',props:{headers:['Synthetic card — بطاقة'],rows:[['Readable nested content — محتوى واضح']]}}]},
      {id:'emphasis',type:'section',props:{},style:{base:{background:'navy',paddingY:'sm'}},children:[{id:'emphasis-title',type:'heading',props:{text:'Synthetic emphasis — سطح بارز',level:2}}]},
    ]});
    expect(validateContent(tree)).toMatchObject({ok:true});
    expect((await page.request.patch('/api/admin/pages/'+pageId,{headers,data:{baseRevision:0,draftBlocksAr:tree,draftBlocksEn:tree}})).status()).toBe(200);
    const detail=(await(await page.request.get('/api/admin/pages/'+pageId)).json()).page;
    expect((await page.request.post('/api/admin/pages/'+pageId+'/publish',{headers,data:{baseRevision:detail.draftRevision}})).status()).toBe(200);
    for(const path of ['', 'users','roles','permissions','invitations','requests','inquiries','notifications','pages','media','menus','workflows','settings','diagnostics','audit','outbox'])await visit('/admin'+(path?'/'+path:''),'admin-'+(path||'dashboard'));
    for(const section of SETTING_SECTIONS)await visit('/admin/settings?section='+section,'settings-'+section);
    await page.goto(`/${locale}/admin/audit`);
    const t=auditCopy[locale];
    for(const key of ['events','reports','reviews','alerts','rules','health'] as const){await page.getByRole('tab',{name:t[key],exact:true}).click();await capture('audit-'+key);}
    await page.goto(`/${locale}/admin/workflows`);
    for(const [ar,en] of [['المسارات','Workflows'],['فرق العمل','Teams'],['ساعات العمل','Business hours'],['نقل المعاملات','Transfer conversations']]){await page.getByRole('tab',{name:locale==='ar'?ar:en,exact:true}).click();await capture('workflows-'+en.toLowerCase().replaceAll(' ','-'));}
    const tabs=page.getByRole('tablist').first();await tabs.getByRole('tab').first().focus();await page.keyboard.press('End');await expect(tabs.getByRole('tab').last()).toBeFocused();
    for(const [path,name] of [
      [`/admin/users/${prefix}owner`,'admin-user-detail'],[`/admin/requests/${id}`,'admin-request-detail'],[`/admin/inquiries/${id}`,'admin-inquiry-detail'],
      [`/admin/pages/${pageId}/edit`,'editor'],[`/admin/pages/${pageId}/preview`,'editor-preview'],
      ['/account','account-dashboard'],...['requests','requests/new','inquiries','profile','security','notifications'].map(p=>['/account/'+p,'account-'+p.replaceAll('/','-')]),
      [`/account/requests/${id}`,'account-request-detail'],[`/account/inquiries/${id}`,'account-inquiry-detail'],
      ...['','about','services','works','process','faq','contact','track'].map(p=>[p?'/'+p:'','public-'+(p||'home')]),
      ['/'+id,'published-surfaces'],
    ])await visit(path,name);
    const expected=appearanceTokens(palette,mode);
    const surface=page.locator('.surface-card').first(),emphasis=page.locator('.surface-emphasis').first();
    async function colorOf(selector:string){return page.evaluate(selector=>getComputedStyle(document.querySelector(selector)!).backgroundColor,selector);}
    await expect(surface).toHaveCSS('background-color',rgb(expected.card));
    await expect(emphasis).toHaveCSS('background-color',rgb(expected.emphasis));
    await expect(page.locator('#sparse-surface')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    // Responsive surface overrides use the same generated classes as editor and publication.
    const viewport=page.viewportSize()!;await page.setViewportSize({width:768,height:900});
    await expect(surface).toHaveCSS('background-color',rgb(expected.emphasis));
    await expect(page.locator('#sparse-surface')).toHaveCSS('background-color',rgb(expected.emphasis));
    await expect(page.locator('#sparse-surface .bg-card')).toHaveCSS('background-color',rgb(expected.card));
    await expect(page.locator('#sparse-surface .bg-card th')).toHaveCSS('color',rgb(expected.foreground));
    await capture('published-tablet-surfaces');
    await expect(page.locator('#leaf-surface')).toHaveCSS('background-color',rgb(expected.emphasis));
    await expect(page.locator('#leaf-surface h2')).toHaveCSS('color',rgb(expected['emphasis-foreground']));
    await page.setViewportSize(viewport);await expect(surface).toHaveCSS('background-color',rgb(expected.card));
    await expect(page.locator('#sparse-surface')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    const taken=new Set<string>();
    const blocks=(Object.keys(BLOCK_REGISTRY) as BlockType[]).map(type=>defaultNode(type,taken));
    const missingLink=blocks.find(b=>b.type==='buttonLink')!;missingLink.props={...missingLink.props,href:`/${locale}/design-system-missing-page`};
    const allBlocks=JSON.stringify({schemaVersion:1,blocks},(key,value)=>value===''?(key==='src'?'/icon-192.png':'Synthetic — اصطناعي'):value);
    expect(validateContent(allBlocks).ok).toBe(true);
    const current=(await(await page.request.get('/api/admin/pages/'+pageId)).json()).page;
    expect((await page.request.patch('/api/admin/pages/'+pageId,{headers,data:{baseRevision:current.draftRevision,draftBlocksAr:allBlocks,draftBlocksEn:allBlocks}})).status()).toBe(200);
    const revised=(await(await page.request.get('/api/admin/pages/'+pageId)).json()).page;
    expect((await page.request.post('/api/admin/pages/'+pageId+'/publish',{headers,data:{baseRevision:revised.draftRevision}})).status()).toBe(200);
    await visit('/'+id,'published-all-block-types');
    await page.locator(`a[href="/${locale}/design-system-missing-page"]`).click();
    await capture('not-found-client-navigation');
    await expect(page.locator('a.bg-primary')).toHaveCSS('background-color',rgb(expected.primary));
    await page.goto(`/${locale}/admin`);
    if(info.project.name==='desktop')await expect(page.locator('aside')).toHaveCSS('background-color',rgb(expected.sidebar));
    const primary=page.locator('[data-slot="button"].bg-primary').first();if(await primary.count())await expect(primary).toHaveCSS('background-color',rgb(expected.primary));
    expect(await colorOf('body')).toBe(rgb(expected.background));
    await page.context().clearCookies();
    for(const name of ['login','register','forgot-password','reset-password','invite','verified'])await visit('/auth/'+name,'auth-'+name);
    await visit('/design-system-missing-page','not-found');
    await expect(page.locator('a.bg-primary')).toHaveCSS('background-color',rgb(expected.primary));
    expect(visited).toEqual(frozenCoverage.views);
    expect(Object.keys(BLOCK_REGISTRY)).toEqual(frozenCoverage.blockTypes);
    expect(errors).toEqual([]);
  }finally{
    readiness.dispose();
    ledger.write(`${locale}-${info.project.name}-${mode}`,{sourceRevision,locale,mode,project:info.project.name,elapsedMs:performance.now()-started,visited});
    writeFileSync(`${folder}/coverage.json`,JSON.stringify({sourceRevision,locale,mode,viewport:info.project.name,visited,errors,assertionErrors:info.errors.map(e=>e.message),blockTypes:Object.keys(BLOCK_REGISTRY)},null,2)+'\n');
    if(pageId){await db.query('DELETE FROM PageVersion WHERE pageId=?',[pageId]);await db.query('DELETE FROM Page WHERE id=?',[pageId]);await db.query('DELETE FROM AuditLog WHERE entityId=?',[pageId]);}
    await db.query('DELETE FROM ProjectRequest WHERE id=?',[id]);await db.query('DELETE FROM Inquiry WHERE id=?',[id]);
    for(const key of keys)await db.query('DELETE FROM SiteSetting WHERE `key`=?',[key]);
    for(const row of saved){const cols=Object.keys(row);await db.query('INSERT INTO SiteSetting ('+cols.map(k=>'`'+k+'`').join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')',cols.map(k=>row[k]));}
    await db.destroy();
  }
 });

test('theme preference survives client navigation when browser storage is unavailable',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/hydration|did not match|server rendered/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{for(const key of ['getItem','setItem','removeItem'])Object.defineProperty(Storage.prototype,key,{value(){throw new DOMException('Storage unavailable','SecurityError');}});});
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let intercepted=0;
  const entry='**/assets/index-*.js';
  await page.route(entry,async route=>{intercepted++;await gate;await route.continue();});
  try {
    await page.goto('/en',{waitUntil:'commit'});
    const toggles=page.getByLabel('Color mode',{exact:true});
    await expect(toggles.first()).toBeAttached();
    for(const toggle of await toggles.all())await expect(toggle).toBeDisabled();
    await expect.poll(()=>intercepted).toBeGreaterThan(0);
    release();
    await page.waitForLoadState('domcontentloaded');
    await expect(toggles.filter({visible:true})).toBeEnabled();
  } finally {
    release();
    await page.unroute(entry);
  }
  await page.getByLabel('Color mode',{exact:true}).filter({visible:true}).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-mode','dark');
  await page.locator('a[href="/en/contact"]').filter({visible:true}).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-color-mode','dark');
  await page.getByLabel('Color mode',{exact:true}).filter({visible:true}).selectOption('system');
  await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-color-mode','light');
  await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-color-mode','dark');
  expect(errors).toEqual([]);
});

test('saved density and geometry reach shared and native controls without reducing targets',async({page})=>{
  test.setTimeout(90000);
  const {prefix,password}=JSON.parse(readFileSync('.migration/e2e/run.json','utf8'));
  const {csrfToken}=await(await page.request.get('/api/auth/csrf')).json();
  expect((await page.request.post('/api/auth/callback/credentials',{form:{email:prefix+'admin@example.invalid',password,csrfToken,json:'true'}})).status()).toBe(200);
  const db=await createDataSource().initialize(),keys=['appearance.radius','appearance.density'];
  const saved=await db.query('SELECT * FROM SiteSetting WHERE `key` IN (?,?)',keys);
  try{
    for(const radius of ['square','soft','round'])for(const density of ['comfortable','compact']){
      expect((await page.request.patch('/api/admin/settings',{headers:{'x-csrf-token':csrfToken},data:{'appearance.radius':radius,'appearance.density':density}})).status()).toBe(200);
      await page.goto('/en/admin/settings?section=appearance');
      const input=page.locator('#appearance-primary-light'),select=page.locator('#appearance-radius');
      const px=radius==='square'?'0px':radius==='soft'?'12px':'20px';
      await expect(input).toHaveCSS('border-radius',px);await expect(select).toHaveCSS('border-radius',px);
      await expect(select).toHaveCSS('padding-top',density==='compact'?'6px':'10px');
      for(const control of [input,select])expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }finally{
    for(const key of keys)await db.query('DELETE FROM SiteSetting WHERE `key`=?',[key]);
    for(const row of saved){const cols=Object.keys(row);await db.query('INSERT INTO SiteSetting ('+cols.map(k=>'`'+k+'`').join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')',cols.map(k=>row[k]));}
    await db.destroy();
  }
});
