// Synthetic source-only capture. Never points at a Website checkout or production DB.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { baselinePath, sourceSHA } from './reference-paths.mjs';
const dbPath=resolve(baselinePath,'data/runtime.db');
if (!dbPath.startsWith(resolve('.migration')+'/')) throw new Error('Isolated reference required');
const db=new DatabaseSync(dbPath);
const id='synthetic-tree-reference';
if(db.prepare('SELECT id FROM Page WHERE id=?').get(id)) throw new Error('Refuse to replace an existing reference fixture');
const out=resolve('.migration/content-tree/reference');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try {
  for(const locale of ['ar','en']) {
    const title=locale==='ar'?'عنوان الشجرة الاصطناعية':'Synthetic tree heading';
    const content=JSON.stringify({schemaVersion:1,blocks:[{id:'section',type:'section',anchorId:'tree-root',style:{base:{paddingY:'sm',background:'white'},desktop:{paddingY:'lg'}},children:[{id:'row',type:'row',children:[{id:'column',type:'column',children:[{id:'heading',type:'heading',props:{text:title,level:2}},{id:'text',type:'text',props:{paragraphs:['Synthetic nested content']}},{id:'link',type:'buttonLink',props:{label:'Tree contact',href:'/contact'}}]}]}]}]});
    db.prepare('INSERT INTO Page(id,slug,titleAr,titleEn,status,publishedBlocksAr,publishedBlocksEn,draftBlocksAr,draftBlocksEn,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,id,title,title,'published',content,content,'PRIVATE DRAFT','PRIVATE DRAFT',Date.now());
    try { for(const [name,width,height] of [['mobile',375,812],['desktop',1280,900]]) {
      const context=await browser.newContext({viewport:{width,height},locale:'en-US',timezoneId:'Asia/Aden'});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const response=await page.goto(`http://127.0.0.1:3107/${locale}/${id}`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
      await page.getByRole('link',{name:'Tree contact',exact:true}).focus();
      const screenshot=`${locale}-${name}.png`;await page.screenshot({path:join(out,screenshot),fullPage:true});
      results.push({locale,width,status:response.status(),errors,screenshot,padding:await page.locator('#tree-root').evaluate(e=>getComputedStyle(e).paddingTop)});
      await context.close();
    }} finally {db.prepare('DELETE FROM Page WHERE id=?').run(id);}
  }
} finally {await browser.close();db.close();writeFileSync(join(out,'summary.json'),JSON.stringify({sourceSHA,syntheticOnly:true,results},null,2)+'\n');}
