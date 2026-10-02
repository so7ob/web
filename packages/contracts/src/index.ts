export type * from './public.js';
export type Locale = 'ar' | 'en';
export interface ApiFailure { ok: false; code: string; errors?: Record<string, string> }
