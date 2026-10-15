// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { legacyWorkflow } from '@so7ob/contracts';
import { WorkflowWorkspace } from './workspace';
import { ApiError } from '@/lib/errors/transport';

const { get, send } = vi.hoisted(() => ({ get: vi.fn(), send: vi.fn() }));
vi.mock('../helpers', async original => ({ ...await original<typeof import('../helpers')>(), apiGet: get, apiSend: send }));
vi.mock('./graph', () => ({ WorkflowGraph: () => null }));
const definition = { ...legacyWorkflow('requests'), nameAr: 'مسار متشابه', nameEn: 'Similar workflow' };
const first = { id: '12345678901234567890123400000001', workflowId: 'flow-one', definition, legacy: false, createdAt: '2026-10-15T07:00:00.001Z' };
const second = { ...first, id: '12345678901234567890123400000002', createdAt: '2026-10-15T08:00:00.002Z' };
const other = { ...first, id: '12345678901234567890123400000003', workflowId: 'flow-two' };
type TestVersion = Omit<typeof first, 'createdAt'> & { createdAt?: string | null };
const overview = (versions: TestVersion[] = [first]) => ({ ok: true, workflows: [], versions, calendars: [], teams: [], staff: [], bindings: [] });
const records = { records: [{ id: 'record', refCode: 'SYNTHETIC-121', stageId: 'new' }], total: 1 };
const preview = { ok: true, previewId: 'preview-121', rows: [{ recordId: 'record', from: 'new', to: 'in_review', visibility: 'authorized', targetStatus: 'in_review', responseDueAt: null, stageDueAt: null, route: { teamId: null, assigneeId: null } }] };
beforeEach(() => {
  vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn();
  send.mockImplementation((url: string) => Promise.resolve(url.endsWith('/preview') ? preview : { ok: true }));
});
afterEach(cleanup);

async function mount(locale: 'ar' | 'en', versions: TestVersion[] = [first], readOnly = false) {
  get.mockImplementation((url: string) => Promise.resolve(url.includes('/transfer/records') ? records : overview(versions)));
  const router = createMemoryRouter([{ path: '/', element: <WorkflowWorkspace locale={locale} me={{ id: 'synthetic', email: 'synthetic@example.invalid', name: 'Synthetic', roleKey: readOnly ? 'staff' : 'super_admin', locale, permissions: readOnly ? ['workflows.view', 'requests.view.all'] : [] }} /> }]);
  const view = render(<RouterProvider router={router} />);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: locale === 'ar' ? 'نقل المعاملات' : 'Transfer conversations' }), { button: 0, ctrlKey: false });
  return { ...view, select: screen.getByRole('combobox', { name: locale === 'ar' ? 'الإصدار الهدف' : 'Target version' }) };
}

for (const locale of ['ar', 'en'] as const) {
  const t = (ar: string, en: string) => locale === 'ar' ? ar : en;
  async function selection(readOnly = false) {
    const view = await mount(locale, [second, other, first], readOnly);
    fireEvent.click(screen.getByRole('button', { name: t('تحميل المعاملات', 'Load conversations') }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'SYNTHETIC-121' }));
    fireEvent.change(view.select, { target: { value: first.id } });
    fireEvent.change(screen.getByRole('combobox', { name: t('ربط المرحلة', 'Map stage') + ' new' }), { target: { value: 'in_review' } });
    return { ...view, label: view.select.querySelector(`option[value="${first.id}"]`)!.textContent! };
  }
  it(`${locale}: published identity survives insertion, reordering, equal names/dates and scope filtering`, async () => {
    let view = await mount(locale);
    const label = within(view.select).getByRole('option', { name: /Similar workflow|مسار متشابه/ }).textContent!;
    expect(label).toContain(first.id);
    expect(label).toContain('2026-10-15 07:00:00.001 UTC');
    view.unmount();
    const hidden = { ...other, id: 'other-scope', definition: legacyWorkflow('inquiries') };
    const inherited = { ...first, id: 'legacy', legacy: true };
    view = await mount(locale, [second, hidden, other, inherited, first]);
    const labels = [...view.select.querySelectorAll('option[value]')].filter(option => option.getAttribute('value')).map(option => option.textContent);
    expect(labels).toHaveLength(3);
    expect(new Set(labels).size).toBe(3);
    expect(view.select.querySelector(`option[value="${first.id}"]`)).toHaveTextContent(label);
    view.unmount();
    view = await mount(locale, [first, other, second]);
    expect(view.select.querySelector(`option[value="${first.id}"]`)).toHaveTextContent(label);
  });
  it(`${locale}: selection, preview, confirmation and successful result retain the same pinned destination identity`, async () => {
    const { label, select } = await selection();
    expect(select).toHaveAccessibleDescription(label);
    expect(screen.getByRole('note', { name: t('هوية الإصدار المحدد', 'Selected version identity') })).toHaveTextContent(label);
    fireEvent.click(screen.getByRole('button', { name: t('معاينة النقل', 'Preview transfer') }));
    const confirm = await screen.findByRole('button', { name: t('تأكيد النقل المعاين', 'Confirm previewed transfer') });
    expect(screen.getByRole('note', { name: t('وجهة النقل المعاين', 'Preview destination') })).toHaveTextContent(label);
    expect(confirm).toHaveAccessibleDescription(label);
    expect(send.mock.calls[0][2].payload).toEqual({ scope: 'requests', ids: ['record'], versionId: first.id, mapping: { new: 'in_review' } });
    get.mockResolvedValue(overview([other, first, second]));
    fireEvent.click(confirm);
    expect(await screen.findByRole('status', { name: t('نتيجة النقل', 'Transfer result') })).toHaveTextContent(label);
    expect(send.mock.calls[1][2].payload).toEqual({ previewId: 'preview-121' });
    expect(select).toHaveValue(first.id);
    expect(select.querySelector(`option[value="${first.id}"]`)).toHaveTextContent(label);
  });
  it(`${locale}: a rejected stale confirmation keeps its identity and never announces a successful transfer`, async () => {
    const { label, select } = await selection();
    send.mockImplementation((url: string) => url.endsWith('/confirm') ? Promise.reject(new ApiError(409, 'workflow_conflict')) : Promise.resolve(preview));
    fireEvent.click(screen.getByRole('button', { name: t('معاينة النقل', 'Preview transfer') }));
    fireEvent.click(await screen.findByRole('button', { name: t('تأكيد النقل المعاين', 'Confirm previewed transfer') }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(select).toHaveValue(first.id);
    expect(screen.getByRole('note', { name: t('وجهة النقل المعاين', 'Preview destination') })).toHaveTextContent(label);
    expect(screen.queryByRole('status', { name: t('نتيجة النقل', 'Transfer result') })).not.toBeInTheDocument();
    expect(send.mock.calls[1][2].payload).toEqual({ previewId: 'preview-121' });
  });
  it(`${locale}: version clarity does not grant transfer permission`, async () => {
    await selection(true);
    expect(screen.getByRole('button', { name: t('معاينة النقل', 'Preview transfer') })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });
  it(`${locale}: old metadata without a date retains its real identity without inventing a publication date`, async () => {
    const { select } = await mount(locale, [{ ...first, createdAt: undefined }]);
    const option = select.querySelector(`option[value="${first.id}"]`)!;
    expect(option).toHaveTextContent(first.id);
    expect(option).toHaveTextContent(t('تاريخ النشر غير متاح', 'Publication date unavailable'));
    expect(option).not.toHaveTextContent('1970'); expect(option).not.toHaveTextContent('Invalid Date');
  });
}
