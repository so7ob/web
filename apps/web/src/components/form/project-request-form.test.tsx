// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { clearRequestDraft, REQUEST_DRAFT_KEY, writeRequestDraft } from './request-draft';
import { ProjectRequestForm } from './project-request-form';
import { ar } from '@/content/ar';
import { en } from '@/content/en';
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
const text = 'Synthetic request requirements بيانات متعددة الأسطر\nKeep the last edit without waiting.';
const view = (locale: 'ar' | 'en', extra = {}) => <MemoryRouter initialEntries={[`/${locale}/contact`]}><ProjectRequestForm locale={locale} content={locale === 'ar' ? ar : en} {...extra} /></MemoryRouter>;
afterEach(() => { cleanup(); clearRequestDraft('guest'); clearRequestDraft('user:a'); clearRequestDraft('user:b'); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });
for (const locale of ['ar', 'en'] as const) {
  it(`${locale}: retains the final edit when leaving before the old debounce`, () => {
    vi.useFakeTimers();
    const first = render(view(locale));
    fireEvent.change(first.container.querySelector('#serviceType')!, { target: { value: 'mobile' } });
    fireEvent.change(first.container.querySelector('#description')!, { target: { value: text } });
    first.unmount();
    const second = render(view(locale === 'ar' ? 'en' : 'ar'));
    expect(second.container.querySelector('#description')).toHaveValue(text);
    expect(second.container.querySelector('#serviceType')).toHaveValue('mobile');
  });
  it(`${locale}: prevents a pending parent autosave after successful submission`, async () => {
    vi.useFakeTimers();
    const changed = vi.fn(), submitted = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, ref: 'S7-SYNTHETIC' }) }));
    const { container } = render(view(locale, { suppressLocalDraft: true, onValuesChange: changed, onSubmitted: submitted }));
    fireEvent.change(container.querySelector('#description')!, { target: { value: text } });
    fireEvent.change(container.querySelector('#name')!, { target: { value: 'Synthetic owner' } });
    fireEvent.change(container.querySelector('#email')!, { target: { value: 'synthetic@example.invalid' } });
    await act(async () => { fireEvent.submit(container.querySelector('form')!); });
    expect(submitted).toHaveBeenCalledWith('S7-SYNTHETIC');
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(changed).not.toHaveBeenCalled();
  });
}
it('does not let changed prefills replace current edits', () => {
  const { container, rerender } = render(view('ar', { initialValues: { serviceType: 'mobile', description: text } }));
  fireEvent.change(container.querySelector('#description')!, { target: { value: text + ' newest' } });
  rerender(view('en', { initialValues: { serviceType: 'web', description: 'Older snapshot' } }));
  expect(container.querySelector('#description')).toHaveValue(text + ' newest');
  expect(container.querySelector('#serviceType')).toHaveValue('mobile');
});

it('isolates owners and ignores unscoped legacy browser data', () => {
  localStorage.setItem('so7ob-request-draft', JSON.stringify({ email: 'other@example.invalid', description: 'Other legacy owner' }));
  const first = render(view('ar', { draftOwner: 'user:a' }));
  expect(first.container.querySelector('#email')).toHaveValue('');
  fireEvent.change(first.container.querySelector('#description')!, { target: { value: text } });
  first.unmount();
  const second = render(view('en', { draftOwner: 'user:b' }));
  expect(second.container.querySelector('#description')).toHaveValue('');
  expect(second.container.querySelector('#email')).toHaveValue('');
  expect(sessionStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
});
it('keeps memory drafts and reports blocked storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Synthetic blocked storage'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic blocked storage'); });
  const first = render(view('ar'));
  fireEvent.change(first.container.querySelector('#description')!, { target: { value: text } }); first.unmount();
  const second = render(view('en'));
  expect(second.container.querySelector('#description')).toHaveValue(text);
  expect(screen.getByText(/Storage is unavailable/)).toBeVisible();
});
it('keeps failed submissions without automatically retrying or losing fields', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('Synthetic offline'));
  vi.stubGlobal('fetch', fetch);
  const first = render(view('ar'));
  for (const [id, value] of [['description', text], ['name', 'Synthetic owner'], ['email', 'synthetic@example.invalid']]) fireEvent.change(first.container.querySelector('#' + id)!, { target: { value } });
  await act(async () => { fireEvent.submit(first.container.querySelector('form')!); });
  expect(first.container.querySelector('#description')).toHaveValue(text);
  expect(fetch).toHaveBeenCalledTimes(1);
  first.unmount(); const second = render(view('en'));
  expect(second.container.querySelector('#description')).toHaveValue(text);
  expect(second.container.querySelector('#email')).toHaveValue('synthetic@example.invalid');
});
it('clears the public draft on success and does not recreate it after reset', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, ref: 'S7-SYNTHETIC' }) }));
  const first = render(view('en'));
  for (const [id, value] of [['description', text], ['name', 'Synthetic owner'], ['email', 'synthetic@example.invalid']]) fireEvent.change(first.container.querySelector('#' + id)!, { target: { value } });
  await act(async () => { fireEvent.submit(first.container.querySelector('form')!); });
  expect(sessionStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: en.form.success.another }));
  await act(async () => { vi.advanceTimersByTime(5000); });
  expect(sessionStorage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  expect(first.container.querySelector('#description')).toHaveValue('');
});
it('takes restored draft above explicit prefills and newer edits above changed defaults', () => {
  writeRequestDraft('guest', { serviceType: 'mobile', description: text });
  const { container } = render(<MemoryRouter initialEntries={['/en/contact?service=web']}><ProjectRequestForm locale="en" content={en} preselectService="systems" /></MemoryRouter>);
  expect(container.querySelector('#serviceType')).toHaveValue('mobile');
  expect(container.querySelector('#description')).toHaveValue(text);
});

it('applies deliberate same-page URL prefills only before editing or restoring a draft', () => {
  function Harness() {
    const navigate = useNavigate();
    return <><ProjectRequestForm locale="en" content={en} preselectService="web" /><button onClick={() => navigate('/en/contact?service=mobile&type=quote')}>Prefill mobile quote</button><button onClick={() => navigate('/en/contact?service=automation&type=discussion')}>Prefill automation</button></>;
  }
  const { container } = render(<MemoryRouter initialEntries={['/en/contact']}><Harness /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Prefill mobile quote' }));
  expect(container.querySelector('#serviceType')).toHaveValue('mobile');
  expect(screen.getByRole('radio', { name: en.form.requestTypes.quote })).toHaveAttribute('aria-checked', 'true');
  fireEvent.change(container.querySelector('#description')!, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Prefill automation' }));
  expect(container.querySelector('#description')).toHaveValue(text);
  expect(container.querySelector('#serviceType')).toHaveValue('mobile');
  expect(screen.getByRole('radio', { name: en.form.requestTypes.quote })).toHaveAttribute('aria-checked', 'true');
});

it('keeps SSR controls disabled until hydration has recovered the current draft', () => {
  const ssr = document.createElement('div'); ssr.innerHTML = renderToString(view('en'));
  expect(ssr.querySelector('#description')).toBeDisabled();
  expect(ssr.querySelector('#email')).toBeDisabled();
  expect(ssr.querySelector('button[type=submit]')).toBeDisabled();
  writeRequestDraft('guest', { description: text, serviceType: 'mobile' });
  const { container } = render(view('en'));
  expect(container.querySelector('#description')).toBeEnabled();
  expect(container.querySelector('#description')).toHaveValue(text);
  expect(container.querySelector('#serviceType')).toHaveValue('mobile');
});

it('keeps the write-failure warning across remounts until a confirmed successful save', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic write quota failure'); });
  const first = render(view('ar'));
  fireEvent.change(first.container.querySelector('#description')!, { target: { value: text } }); first.unmount();
  const second = render(view('en'));
  expect(second.container.querySelector('#description')).toHaveValue(text);
  expect(screen.getByText(/Storage is unavailable/)).toBeVisible();
  expect(screen.queryByText(/This tab can restore/)).not.toBeInTheDocument();
  write.mockRestore(); second.unmount();
  const third = render(view('ar'));
  expect(screen.getByText(/التخزين غير متاح/)).toBeVisible();
  fireEvent.change(third.container.querySelector('#description')!, { target: { value: text + ' saved' } });
  expect(screen.queryByText(/التخزين غير متاح/)).not.toBeInTheDocument();
  third.unmount(); const fourth = render(view('en'));
  expect(fourth.container.querySelector('#description')).toHaveValue(text + ' saved');
  expect(screen.queryByText(/Storage is unavailable/)).not.toBeInTheDocument();
  expect(screen.getByText(/This tab can restore/)).toBeVisible();
});
