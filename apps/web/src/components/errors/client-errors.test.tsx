// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClientErrors } from './client-errors';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function mount() {
 const listeners = vi.spyOn(window, 'addEventListener');
 const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
 render(<ClientErrors locale="en" />);
 const report = listeners.mock.calls.find(([type]) => type === 'error')![1] as EventListener;
 return { report: (event: ErrorEvent) => act(() => report(event)), diagnostic };
}
for (const message of ['ResizeObserver loop completed with undelivered notifications.', 'ResizeObserver loop limit exceeded']) {
 it(`leaves native ${message} observable without a false failure or throttling the next real error`, () => {
  const { report, diagnostic } = mount();
  const warning = new ErrorEvent('error', { message, cancelable: true });
  report(warning);
  expect(warning.defaultPrevented).toBe(false);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(diagnostic).not.toHaveBeenCalled();
  const failure = new ErrorEvent('error', { message, error: new Error(message), cancelable: true });
  report(failure);
  expect(failure.defaultPrevented).toBe(true);
  expect(screen.getByRole('alert')).toBeVisible();
  expect(diagnostic).toHaveBeenCalledTimes(1);
  expect(diagnostic.mock.calls[0][0]).not.toContain(message);
 });
}
it('continues reporting unknown native errors without exposing exception text', () => {
 const { report, diagnostic } = mount();
 report(new ErrorEvent('error', { message: 'Synthetic private detail', cancelable: true }));
 expect(screen.getByRole('alert')).toBeVisible();
 expect(diagnostic).toHaveBeenCalledTimes(1);
 expect(diagnostic.mock.calls[0][0]).not.toContain('Synthetic private detail');
});
