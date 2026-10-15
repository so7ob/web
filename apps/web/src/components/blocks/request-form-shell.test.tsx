// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router-dom';
import { REQUEST_DRAFT_KEY, clearRequestDraft } from '../form/request-draft';
import { RequestFormShell } from './request-form-shell';
afterEach(() => { cleanup(); clearRequestDraft('guest'); localStorage.clear(); sessionStorage.clear(); });
function Shell() { const { locale } = useParams(); return <RequestFormShell locale={locale === 'en' ? 'en' : 'ar'} preselectService="web" />; }
it('restores a chosen service above the CMS default when changing locale', async () => {
  const router = createMemoryRouter([{ id: 'root', path: '/:locale/contact', loader: () => ({ viewer: null }), element: <Shell /> }], { initialEntries: ['/ar/contact'] });
  const { container } = render(<RouterProvider router={router} />);
  await waitFor(() => expect(container.querySelector('#serviceType')).toHaveValue('web'));
  fireEvent.change(container.querySelector('#serviceType')!, { target: { value: 'mobile' } });
  fireEvent.change(container.querySelector('#description')!, { target: { value: 'Synthetic CMS default reproduction with sufficient description.' } });
  // The draft must contain the choice before locale navigation applies its CMS default.
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem(REQUEST_DRAFT_KEY) ?? '{}').values?.serviceType).toBe('mobile'));
  await act(async () => { await router.navigate('/en/contact'); });
  await waitFor(() => expect(container.querySelector('#serviceType')).toHaveValue('mobile'));
});
