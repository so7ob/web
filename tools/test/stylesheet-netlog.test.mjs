import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizeDirectory, summarizeNetlog } from './stylesheet-netlog.mjs';
test('transport summary distinguishes retry events and error codes without exposing request data', () => {
  const result = summarizeNetlog({ constants: { logEventTypes: { SSL_CONNECT: 1, HTTP_TRANSACTION_RESTART_AFTER_ERROR: 2 }, netError: { ERR_CERT_AUTHORITY_INVALID: -202, ERR_TOO_MANY_RETRIES: -375 } }, events: [
    { type: 1, params: { net_error: -202, url: 'https://127.0.0.1/private?token=secret', headers: ['Cookie: secret'] } },
    { type: 2, params: { net_error: -375 } }, { type: 1, params: {} },
  ] });
  assert.deepEqual(result, { events: 3, counts: { SSL_CONNECT: 2, HTTP_TRANSACTION_RESTART_AFTER_ERROR: 1 }, failures: { 'SSL_CONNECT: ERR_CERT_AUTHORITY_INVALID': 1, 'HTTP_TRANSACTION_RESTART_AFTER_ERROR: ERR_TOO_MANY_RETRIES': 1 } });
  assert(!JSON.stringify(result).includes('secret'));
});

test('untrusted constants and event types cannot inject request data into summaries', () => {
  const result = summarizeNetlog({constants:{logEventTypes:{RETRY_PRIVATE_SECRET:9},netError:{PRIVATE_SECRET:-99}},events:[
    {type:9,params:{net_error:-99,headers:['PRIVATE_SECRET']}}, {type:'PRIVATE_SECRET',params:{net_error:-99}},
  ]});
  assert(!JSON.stringify(result).includes('PRIVATE_SECRET'));
  assert.equal(result.failures['EVENT_9: -99'],1);
});
test('directory export never copies raw or truncated request data and ignores unrelated files', () => {
  const root=mkdtempSync(join(tmpdir(),'web-netlog-'));
  try {
    const input=join(root,'raw'),output=join(root,'summaries'); mkdirSync(input);
    writeFileSync(join(input,'process-1.json'),JSON.stringify({constants:{logEventTypes:{}},events:[],secret:'PRIVATE_SECRET'}));
    writeFileSync(join(input,'process-2.json'),'["PRIVATE_SECRET');
    writeFileSync(join(input,'other.json'),'PRIVATE_SECRET');
    summarizeDirectory(input,output);
    assert.deepEqual(readdirSync(output).sort(),['process-1.json','process-2.json']);
    for (const file of readdirSync(output)) assert(!readFileSync(join(output,file),'utf8').includes('PRIVATE_SECRET'));
    assert.deepEqual(JSON.parse(readFileSync(join(output,'process-2.json'),'utf8')),{status:'unreadable-or-incomplete'});
    assert.equal(readFileSync(join(input,'process-2.json'),'utf8'),'["PRIVATE_SECRET');
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('CI publishes only summaries; local NetLog capture requires explicit opt-in', () => {
  const workflow=readFileSync('.github/workflows/ci.yml','utf8');
  assert(!workflow.includes('.migration/e2e/netlog/*.json'));
  assert.equal(workflow.match(/netlog-summary\/\*\.json/g)?.length,3);
  assert.equal(workflow.match(/stylesheet-netlog.mjs --directory/g)?.length,3);
  assert(readFileSync('playwright.config.ts','utf8').includes("process.env.SO7OB_E2E_NETLOG === '1'"));
});
