import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router-dom';
import type { PublicView } from '@so7ob/contracts';
import { routes } from './app';
import { headMarkup } from './metadata';
export async function render(url: string, data: PublicView) {
  const handler = createStaticHandler(routes(() => data)); const context = await handler.query(new Request(url));
  if (context instanceof Response) throw context;
  const html = renderToString(<StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} hydrate={false} />);
  return { html, head:headMarkup(data),lang:data.locale,dir:data.locale==='ar'?'rtl':'ltr' };
}
