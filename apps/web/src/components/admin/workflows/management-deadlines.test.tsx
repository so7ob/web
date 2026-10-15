// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkflowState } from '@so7ob/contracts';
import { ConversationManagement } from './management';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../helpers', async original => ({ ...await original<typeof import('../helpers')>(), apiGet: get }));
beforeEach(() => { vi.clearAllMocks(); get.mockResolvedValue({ staff: [] }); });
afterEach(cleanup);
for (const locale of ['ar', 'en'] as const) for (const scope of ['requests', 'inquiries'] as const) {
  async function mount(timezone: string | null | undefined = 'Asia/Aden', response: string | null = '2026-10-15T07:00:00.000Z', stage: string | null = '2026-10-15T09:00:00.000Z') {
    const state: WorkflowState & { calendarTimezone?: string | null } = { workflowId: 'flow', versionId: 'pinned', revision: 1, legacy: false,
      stage: { id: 'new', nameAr: 'وارد', nameEn: 'Intake', status: 'new' }, teamId: null, teamName: null, teamLabels: null,
      responseDueAt: response, stageDueAt: stage, transitions: [], replyEffect: null, events: [], calendarTimezone: timezone };
    const view = render(<ConversationManagement scope={scope} locale={locale} me={{ id: 'staff', name: 'Synthetic', email: 'staff@example.invalid', roleKey: 'synthetic', locale, permissions: [`${scope}.view.all`] }} detail={{ id: 'record', status: 'new', assigneeId: null, archivedAt: null, workflow: state }} patch={vi.fn()} onChanged={vi.fn()} disabled={false} />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    return [...view.container.querySelectorAll('time')];
  }
  it(`${locale}/${scope}: response and stage deadlines show their pinned calendar zone and original machine instant`, async () => {
    const times = await mount(); expect(times).toHaveLength(2);
    expect(times[0]).toHaveAttribute('datetime', '2026-10-15T07:00:00.000Z');
    expect(times[1]).toHaveAttribute('datetime', '2026-10-15T09:00:00.000Z');
    expect(times[0]).toHaveTextContent('10:00'); expect(times[1]).toHaveTextContent('12:00');
    for (const time of times) { expect(time).toHaveTextContent('2026'); expect(time).toHaveTextContent('Asia/Aden'); expect(time).toHaveTextContent('UTC+03:00'); expect(time.querySelector('bdi')).toHaveAttribute('dir', 'ltr'); }
  });
  it(`${locale}/${scope}: spring DST uses the offset at each deadline, including the missing wall-clock hour`, async () => {
    const times = await mount('America/New_York', '2026-03-08T06:30:00.000Z', '2026-03-08T07:30:00.000Z');
    expect(times).toHaveLength(2); expect(times[0]).toHaveTextContent('01:30'); expect(times[0]).toHaveTextContent('UTC-05:00');
    expect(times[1]).toHaveTextContent('03:30'); expect(times[1]).toHaveTextContent('UTC-04:00');
    for (const time of times) expect(time).toHaveTextContent('America/New_York');
  });
  it(`${locale}/${scope}: repeated fall-back hours remain distinguishable by offset and machine instant`, async () => {
    const times = await mount('America/New_York', '2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z');
    expect(times).toHaveLength(2); for (const time of times) expect(time).toHaveTextContent('01:30');
    expect(times[0]).toHaveTextContent('UTC-04:00'); expect(times[1]).toHaveTextContent('UTC-05:00');
    expect(times[0]).toHaveAttribute('datetime', '2026-11-01T05:30:00.000Z'); expect(times[1]).toHaveAttribute('datetime', '2026-11-01T06:30:00.000Z');
  });
  for (const timezone of [null, 'invalid/timezone']) it(`${locale}/${scope}: ${timezone ?? 'missing'} calendar metadata explicitly uses UTC`, async () => {
    const times = await mount(timezone); expect(times).toHaveLength(2);
    expect(times[0]).toHaveTextContent('07:00'); expect(times[1]).toHaveTextContent('09:00');
    for (const time of times) { expect(time).toHaveTextContent('UTC'); expect(time).not.toHaveTextContent('Asia/Aden'); expect(time).not.toHaveTextContent('invalid/timezone'); }
  });
  it(`${locale}/${scope}: absent deadlines remain absent rather than becoming epoch dates`, async () => {
    expect(await mount('Asia/Aden', null, null)).toHaveLength(0);
  });
}
