import { defineConfig } from '@playwright/test';
import config from '../../../playwright.config';

export default defineConfig({
  ...config,
  testDir: '.', testMatch: 'admin-configuration-timeout.case.ts',
  // Use the same built server modules as the API. Avoid recompiling the entire
  // server index in each replacement worker inside the parent's body budget.
  tsconfig: './admin-configuration-timeout.tsconfig.json',
  build: { external: ['**/packages/*/dist/**'] },
  globalSetup: undefined, webServer: undefined,
  outputDir: process.env.SO7OB_CONFIGURATION_OUTPUT,
  projects: config.projects!.filter(project => project.name === process.env.SO7OB_CONFIGURATION_PROJECT),
  reporter: [['json', { outputFile: process.env.SO7OB_CONFIGURATION_REPORT }]],
});
