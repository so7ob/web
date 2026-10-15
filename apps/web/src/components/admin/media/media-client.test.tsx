// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MediaClient } from './media-client';
import { getPortalContent } from '@/content/portal';
import type { MediaResponse } from '../types';

const { get, send, success, error } = vi.hoisted(() => ({ get: vi.fn(), send: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../helpers', async importOriginal => ({ ...await importOriginal<typeof import('../helpers')>(), apiGet: get, apiSend: send }));
vi.mock('sonner', () => ({ toast: { success, error } }));
const fixture: MediaResponse = { ok: true, total: 2, unusedTotal: 2, page: 1, pageSize: 20, folders: ['general'], media: ['one', 'two'].map(id => ({ id, filename: id + '.png', url: '/synthetic/' + id, mimeType: 'image/png', size: 10, altText: 'Original ' + id, title: null, folder: 'general', uploadedBy: 'Synthetic', createdAt: '2026-10-15T00:00:00Z', usageCount: 0 })) };
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue(structuredClone(fixture)); });
afterEach(cleanup);
for (const locale of ['ar', 'en'] as const) {
  async function setup() {
    render(<MediaClient locale={locale} me={{ id: 'synthetic', email: 'synthetic@example.invalid', name: 'Synthetic', roleKey: 'super_admin', locale, permissions: ['media.manage'] }} />);
    const name = getPortalContent(locale).admin.media.alt;
    return { first: await screen.findByRole('textbox', { name: name + ' — one.png' }), second: screen.getByRole('textbox', { name: name + ' — two.png' }) };
  }
  it(`${locale}: saving one image preserves another focused draft`, async () => {
    const pending = deferred(); send.mockReturnValue(pending.promise);
    const { first, second } = await setup();
    fireEvent.change(first, { target: { value: 'Saved first' } }); fireEvent.blur(first);
    fireEvent.focus(second); fireEvent.change(second, { target: { value: 'Unsaved second' } });
    await act(async () => pending.resolve({ ok: true, media: { altText: 'Saved first' } }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(second).toHaveValue('Unsaved second');
    expect(first).toHaveValue('Saved first');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it(`${locale}: a delayed success preserves a newer edit to the same image`, async () => {
    const pending = deferred(); send.mockReturnValue(pending.promise);
    const { first } = await setup();
    fireEvent.change(first, { target: { value: 'First save' } }); fireEvent.blur(first);
    fireEvent.change(first, { target: { value: 'Newer unsaved edit' } });
    await act(async () => pending.resolve({ ok: true, media: { altText: 'First save' } }));
    expect(first).toHaveValue('Newer unsaved edit');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it(`${locale}: saves overlapping images independently when responses arrive in reverse order`, async () => {
    const a = deferred(), b = deferred(); send.mockImplementation((url: string) => url.endsWith('/one') ? a.promise : b.promise);
    const { first, second } = await setup();
    fireEvent.change(first, { target: { value: 'Saved one' } }); fireEvent.blur(first);
    fireEvent.change(second, { target: { value: 'Saved two' } }); fireEvent.blur(second);
    await act(async () => b.resolve({ ok: true, media: { altText: 'Saved two' } }));
    expect(first).toHaveValue('Saved one'); expect(second).toHaveValue('Saved two');
    await act(async () => a.resolve({ ok: true, media: { altText: 'Saved one' } }));
    expect(first).toHaveValue('Saved one'); expect(second).toHaveValue('Saved two');
  });
  it(`${locale}: serializes repeated saves of one image and coalesces duplicate blurs`, async () => {
    const a = deferred(), b = deferred(); send.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { first } = await setup();
    fireEvent.change(first, { target: { value: 'First save' } }); fireEvent.blur(first); fireEvent.blur(first);
    fireEvent.change(first, { target: { value: 'Newest save' } }); fireEvent.blur(first); fireEvent.blur(first);
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => a.resolve({ ok: true, media: { altText: 'First save' } }));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][2]).toEqual({ altText: 'Newest save' });
    expect(first).toHaveValue('Newest save');
    await act(async () => b.resolve({ ok: true, media: { altText: 'Newest save' } }));
    expect(first).toHaveValue('Newest save');
  });
  it(`${locale}: persists an explicit return to the original text while a save is pending`, async () => {
    const a = deferred(), b = deferred(); send.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { first } = await setup();
    fireEvent.change(first, { target: { value: 'Temporary edit' } }); fireEvent.blur(first);
    fireEvent.change(first, { target: { value: 'Original one' } }); fireEvent.blur(first);
    await act(async () => a.resolve({ ok: true, media: { altText: 'Temporary edit' } }));
    expect(send.mock.calls[1][2]).toEqual({ altText: 'Original one' });
    expect(first).toHaveValue('Original one');
    await act(async () => b.resolve({ ok: true, media: { altText: 'Original one' } }));
    expect(first).toHaveValue('Original one');
  });
  it(`${locale}: reconciles a stale list read across a confirmed save and preserves sibling drafts`, async () => {
    const read = deferred();
    get.mockResolvedValueOnce(structuredClone(fixture)).mockReturnValueOnce(read.promise);
    send.mockResolvedValue({ ok: true, media: { altText: 'Confirmed after read started' } });
    const { first, second } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'general' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    fireEvent.change(first, { target: { value: 'Confirmed after read started' } }); fireEvent.blur(first);
    await waitFor(() => expect(success).toHaveBeenCalled());
    fireEvent.change(second, { target: { value: 'Sibling draft through refresh' } });
    await act(async () => read.resolve(structuredClone(fixture)));
    expect(first).toHaveValue('Confirmed after read started');
    expect(second).toHaveValue('Sibling draft through refresh');
    // A later read really is fresh: do not permanently mask other editors' writes.
    get.mockResolvedValue({ ...fixture, media: fixture.media.map(row => row.id === 'one' ? { ...row, altText: 'Fresh external value' } : row) });
    fireEvent.click(screen.getByRole('button', { name: getPortalContent(locale).admin.media.allFolders }));
    await waitFor(() => expect(first).toHaveValue('Fresh external value'));
    expect(second).toHaveValue('Sibling draft through refresh');
  });
  it(`${locale}: preserves a newer draft and its confirmed baseline across a stale list read`, async () => {
    const read = deferred();
    get.mockResolvedValueOnce(structuredClone(fixture)).mockReturnValueOnce(read.promise);
    send.mockResolvedValue({ ok: true, media: { altText: 'Confirmed value' } });
    const { first } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'general' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    fireEvent.change(first, { target: { value: 'Confirmed value' } }); fireEvent.blur(first);
    await waitFor(() => expect(success).toHaveBeenCalled());
    fireEvent.change(first, { target: { value: 'Newer unsaved value' } });
    await act(async () => read.resolve(structuredClone(fixture)));
    expect(first).toHaveValue('Newer unsaved value');
    expect(screen.getByRole('img', { name: 'Confirmed value' })).toBeInTheDocument();
  });
  it(`${locale}: retains a saved image and sibling draft while it leaves and re-enters results`, async () => {
    const write = deferred(), returning = deferred();
    get.mockResolvedValueOnce(structuredClone(fixture)).mockResolvedValueOnce({ ...fixture, media: [fixture.media[1]], total: 1 }).mockReturnValueOnce(returning.promise);
    send.mockReturnValue(write.promise);
    const { first, second } = await setup();
    fireEvent.change(first, { target: { value: 'Saved while hidden' } }); fireEvent.blur(first);
    fireEvent.change(second, { target: { value: 'Sibling retained' } });
    fireEvent.click(screen.getByRole('button', { name: 'general' }));
    const firstLabel = getPortalContent(locale).admin.media.alt + ' — one.png';
    await waitFor(() => expect(screen.queryByRole('textbox', { name: firstLabel })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: getPortalContent(locale).admin.media.allFolders }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    await act(async () => write.resolve({ ok: true, media: { altText: 'Saved while hidden' } }));
    await act(async () => returning.resolve(structuredClone(fixture)));
    expect(screen.getByRole('textbox', { name: firstLabel })).toHaveValue('Saved while hidden');
    expect(second).toHaveValue('Sibling retained');
  });
  it(`${locale}: retains failed text and a sibling draft, then retries on a later blur`, async () => {
    const pending = deferred(); send.mockReturnValueOnce(pending.promise).mockResolvedValue({ ok: true, media: { altText: 'Retry this text' } });
    const { first, second } = await setup();
    fireEvent.change(first, { target: { value: 'Retry this text' } }); fireEvent.blur(first);
    fireEvent.change(second, { target: { value: 'Keep sibling' } });
    await act(async () => pending.reject(new Error('Synthetic failure')));
    expect(error).toHaveBeenCalled(); expect(first).toHaveValue('Retry this text'); expect(second).toHaveValue('Keep sibling');
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.blur(first);
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(first).toHaveValue('Retry this text'); expect(second).toHaveValue('Keep sibling');
  });
}
