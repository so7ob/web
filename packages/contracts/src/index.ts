export type * from './public.js';
export type Locale = 'ar' | 'en';
export interface ApiFailure { ok: false; code: string; errors?: Record<string, string> }
export * from './permissions.js';
export * from './requests.js';
export * from './validation.js';
export * from './blocks.js';
