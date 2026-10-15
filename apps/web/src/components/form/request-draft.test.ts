// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearRequestDraft, forgetRequestDraft, readRequestDraft, REQUEST_DRAFT_KEY, REQUEST_DRAFT_TTL, sanitizeRequestDraft, scopeRequestDraft, writeRequestDraft } from './request-draft';
beforeEach(() => { for (const owner of ['guest', 'user:a', 'user:b']) clearRequestDraft(owner); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it('validates partial data, bounds text and strips unsafe or unknown fields', () => {
  expect(sanitizeRequestDraft({ serviceType: 'mobile', requestType: 'unknown', description: 'x'.repeat(6000), name: { nested: 'bad' }, email: 'unfinished', website: 'bot', clientId: 'other', password: 'synthetic', locale: 'en', startedAt: 123 })).toEqual({ serviceType: 'mobile', description: 'x'.repeat(5000), email: 'unfinished' });
});
it('keeps only one owner in a tab and rejects another identity on recovery', () => {
  writeRequestDraft('user:a', { description: 'Owner A' });
  expect(readRequestDraft('user:b').values).toEqual({});
  expect(sessionStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  writeRequestDraft('user:b', { description: 'Owner B' });
  clearRequestDraft('user:a');
  expect(readRequestDraft('user:b').values).toEqual({ description: 'Owner B' });
});
it('rejects expired, corrupt and oversized recovery envelopes without treating corruption as blocked storage', () => {
  for (const raw of [JSON.stringify({ owner: 'guest', expiresAt: Date.now() - 1, values: { description: 'Expired' } }), '{broken', 'x'.repeat(21000)]) {
    sessionStorage.setItem(REQUEST_DRAFT_KEY, raw);
    expect(readRequestDraft('guest')).toEqual({ values: {}, available: true });
    expect(sessionStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  }
});
it('rejects a forged long-lived snapshot and malformed fields on recovery', () => {
  sessionStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify({ owner: 'guest', expiresAt: Date.now() + REQUEST_DRAFT_TTL * 10, values: { description: 'Too durable' } }));
  expect(readRequestDraft('guest').values).toEqual({});
  sessionStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify({ owner: 'guest', expiresAt: Date.now() + REQUEST_DRAFT_TTL, values: { description: ['bad'], clientId: 'other', serviceType: 'invalid', budget: 'tier1' } }));
  expect(readRequestDraft('guest').values).toEqual({ budget: 'tier1' });
});
it('keeps memory current when writing storage fails and clears it after success', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic quota failure'); });
  expect(writeRequestDraft('guest', { description: 'Current text' })).toBe(false);
  expect(readRequestDraft('guest')).toEqual({ values: { description: 'Current text' }, available: false });
  write.mockRestore();
  // Successful reads alone do not prove that this memory snapshot is durable.
  expect(readRequestDraft('guest').available).toBe(false);
  expect(writeRequestDraft('guest', { description: 'Current text' })).toBe(true);
  expect(readRequestDraft('guest')).toEqual({ values: { description: 'Current text' }, available: true });
  clearRequestDraft('guest');
  expect(readRequestDraft('guest').values).toEqual({});
});

it('drops guest recovery on login and account recovery on logout even on routes without a form', () => {
  writeRequestDraft('guest', { description: 'Guest before login' });
  scopeRequestDraft('user:a'); scopeRequestDraft('guest');
  expect(readRequestDraft('guest').values).toEqual({});
  writeRequestDraft('user:a', { description: 'Account before logout' });
  scopeRequestDraft('guest'); scopeRequestDraft('user:a');
  expect(readRequestDraft('user:a').values).toEqual({});
});

it('does not let an older successful submission clear a newer edit from the same owner', () => {
  const submitted = { description: 'Submitted snapshot' };
  writeRequestDraft('guest', submitted);
  writeRequestDraft('guest', { description: 'Newer unsent edit' });
  clearRequestDraft('guest', submitted);
  expect(readRequestDraft('guest').values).toEqual({ description: 'Newer unsent edit' });
  clearRequestDraft('guest', { description: 'Newer unsent edit' });
  expect(readRequestDraft('guest').values).toEqual({});
});

it('explicit logout clears memory and recovery even if storage removal is blocked', () => {
  writeRequestDraft('user:a', { description: 'Private transient draft' });
  forgetRequestDraft();
  expect(sessionStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  writeRequestDraft('user:a', { description: 'Private memory only' });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked storage'); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Blocked storage'); });
  forgetRequestDraft();
  expect(readRequestDraft('user:a').values).toEqual({});
});

it('keeps failed-write availability false when an older stored snapshot is still readable', () => {
  writeRequestDraft('guest', { description: 'Old persisted snapshot' });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic quota failure'); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Synthetic removal blocked'); });
  expect(writeRequestDraft('guest', { description: 'New memory snapshot' })).toBe(false);
  expect(readRequestDraft('guest')).toEqual({ values: { description: 'New memory snapshot' }, available: false });
  expect(readRequestDraft('guest')).toEqual({ values: { description: 'New memory snapshot' }, available: false });
});
