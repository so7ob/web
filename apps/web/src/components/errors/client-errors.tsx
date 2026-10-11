import {useEffect,useRef,useState} from 'react';
import {ApiError} from '@/lib/errors/transport';
import {ErrorFeedback} from './error-feedback';
import {errorCopy} from '@/lib/errors/messages';
import {Button} from '@/components/ui/button';
/** Local-only diagnostics: never collect DOM, values, URLs, screenshots or raw exception text. */
export function ClientErrors({locale}:{locale:'ar'|'en'}){
 const [error,setError]=useState<ApiError|null>(null),last=useRef(0);
 useEffect(()=>{
  const report=(event:ErrorEvent|PromiseRejectionEvent)=>{
   const reason='reason' in event?event.reason:event.error;
   if(reason instanceof Error&&reason.name==='AbortError'||reason instanceof ApiError&&reason.category==='cancelled')return;
   event.preventDefault();if(Date.now()-last.current<30000)return;last.current=Date.now();
   const failure=reason instanceof ApiError?reason:new ApiError(0,'internal_error');setError(failure);
   console.error(JSON.stringify({at:new Date().toISOString(),component:'Web',level:'error',revision:import.meta.env.VITE_BUILD_SHA??'unavailable',event:'client_error',code:'internal_error',localId:failure.localId,requestId:failure.requestId,errorId:failure.errorId}));
  };
  window.addEventListener('error',report);window.addEventListener('unhandledrejection',report);
  return()=>{window.removeEventListener('error',report);window.removeEventListener('unhandledrejection',report);};
 },[]);
 return error?<div className="mx-auto w-full max-w-5xl p-4"><ErrorFeedback error={error} locale={locale}/><Button variant="outline" className="mt-2" onClick={()=>setError(null)}>{errorCopy[locale].dismiss}</Button></div>:null;
}
