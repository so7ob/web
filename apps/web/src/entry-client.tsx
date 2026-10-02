import { hydrateRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, redirect } from 'react-router-dom';
import type { PublicView } from '@so7ob/contracts';
import { routes } from './app';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import './styles.css';
declare global { interface Window { __SO7OB__: PublicView } }
const router = createBrowserRouter(routes(async ({ request }) => {
  const url = new URL(request.url);
  const response = await fetch(`/api/v1/public/view?path=${encodeURIComponent(url.pathname + url.search)}`, { signal: request.signal, credentials: 'same-origin' });
  if (!response.ok) throw response;
  const data = await response.json();
  if (data.redirect) return redirect(data.redirect);
  document.documentElement.lang = data.locale; document.documentElement.dir = data.locale === 'ar' ? 'rtl' : 'ltr';
  return data;
}), { hydrationData: { loaderData: { root: window.__SO7OB__ } } });
hydrateRoot(document.getElementById('root')!, <RouterProvider router={router} />);
