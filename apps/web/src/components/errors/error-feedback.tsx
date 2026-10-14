import {useEffect,useMemo,useRef,useState} from 'react';
import {asApiError} from '@/lib/errors/transport';
import {errorCopy,errorMessage} from '@/lib/errors/messages';
import {Button} from '@/components/ui/button';
export function ErrorFeedback({error:input,locale,operation,onRefresh,focusOnError=false}:{error:unknown;focusOnError?:boolean;locale:'ar'|'en';operation?:string;onRefresh?:()=>Promise<unknown>}){
 const [copied,setCopied]=useState(false),[copyFailed,setCopyFailed]=useState(false),[refreshing,setRefreshing]=useState(false);
 const error=useMemo(()=>input?asApiError(input):null,[input]);
 const region=useRef<HTMLElement>(null);
 useEffect(()=>{if(focusOnError&&error&&error.category!=='cancelled'){region.current?.focus({preventScroll:true});region.current?.scrollIntoView({block:'center',behavior:'instant'});}},[error,focusOnError]);
 if(!error)return null;const t=errorCopy[locale];if(error.category==='cancelled')return null;
 const reference=error.errorId??error.requestId??error.localId;
 return <section ref={region} tabIndex={focusOnError?-1:undefined} role="alert" aria-live="polite" className="scroll-mt-24 focus-visible:outline-2 focus-visible:outline-danger space-y-2 rounded-xl border border-danger-border bg-danger-soft p-4 text-sm text-danger-foreground" dir={locale==='ar'?'rtl':'ltr'}>
  <p className="font-semibold">{operation?`${t.failed}: ${operation}`:t.failed}</p><p>{errorMessage(error,locale)}</p>
  <p>{error.uncertain?t.uncertain:error.category==='internal'?t.retry:['network','timeout','invalid_response','conflict'].includes(error.category)?t.review:null}</p>
  {error.retryAfterSec!==undefined?<p>{error.retryAfterSec} {t.seconds}</p>:null}
  {reference?<p className="break-all">{error.localId?t.local:t.reference}: <bdi>{reference}</bdi></p>:null}
  <div className="flex flex-wrap gap-2">
   {reference?<Button size="lg" type="button" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(reference);setCopied(true);setCopyFailed(false);}catch{setCopyFailed(true);}}}>{copied?t.copied:t.copy}</Button>:null}
   {onRefresh?<Button size="lg" type="button" variant="outline" disabled={refreshing} onClick={async()=>{setRefreshing(true);try{await onRefresh();}finally{setRefreshing(false);}}}>{t.reload}</Button>:null}
   {error.category==='authentication'?<a className="inline-flex min-h-11 items-center underline" href={`/${locale}/auth/login`}>{t.signIn}</a>:null}
  </div>{copyFailed?<p role="status">{t.copyFailed}</p>:null}
 </section>;
}
export function FieldError({error:input,name,id,locale}:{error:unknown;name:string;id:string;locale:'ar'|'en'}){
 const error=input?asApiError(input):null,fields=error?.body?.errors;
 return fields&&typeof fields==='object'&&Object.hasOwn(fields,name)?<p id={id} className="text-sm text-danger-foreground">{errorCopy[locale].validation}</p>:null;
}
