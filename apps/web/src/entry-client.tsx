import {requestJson,ApiError,asApiError} from './lib/errors/transport';
import {errorCopy} from './lib/errors/messages';
import { hydrateRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, redirect, matchRoutes } from 'react-router-dom';
import type { PublicView } from '@so7ob/contracts';
import { updateMetadata } from './metadata';
import { routes } from './app';
import './styles.css';
declare global { interface Window { __SO7OB__: PublicView } }
const definitions = routes(async ({ request }) => {
  const url = new URL(request.url);
  let data:PublicView|{redirect:string};
  try{data=(await requestJson<PublicView|{redirect:string}>(`/api/v1/public/view?path=${encodeURIComponent(url.pathname+url.search)}`,{signal:request.signal,credentials:'same-origin'})).data;}
  catch(error){if(!(error instanceof ApiError)||error.status!==404)throw error;
    const missing:PublicView={kind:'not-found',locale:url.pathname.startsWith('/en')?'en':'ar',menus:[],settings:{},canonicalOrigin:url.origin,viewer:null};updateMetadata(missing);return missing;}
  if('redirect' in data)return redirect(data.redirect);
  updateMetadata(data);
  return data;
});
// Resolve only the matched screen chunk before hydration to retain the SSR DOM.
try {
for (const match of matchRoutes(definitions,window.location.pathname) ?? []) {
  if (typeof match.route.lazy === 'function') { Object.assign(match.route,await match.route.lazy()); delete match.route.lazy; }
}
const router=createBrowserRouter(definitions, { hydrationData: { loaderData: { root: window.__SO7OB__ } } });
hydrateRoot(document.getElementById('root')!, <RouterProvider router={router} />);

}catch(error){
 const failure=asApiError(error),locale=window.location.pathname.startsWith('/en')?'en':'ar',t=errorCopy[locale];
 const notice=document.createElement('section');notice.setAttribute('role','alert');notice.dir=locale==='ar'?'rtl':'ltr';notice.className='m-4 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950 p-4 text-rose-950 dark:text-rose-200';
 const message=document.createElement('p');message.textContent=`${t.failed}. ${t.internal} ${t.local}: ${failure.localId??failure.errorId??failure.requestId}. `+(locale==='ar'?'احتفظ بنسخة من المدخلات قبل إعادة تحميل الصفحة.':'Keep a copy of your input before reloading the page.');notice.append(message);
 const button=document.createElement('button');button.textContent=t.reload;button.className='min-h-11 underline';button.onclick=()=>window.location.reload();notice.append(button);document.getElementById('root')?.before(notice);
 console.error(JSON.stringify({at:new Date().toISOString(),component:'Web',level:'error',event:'bootstrap_failed',revision:import.meta.env.VITE_BUILD_SHA??'unavailable',localId:failure.localId,requestId:failure.requestId,errorId:failure.errorId}));
}
