// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { legacyWorkflow, type WorkflowScope, type WorkflowState } from '@so7ob/contracts';
import { ConversationManagement } from './management';
import { getPortalContent } from '@/content/portal';

const { get, send } = vi.hoisted(() => ({ get: vi.fn(), send: vi.fn() }));
vi.mock('../helpers', async original => ({ ...await original<typeof import('../helpers')>(), apiGet: get, apiSend: send }));
beforeEach(() => {
  vi.clearAllMocks(); get.mockResolvedValue({ staff: [] }); send.mockResolvedValue({ ok: true });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

for (const locale of ['ar', 'en'] as const) for (const scope of ['requests', 'inquiries'] as const) {
  const t = (ar: string, en: string) => locale === 'ar' ? ar : en;
  const review = { nameAr: 'فحص بشري', nameEn: 'Human review', status: 'in_review' };
  const decision = { nameAr: 'قائمة القرار', nameEn: 'Decision queue', status: 'closed' };
  const template = legacyWorkflow(scope).transitions[0];
  const transitions = [
    { ...template, id: 'review-action', to: 'review-id', reasonRequired: false, targetStage: review },
    { ...template, id: 'decision-action', to: 'decision-id', reasonRequired: true, targetStage: decision },
    { ...template, id: 'custom-action', to: 'review-id', nameAr: 'تدقيق مخصص', nameEn: 'Custom audit', reasonRequired: false, targetStage: review },
  ];
  const genericLabel = t('انتقال إلى فحص بشري', 'Move to Human review');
  const decisionLabel = t('انتقال إلى قائمة القرار', 'Move to Decision queue');
  const customLabel = t('تدقيق مخصص إلى فحص بشري', 'Custom audit to Human review');
  async function mount(options: { transitions?: WorkflowState['transitions']; legacy?: boolean; readOnly?: boolean } = {}) {
    const state: WorkflowState = { workflowId: 'flow', versionId: 'published', revision: 7, legacy: options.legacy ?? false,
      stage: { id: 'new', nameAr: 'وارد', nameEn: 'Intake', status: 'new' }, teamId: null, teamName: null, teamLabels: null,
      responseDueAt: null, stageDueAt: null, transitions: options.transitions ?? transitions, replyEffect: null, events: [] };
    const patch = vi.fn().mockResolvedValue(true), onChanged = vi.fn();
    render(<ConversationManagement scope={scope as WorkflowScope} locale={locale} me={{ id: 'staff', name: 'Synthetic', email: 'staff@example.invalid', roleKey: 'synthetic', locale, permissions: options.readOnly ? [`${scope}.view.all`] : [`${scope}.view.all`, `${scope}.status`] }} detail={{ id: 'record', status: 'new', assigneeId: null, archivedAt: null, workflow: state }} patch={patch} onChanged={onChanged} disabled={false} />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    return { patch, onChanged, select: screen.queryByRole('combobox', { name: getPortalContent(locale).admin.requests.changeStatus }) };
  }
  it(`${locale}/${scope}: names distinguish destinations and preserve custom action names`, async () => {
    const { select, patch, onChanged } = await mount();
    fireEvent.keyDown(select!, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: genericLabel })).toBeVisible();
    expect(screen.getByRole('option', { name: decisionLabel })).toBeVisible();
    fireEvent.click(screen.getByRole('option', { name: customLabel }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]).toEqual(['/api/admin/workflows/' + scope + '/record/transition', 'POST', { payload: { transitionId: 'custom-action', expectedRevision: 7, operationId: expect.any(String), reason: undefined } }]);
    expect(patch).not.toHaveBeenCalled();
  });
  it(`${locale}/${scope}: reason dialog describes the selected destination, requires a reason and keeps its ID`, async () => {
    const { select, onChanged } = await mount();
    fireEvent.keyDown(select!, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: decisionLabel }));
    expect(screen.getByRole('dialog', { name: t('تأكيد الانتقال', 'Confirm transition') })).toHaveAccessibleDescription(decisionLabel);
    const apply = screen.getByRole('button', { name: getPortalContent(locale).admin.requests.applyStatus });
    expect(apply).toBeDisabled(); expect(send).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(t('سبب الانتقال', 'Transition reason'), { exact: true }), { target: { value: ' Synthetic reason ' } });
    fireEvent.click(apply);
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(send.mock.calls[0][2].payload).toEqual({ transitionId: 'decision-action', expectedRevision: 7, operationId: expect.any(String), reason: 'Synthetic reason' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it(`${locale}/${scope}: old response metadata identifies the real stage ID and read-only staff gain no control`, async () => {
    let view = await mount({ transitions: [{ ...template, id: 'old', to: 'custom-id' }] });
    fireEvent.keyDown(view.select!, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: t('انتقال إلى المرحلة custom-id', 'Move to stage custom-id') })).toBeVisible();
    cleanup(); view = await mount({ readOnly: true });
    expect(view.select).toBeNull(); expect(send).not.toHaveBeenCalled();
  });
  it(`${locale}/${scope}: legacy statuses retain their localized labels and patch behavior`, async () => {
    const { select, patch } = await mount({ legacy: true });
    fireEvent.keyDown(select!, { key: 'ArrowDown' });
    const statuses = getPortalContent(locale).admin[scope].statuses;
    fireEvent.click(screen.getByRole('option', { name: statuses.in_review }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith({ status: 'in_review' }, statuses.in_review));
    expect(send).not.toHaveBeenCalled();
  });
}
