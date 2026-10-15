import { defineConfig } from '@playwright/test';
import config from './admin-configuration-timeout.config';

export default defineConfig({ ...config, testMatch: 'announcement-quota.case.ts' });
