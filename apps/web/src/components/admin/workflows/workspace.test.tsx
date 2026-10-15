// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ApiError } from '@/lib/errors/transport';
import { legacyWorkflow } from '@so7ob/contracts';
import { WorkflowWorkspace } from './workspace';
const { get, send } = vi.hoisted(() => ({ get: vi.fn(), send: vi.fn() }));
vi.mock('../helpers', async original => ({ ...await original<typeof import('../helpers')>(), apiGet: get, apiSend: send }));
vi.mock('./graph', () => ({ WorkflowGraph: () => null }));
const flows = ['one', 'two'].map(id => ({ id, revision: 0, scope: 'requests', draft: { ...legacyWorkflow('requests'), nameAr: 'مسار ' + id, nameEn: 'Workflow ' + id } }));
const fixture = () => ({ ok: true, workflows: structuredClone(flows), versions: [], teams: [], calendars: [], staff: [], bindings: [] });
beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue(fixture()); send.mockImplementation((_url, _method, body) => Promise.resolve({ ok: true, id: body.payload.id ?? 'created', revision: body.payload.revision === undefined ? 0 : body.payload.revision + 1 })); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function setup(locale: 'ar' | 'en' = 'en', readOnly = false, leaveLoader?: () => Promise<unknown>) {
 const router = createMemoryRouter([{ path: '/:locale/admin/workflows', element: <WorkflowWorkspace locale={locale} me={{ id: 'synthetic', email: 'synthetic@example.invalid', name: 'Synthetic', roleKey: readOnly ? 'staff' : 'super_admin', locale, permissions: readOnly ? ['workflows.view'] : ['workflows.view', 'workflows.manage', 'workflows.publish'] }} /> }, { path: '*', loader: leaveLoader, element: <p>Outside workflow editor</p> }], { initialEntries: [`/${locale}/admin/workflows`] });
 render(<RouterProvider router={router} />);
 const select = await screen.findByRole('combobox', { name: locale === 'ar' ? 'المسار' : 'Workflow' });
 fireEvent.change(select, { target: { value: 'one' } });
 return { select, router, name: screen.getByRole('textbox', { name: locale === 'ar' ? 'اسم المسار بالإنجليزية' : 'Workflow English name' }) };
}
it('asks before selecting another workflow and cancellation retains the edited definition', async () => {
 const { select, name } = await setup();
 fireEvent.change(name, { target: { value: 'Unsaved one' } });
 fireEvent.change(select, { target: { value: 'two' } });
 expect(screen.getByRole('alertdialog')).toBeVisible();
 expect(name).toHaveValue('Unsaved one'); expect(select).toHaveValue('one');
 fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
 expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
 expect(name).toHaveValue('Unsaved one'); expect(select).toHaveValue('one');
 expect(send).not.toHaveBeenCalled();
});

function deferred() {
 let resolve!: (value: unknown) => void; let reject!: (error: Error) => void;
 const promise = new Promise((resolveValue, rejectValue) => { resolve = resolveValue; reject = rejectValue; });
 return { promise, resolve, reject };
}
for (const locale of ['ar', 'en'] as const) {
 const t = (ar: string, en: string) => locale === 'ar' ? ar : en;
 const stay = () => screen.getByRole('button', { name: t('البقاء', 'Stay') });
 const drop = () => screen.getByRole('button', { name: t('تجاهل التعديلات والمتابعة', 'Discard changes and continue') });
 const saveAndGo = () => screen.getByRole('button', { name: t('حفظ المسودة والمتابعة', 'Save draft and continue') });
 it(`${locale}: discards only by explicit choice and updates selection atomically`, async () => {
  const { select, name } = await setup(locale);
  fireEvent.change(name, { target: { value: 'Unsaved one' } }); fireEvent.change(select, { target: { value: 'two' } });
  expect(select).toHaveValue('one'); fireEvent.click(stay()); expect(name).toHaveValue('Unsaved one');
  fireEvent.change(select, { target: { value: 'two' } }); fireEvent.click(drop());
  expect(select).toHaveValue('two'); expect(name).toHaveValue('Workflow two');
  fireEvent.change(select, { target: { value: 'one' } }); expect(name).toHaveValue('Workflow one'); expect(send).not.toHaveBeenCalled();
 });
 it(`${locale}: saves the source workflow before continuing and keeps the confirmed snapshot`, async () => {
  const { select, name } = await setup(locale);
  fireEvent.change(name, { target: { value: 'Saved one' } }); fireEvent.change(select, { target: { value: 'two' } });
  fireEvent.click(saveAndGo()); await waitFor(() => expect(select).toHaveValue('two'));
  expect(send.mock.calls[0][2].payload).toMatchObject({ id: 'one', revision: 0, definition: { nameEn: 'Saved one' } });
  expect(send.mock.calls[0][0]).toBe('/api/admin/workflows/drafts');
  fireEvent.change(select, { target: { value: 'one' } }); expect(name).toHaveValue('Saved one'); expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
 });
 it(`${locale}: reverting an edit removes navigation and unload warnings`, async () => {
  const { select, name } = await setup(locale);
  fireEvent.change(name, { target: { value: 'Changed' } });
  const dirtyUnload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(dirtyUnload); expect(dirtyUnload.defaultPrevented).toBe(true);
  fireEvent.change(name, { target: { value: 'Workflow one' } });
  const cleanUnload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(cleanUnload); expect(cleanUnload.defaultPrevented).toBe(false);
  fireEvent.change(select, { target: { value: 'two' } }); expect(select).toHaveValue('two'); expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
 });
 for (const code of [400, 409, 503]) it(`${locale}: failed save ${code} retains draft, selection and destination decision`, async () => {
  send.mockRejectedValue(new ApiError(code, code === 409 ? 'workflow_conflict' : 'invalid'));
  const { select, name } = await setup(locale);
  fireEvent.change(name, { target: { value: 'Retained after failure' } }); fireEvent.change(select, { target: { value: 'two' } }); fireEvent.click(saveAndGo());
  await screen.findByRole('alertdialog'); await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  expect(select).toHaveValue('one'); expect(name).toHaveValue('Retained after failure');
  fireEvent.click(stay()); expect(name).toHaveValue('Retained after failure');
 });
 it(`${locale}: a delayed acknowledgement preserves newer edits and uses the new revision on retry`, async () => {
  const pending = deferred(); send.mockReturnValueOnce(pending.promise);
  const { name } = await setup(locale);
  fireEvent.change(name, { target: { value: 'First snapshot' } }); fireEvent.click(screen.getByRole('button', { name: t('حفظ المسودة', 'Save draft') }));
  fireEvent.change(name, { target: { value: 'Newer edit' } });
  await act(async () => pending.resolve({ ok: true, id: 'one', revision: 1 }));
  expect(name).toHaveValue('Newer edit');
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: t('حفظ المسودة', 'Save draft') }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[1][2].payload).toMatchObject({ id: 'one', revision: 1, definition: { nameEn: 'Newer edit' } });
 });
 it(`${locale}: save and continue cannot discard edits newer than the submitted snapshot`, async () => {
  const pending = deferred(); send.mockReturnValueOnce(pending.promise);
  const { select, name } = await setup(locale);
  fireEvent.change(name, { target: { value: 'First snapshot' } }); fireEvent.change(select, { target: { value: 'two' } }); fireEvent.click(saveAndGo());
  fireEvent.change(name, { target: { value: 'Newer during request' } });
  await act(async () => pending.resolve({ ok: true, id: 'one', revision: 1 }));
  expect(select).toHaveValue('one'); expect(name).toHaveValue('Newer during request'); expect(screen.getByRole('alertdialog')).toBeVisible();
  fireEvent.click(saveAndGo()); await waitFor(() => expect(select).toHaveValue('two'));
  expect(send.mock.calls[1][2].payload.revision).toBe(1);
 });
 it(`${locale}: route navigation and back/forward require an explicit choice`, async () => {
  const { router, name } = await setup(locale);
  fireEvent.change(name, { target: { value: 'Dirty before navigation' } });
  await act(async () => { await router.navigate(`/${locale}/admin`); });
  expect(router.state.location.pathname).toBe(`/${locale}/admin/workflows`); fireEvent.click(stay());
  await act(async () => { await router.navigate(`/${locale}/admin`); }); fireEvent.click(drop());
  await waitFor(() => expect(router.state.location.pathname).toBe(`/${locale}/admin`));
  await act(async () => { await router.navigate(-1); });
  const select = await screen.findByRole('combobox', { name: t('المسار', 'Workflow') });
  fireEvent.change(select, { target: { value: 'one' } }); fireEvent.change(screen.getByRole('textbox', { name: t('اسم المسار بالإنجليزية', 'Workflow English name') }), { target: { value: 'Dirty before forward' } });
  await act(async () => { await router.navigate(1); }); expect(screen.getByRole('alertdialog')).toBeVisible(); fireEvent.click(stay());
  expect(router.state.location.pathname).toBe(`/${locale}/admin/workflows`);
 });
 it(`${locale}: new-workflow reset is guarded and copying keeps all current edits`, async () => {
  const { name, select } = await setup(locale);
  fireEvent.change(name, { target: { value: 'Source edits' } }); fireEvent.click(screen.getByRole('button', { name: t('مسار جديد', 'New workflow') }));
  expect(screen.getByRole('alertdialog')).toBeVisible(); fireEvent.click(stay()); expect(name).toHaveValue('Source edits');
  fireEvent.click(screen.getByRole('button', { name: t('نسخ كمسار جديد', 'Copy as new workflow') }));
  expect(select).toHaveValue(''); expect(name).toHaveValue('Source edits — Copy');
  fireEvent.change(select, { target: { value: 'two' } }); expect(screen.getByRole('alertdialog')).toBeVisible(); fireEvent.click(stay());
  expect(name).toHaveValue('Source edits — Copy');
 });
}

it('saving a new workflow cannot move later edits to a different workflow or create a duplicate', async () => {
 const pending = deferred(); send.mockReturnValueOnce(pending.promise);
 const { select, name } = await setup();
 fireEvent.click(screen.getByRole('button', { name: 'New workflow' }));
 fireEvent.change(name, { target: { value: 'New submitted' } }); fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
 fireEvent.change(name, { target: { value: 'Newer new workflow' } });
 await act(async () => pending.resolve({ ok: true, id: 'created', revision: 0 }));
 expect(select).toHaveValue('created'); expect(name).toHaveValue('Newer new workflow');
 fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
 await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
 expect(send.mock.calls[1][2].payload).toMatchObject({ id: 'created', revision: 0, definition: { nameEn: 'Newer new workflow' } });
});
it('cancelling a pending save-and-leave does not navigate on its late acknowledgement', async () => {
 const pending = deferred(); send.mockReturnValueOnce(pending.promise);
 const { select, name } = await setup();
 fireEvent.change(name, { target: { value: 'Stay after saving' } }); fireEvent.change(select, { target: { value: 'two' } });
 fireEvent.click(screen.getByRole('button', { name: 'Save draft and continue' })); fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
 await act(async () => pending.resolve({ ok: true, id: 'one', revision: 1 }));
 expect(select).toHaveValue('one'); expect(name).toHaveValue('Stay after saving'); expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
it('normalizes only the acknowledged snapshot and reports a clean save without a second list read', async () => {
 const { name } = await setup();
 fireEvent.change(name, { target: { value: '  Normalized name  ' } }); fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
 await waitFor(() => expect(name).toHaveValue('Normalized name'));
 const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); expect(e.defaultPrevented).toBe(false);
 expect(get).toHaveBeenCalledTimes(1);
});
it('an incomplete save acknowledgement cannot clear the draft or allow continuation', async () => {
 send.mockResolvedValue({ ok: true, id: 'one' });
 const { select, name } = await setup();
 fireEvent.change(name, { target: { value: 'Uncertain retained draft' } }); fireEvent.change(select, { target: { value: 'two' } }); fireEvent.click(screen.getByRole('button', { name: 'Save draft and continue' }));
 await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
 expect(select).toHaveValue('one'); expect(name).toHaveValue('Uncertain retained draft');
 expect(screen.getByRole('button', { name: 'Save draft and continue' })).toBeDisabled();
});
it('guards application anchors activated by keyboard without losing their destination', async () => {
 const { router, name } = await setup();
 fireEvent.change(name, { target: { value: 'Dirty before application link' } });
 const link = document.createElement('a'); link.href = '/en/admin'; link.textContent = 'Synthetic application link'; document.body.append(link);
 try {
  fireEvent.click(link, { button: 0, detail: 0 }); expect(screen.getByRole('alertdialog')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Stay' })); expect(router.state.location.pathname).toBe('/en/admin/workflows');
  fireEvent.click(link, { button: 0, detail: 0 }); fireEvent.click(screen.getByRole('button', { name: 'Discard changes and continue' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/en/admin'));
 } finally { link.remove(); }
});

it('read-only permission never enables draft saving through the navigation dialog', async () => {
 const { select, name } = await setup('en', true);
 fireEvent.change(name, { target: { value: 'Read-only local edit' } }); fireEvent.change(select, { target: { value: 'two' } });
 expect(screen.getByRole('button', { name: 'Save draft and continue' })).toBeDisabled();
 fireEvent.click(screen.getByRole('button', { name: 'Save draft and continue' })); expect(send).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Stay' })); expect(name).toHaveValue('Read-only local edit');
});

it('a failed in-flight save cannot automatically release a pending route even for an unchanged definition', async () => {
 const pending = deferred(); send.mockReturnValueOnce(pending.promise);
 const { router } = await setup();
 fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
 await act(async () => { await router.navigate('/en/admin'); });
 expect(screen.getByRole('alertdialog')).toBeVisible();
 await act(async () => pending.reject(new ApiError(503, 'unavailable', null, undefined, true)));
 expect(router.state.location.pathname).toBe('/en/admin/workflows');
 expect(screen.getByRole('alertdialog')).toBeVisible();
 fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
 expect(router.state.location.pathname).toBe('/en/admin/workflows');
});
it('a refresh started before a save cannot restore the old workflow when it is selected again', async () => {
 const read = deferred();
 send.mockRejectedValueOnce(new ApiError(400, 'invalid'));
 const { select, name } = await setup();
 fireEvent.click(screen.getByRole('button', { name: 'Validate workflow' }));
 const refresh = await screen.findByRole('button', { name: 'Refresh data' });
 get.mockReturnValueOnce(read.promise); fireEvent.click(refresh);
 fireEvent.change(name, { target: { value: 'Confirmed during refresh' } }); fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
 await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
 await act(async () => read.resolve(fixture()));
 fireEvent.change(select, { target: { value: 'two' } }); fireEvent.change(select, { target: { value: 'one' } });
 expect(name).toHaveValue('Confirmed during refresh');
 fireEvent.change(select, { target: { value: 'two' } });
 send.mockRejectedValueOnce(new ApiError(400, 'invalid'));
 fireEvent.click(screen.getByRole('button', { name: 'Validate workflow' }));
 const fresh = fixture(); fresh.workflows[0].draft.nameEn = 'Fresh external draft'; fresh.workflows[0].revision = 2;
 get.mockResolvedValue(fresh); fireEvent.click(await screen.findByRole('button', { name: 'Refresh data' }));
 await waitFor(() => expect(screen.getByRole('option', { name: 'Fresh external draft' })).toBeInTheDocument());
 fireEvent.change(select, { target: { value: 'one' } }); expect(name).toHaveValue('Fresh external draft');
});
it('an older refresh cannot erase a newer save failure or release its pending route', async () => {
 const read = deferred(), write = deferred();
 send.mockRejectedValueOnce(new ApiError(400, 'invalid'));
 const { router } = await setup();
 fireEvent.click(screen.getByRole('button', { name: 'Validate workflow' }));
 const refresh = await screen.findByRole('button', { name: 'Refresh data' });
 get.mockReturnValueOnce(read.promise); fireEvent.click(refresh);
 send.mockReturnValueOnce(write.promise);
 fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
 await act(async () => { await router.navigate('/en/admin'); });
 await act(async () => write.reject(new ApiError(400, 'invalid')));
 await act(async () => read.resolve(fixture()));
 expect(router.state.location.pathname).toBe('/en/admin/workflows');
 expect(screen.getByRole('alertdialog')).toBeVisible(); expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
});

it('a confirmed in-flight save can release the pending route when no newer edits remain', async () => {
 const pending = deferred(); send.mockReturnValueOnce(pending.promise);
 const { router } = await setup();
 fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
 await act(async () => { await router.navigate('/en/admin'); });
 expect(screen.getByRole('alertdialog')).toBeVisible();
 await act(async () => pending.resolve({ ok: true, id: 'one', revision: 1 }));
 await waitFor(() => expect(router.state.location.pathname).toBe('/en/admin'));
});

it('freezes the definition while an approved navigation is still waiting for its loader', async () => {
 const destination = deferred(); const { router, name } = await setup('en', false, () => destination.promise);
 fireEvent.change(name, { target: { value: 'Draft before leaving' } });
 await act(async () => { await router.navigate('/en/admin'); });
 fireEvent.click(screen.getByRole('button', { name: 'Discard changes and continue' }));
 try { await waitFor(() => expect(name).toBeDisabled()); }
 finally { await act(async () => destination.resolve(null)); }
});
