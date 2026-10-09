import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const out=resolve('.archify/lifecycle-agent-run-20261009-231544');
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',headless:true});
const items=[['lifecycle','.archify/lifecycle-agent-run-20261009-231544/agent-run.html']];
const results=[];
for(const [name,file] of items){
 for(const width of [375,1280])for(const dir of ['ltr','rtl']){
  const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();await page.goto(pathToFileURL(resolve(file)).href);await page.waitForTimeout(150);
  if(dir==='rtl')await page.evaluate(()=>{document.documentElement.dir='rtl';document.documentElement.lang='ar';});
  const focused=[];for(let i=0;i<8;i++){await page.keyboard.press('Tab');focused.push(await page.evaluate(()=>({tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent?.trim().slice(0,70)})));}
  await page.keyboard.press('Escape');
  const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,lang:document.documentElement.lang,dir:document.documentElement.dir}));
  const axe=await new AxeBuilder({page}).analyze();
  results.push({name,file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),width,dir,rtlMode:dir==='rtl'?'DOM emulation; not authored default':'authored fallback',metrics,keyboard:focused,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,description:v.description}))});
  await context.close();console.log(name,width,dir,'axe',axe.violations.length,'overflow',metrics.scrollWidth>width);
 }
}
await browser.close();writeFileSync(out+'/viewer-accessibility.json',JSON.stringify(results,null,2)+'\n');
