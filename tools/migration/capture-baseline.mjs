import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const load = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
import path from 'node:path';
const { chromium } = load(process.env.PLAYWRIGHT_MODULE || '/usr/lib/node_modules/playwright');
const AxeBuilder = load(process.env.AXE_MODULE || '/usr/lib/node_modules/@axe-core/playwright').default;
const root = path.resolve(__dirname, '../..');
const origin = 'http://127.0.0.1:3107';
const out = path.join(root, '.migration/baseline/evidence');
const fixture = JSON.parse(fs.readFileSync(path.join(root, '.migration/baseline/fixture.json')));
async function login(context, user) {
  const csrf = await (await context.request.get(`${origin}/api/auth/csrf`)).json();
  const result = await context.request.post(`${origin}/api/auth/callback/credentials`, { form: { email: `${user}@migration.example.invalid`, password: 'Synthetic-Migration-4829', csrfToken: csrf.csrfToken, json: 'true' } });
  if (!result.ok()) throw new Error(`Baseline login failed: ${user} ${result.status()}`);
  await context.request.get(`${origin}/api/auth/session`);
}
async function main() {
  fs.mkdirSync(path.join(out, 'screenshots'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const runs = [];
  for (const width of [375, 1280]) for (const locale of ['ar', 'en']) {
    for (const [name, suffix, actor] of [
      ['home', '', null], ['contact', '/contact', null], ['works', '/works', null], ['login', '/auth/login', null],
      ['account', '/account', 'owner'], ['request', '/account/requests/migrationrequest', 'owner'],
      ['admin', '/admin', 'admin'], ['editor', `/admin/pages/${fixture.pageId}/edit`, 'admin'],
      ['support', '/admin/requests', 'support'], ['content-editor', '/admin', 'editor'],
    ]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      if (actor) await login(context, actor);
      const page = await context.newPage();
      const errors = [], failedRequests = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('requestfailed', req => failedRequests.push({ url: new URL(req.url()).pathname, error: req.failure()?.errorText }));
      const route = `/${locale}${suffix}`;
      const response = await page.goto(origin + route, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(out, `screenshots/${locale}-${name}-${width}.png`), fullPage: true });
      const metrics = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        const js = performance.getEntriesByType('resource').filter(r => r.initiatorType === 'script');
        return { lang: document.documentElement.lang, dir: document.documentElement.dir, scrollWidth: document.documentElement.scrollWidth, ttfbMs: n.responseStart - n.requestStart, jsEncodedBytes: js.reduce((sum, r) => sum + r.encodedBodySize, 0), jsDecodedBytes: js.reduce((sum, r) => sum + r.decodedBodySize, 0) };
      });
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      runs.push({ name, route, actor, width, status: response.status(), errors, failedRequests, ...metrics, axe: axe.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })) });
      fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify({ sourceSHA: '5321b7fd11db421c83290b262f276811e5f04e5f', browserVersion: browser.version(), runs }, null, 2));
      console.log(`${locale} ${name} ${width}: ${response.status()}, errors=${errors.length}, axe=${axe.violations.length}`);
      await context.close();
    }
  }
  const ctx = await browser.newContext();
  const contracts = [];
  for (const route of ['/ar', '/en', '/ar/missing-migration-page', '/robots.txt', '/sitemap.xml', '/api/account/profile', '/api/admin/users', '/api/attachments/migrationattachment']) {
    const response = await ctx.request.get(origin + route, { maxRedirects: 0 });
    contracts.push({ route, status: response.status(), headers: response.headers(), body: await response.text() });
  }
  fs.writeFileSync(path.join(out, 'http-contracts.json'), JSON.stringify(contracts, null, 2));
  await ctx.close(); await browser.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
