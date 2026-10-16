import {themeBootstrap,defaultMode} from './lib/appearance';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router-dom';
import type { PublicView } from '@so7ob/contracts';
import {appearanceForScope} from '@so7ob/contracts';
import { routes } from './app';
import { headMarkup } from './metadata';
export async function render(url: string, data: PublicView) {
  const handler = createStaticHandler(routes(() => data)); const context = await handler.query(new Request(url));
  if (context instanceof Response) throw context;
  const html = renderToString(<StaticRouterProvider router={createStaticRouter(handler.dataRoutes, context)} context={context} hydrate={false} />);
  const scope = data.kind === "admin" ? "admin" : "site";
  const appearance = appearanceForScope(data.settings, scope);
  return { html, colorMode:defaultMode(appearance)==="dark"?"dark":"light", head:headMarkup(data)+`<script>${themeBootstrap(appearance, scope)}</script>`,lang:data.locale,dir:data.locale==='ar'?'rtl':'ltr' };
}
