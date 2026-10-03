import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { baselinePath, sourceSHA } from './reference-paths.mjs';
const load = createRequire(import.meta.url);
const { request } = load(process.env.PLAYWRIGHT_MODULE || '/usr/lib/node_modules/playwright');
const origin = 'http://127.0.0.1:3107';
const context = await request.newContext({ baseURL: origin });
const csrf = await (await context.get('/api/auth/csrf')).json();
await context.post('/api/auth/callback/credentials', { form: { email: 'admin@migration.example.invalid', password: 'Synthetic-Migration-4829', csrfToken: csrf.csrfToken, json: 'true' } });
await context.get('/api/auth/session');
const results = [];
for (const route of ['/ar', '/en', '/api/admin/requests', '/api/admin/inquiries', '/api/admin/dashboard', '/api/admin/pages']) {
  for (let i = 0; i < 5; i++) await context.get(route);
  for (let repeat = 0; repeat < 5; repeat++) {
    const ms = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now(); const response = await context.get(route); await response.body();
      if (!response.ok()) throw new Error(`Benchmark ${route}: ${response.status()}`);
      ms.push(performance.now() - start);
    }
    ms.sort((a,b) => a-b);
    results.push({ route, repeat, samples: ms.length, p50: ms[24], p95: ms[47] });
  }
}
fs.writeFileSync(join(baselinePath, 'evidence/performance.json'), JSON.stringify({ sourceSHA, fixture: '8 synthetic users, 1 request, 1 inquiry, source seeded pages', concurrency: 1, productionCapacityClaim: false, results }, null, 2));
await context.dispose();
