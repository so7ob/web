import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const inventory: {method:string;path:string}[] = JSON.parse(readFileSync('docs/migration/api-inventory.json','utf8'));
test('OpenAPI declares every inventoried legacy handler and its versioned mapping', async ({ request }) => {
  const response=await request.get('/api/docs-json');
  expect(response.status()).toBe(200);
  const document=await response.json();
  const expected: {method:string;path:string}[]=[];
  for(const row of inventory){
    if(row.path.includes('[...nextauth]')) continue; // Expanded explicitly below; no framework catch-all in target.
    const path=row.path.replace(/\[([^\]]+)\]/g,'{$1}');
    expected.push({method:row.method.toLowerCase(),path});
    expected.push({method:row.method.toLowerCase(),path:path==='/api/health/ready'?'/api/v1/health':path.replace('/api/','/api/v1/')});
  }
  for(const prefix of ['/api/auth','/api/v1/auth']){
    for(const path of ['providers','csrf','session'])expected.push({method:'get',path:`${prefix}/${path}`});
    for(const path of ['callback/credentials','signout'])expected.push({method:'post',path:`${prefix}/${path}`});
  }
  for(const {method,path} of expected)expect(document.paths[path]?.[method],`${method.toUpperCase()} ${path}`).toBeTruthy();
  for(const path of ['/api/health/ready','/api/v1/health'])expect((await request.get(path)).status()).toBe(200);
  // Metadata parity must never regress into a token-bearing mail preview.
  for(const path of ['/api/admin/outbox','/api/v1/admin/outbox'])expect((await request.get(path)).status()).toBe(401);
});
