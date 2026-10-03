import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
if (process.env.SO7OB_E2E_ENV_FILE) process.loadEnvFile(process.env.SO7OB_E2E_ENV_FILE);
if (!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? '')) throw new Error('Playwright requires an explicitly configured isolated so7ob_*_test MariaDB');
process.env.OUTBOX_KEY ??= randomBytes(32).toString('hex');
process.env.AUTH_SECRET ??= randomBytes(32).toString('hex');
const origin=process.env.E2E_BASE_URL ?? 'https://127.0.0.1:3198';
if (!['127.0.0.1','localhost'].includes(new URL(origin).hostname)) throw new Error('Browser acceptance may only target loopback');
export default defineConfig({
  testDir:'./tests/e2e', globalSetup:'./tests/e2e/setup.ts', fullyParallel:false, workers:1,
  timeout:30000, expect:{timeout:5000}, reporter:[['list'],['json',{outputFile:'test-results/e2e.json'}]],
  use:{baseURL:origin,ignoreHTTPSErrors:true,headless:true,locale:'en-US',timezoneId:'Asia/Aden',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'desktop',use:{viewport:{width:1280,height:900}}},{name:'mobile',use:{viewport:{width:375,height:812}}}],
  webServer:{command:'node tools/test/e2e-server.mjs',ignoreHTTPSErrors:true,url:origin+'/api/health/ready',reuseExistingServer:process.env.SO7OB_E2E_EXTERNAL==='1',timeout:30000,
    env:{...process.env,E2E_BASE_URL:origin,NODE_ENV:'production',BIND_HOST:'127.0.0.1',PORT:new URL(origin).port,SITE_URL:origin,WEB_ORIGIN:origin,EMAIL_DEV_MODE:'false',TZ:'Asia/Aden'} as Record<string,string>},
});
