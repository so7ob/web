import {useCallback,useEffect,useRef,useState} from 'react';
import {can,type AuthUser,type DiagnosticList} from '@so7ob/contracts';
import {apiGet,apiSend} from '../helpers';
import {asApiError,ApiError} from '@/lib/errors/transport';
import {ErrorFeedback,FieldError} from '@/components/errors/error-feedback';
import {diagnosticsCopy} from '@/content/diagnostics';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
const filterKeys=['q','from','to','level','component','operation','code'] as const;
export function DiagnosticsClient({locale,me}:{locale:'ar'|'en';me:Pick<AuthUser,'roleKey'|'permissions'>}){
 const t=diagnosticsCopy[locale];
 const [draft,setDraft]=useState<Record<string,string>>({}),[filters,setFilters]=useState<Record<string,string>>({}),[page,setPage]=useState(1);
 const [data,setData]=useState<DiagnosticList|null>(null),[error,setError]=useState<ApiError|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const sequence=useRef(0),mutating=useRef(false);
 const query=new URLSearchParams({...Object.fromEntries(Object.entries(filters).filter(([,v])=>v)),page:String(page)}).toString();
 const load=useCallback(async(signal?:AbortSignal)=>{const seq=++sequence.current;setLoading(true);try{const result=await apiGet<DiagnosticList>('/api/admin/diagnostics?'+query,signal);if(seq===sequence.current&&!signal?.aborted){setData(result);setError(null);}return true;}catch(e){if(!signal?.aborted&&seq===sequence.current)setError(asApiError(e));return false;}finally{if(seq===sequence.current)setLoading(false);}},[query]);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[load]);
 const update=async(fingerprint:string,state:string)=>{if(mutating.current)return;mutating.current=true;setBusy(true);setNotice('');setError(null);try{await apiSend('/api/admin/diagnostics/'+fingerprint,'PATCH',{state});if(!await load())setNotice(t.saved);}catch(e){setError(asApiError(e));}finally{mutating.current=false;setBusy(false);}};
 return <div className="space-y-5">
  <header><h1 className="text-2xl font-semibold text-navy">{t.title}</h1><p className="mt-2 text-sm text-muted-foreground">{t.description}</p></header>
  <form className="grid gap-4 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={event=>{event.preventDefault();setPage(1);setNotice('');setFilters({...draft});}}>
   {filterKeys.map(key=><div key={key} className="space-y-2 text-sm font-medium"><label htmlFor={'diagnostic-'+key}>{t[key]}</label>
    {key==='level'||key==='component'?<select id={'diagnostic-'+key} className="min-h-11 w-full rounded-md border border-input bg-white px-3" value={draft[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value})}>
     <option value="">{t.all}</option>{(key==='level'?['warn','error','fatal']:['API','Web','Worker']).map(v=><option key={v} value={v}>{v==='warn'||v==='error'||v==='fatal'?t[v]:v}</option>)}</select>:
    <Input aria-describedby={error?.body?.errors&&Object.hasOwn(error.body.errors as object,key)?'diagnostic-error-'+key:undefined} aria-invalid={!!error?.body?.errors&&Object.hasOwn(error.body.errors as object,key)} id={'diagnostic-'+key} type={key==='from'||key==='to'?'datetime-local':'text'} value={draft[key]?.replace(/Z$/,'')??''} maxLength={101} dir="ltr" onChange={e=>setDraft({...draft,[key]:e.target.value&&(key==='from'||key==='to')?e.target.value+'Z':e.target.value})}/>}
   <FieldError error={error} name={key} id={'diagnostic-error-'+key} locale={locale}/>
   </div>)}
   <Button size="lg" type="submit" disabled={loading}>{t.search}</Button>
  </form>
  <ErrorFeedback error={error} locale={locale} operation={t.title} onRefresh={()=>load()}/>
  {notice?<p role="status" className="rounded-xl border border-border bg-muted p-3 text-sm">{notice}</p>:null}
  <p className="text-sm text-muted-foreground">{t.retention}</p>
  {data?.processLoss?<p className="text-sm">{t.loss}: {data.processLoss.persistence} / stderr: {data.processLoss.fallback}</p>:null}
  <div className="flex flex-wrap gap-2"><Button size="lg" variant="outline" disabled={loading} onClick={()=>void load()}>{t.refresh}</Button>
   <Button size="lg" variant="outline" disabled={busy||loading||!data} onClick={async()=>{if(mutating.current)return;mutating.current=true;setBusy(true);try{const file=await apiGet<DiagnosticList>('/api/admin/diagnostics/export?'+query);const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='so7ob-diagnostics-page-'+page+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setNotice(t.ready);}catch(e){setError(asApiError(e));}finally{setBusy(false);mutating.current=false;}}}>{t.export}</Button></div>
  <div aria-busy={loading} className="space-y-4">{data?.rows.length===0?<p>{t.empty}</p>:null}{data?.rows.map(row=><article key={row.fingerprint} className="space-y-3 rounded-2xl border border-border bg-white p-4">
   <h2 className="break-all text-base font-semibold"><bdi>{row.event.operation}</bdi> · <bdi>{row.event.code}</bdi></h2>
   <p>{t.component}: {row.event.component} · {t.level}: {t[row.event.level]} · {t.count}: {row.occurrences}</p>
   <p className="break-words text-sm">{t.first}: <bdi>{new Date(row.firstAt).toISOString()}</bdi><br/>{t.last}: <bdi>{new Date(row.lastAt).toISOString()}</bdi></p>
   <p>{t[row.state]}</p><details><summary className="min-h-11 cursor-pointer py-2 underline">{t.details}</summary><pre dir="ltr" className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{JSON.stringify(row.event,null,2)}</pre></details>
   <div className="flex flex-wrap gap-2"><Button size="lg" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(JSON.stringify(row.event,null,2));setNotice(t.copied);}catch(e){setError(asApiError(e));}}}>{t.copy}</Button>
    {can(me,'diagnostics.manage')?<><Button size="lg" variant="outline" disabled={busy||row.state==='reviewing'} onClick={()=>void update(row.fingerprint,'reviewing')}>{t.reviewing}</Button><Button size="lg" variant="outline" disabled={busy||row.state==='resolved'} onClick={()=>void update(row.fingerprint,'resolved')}>{t.resolved}</Button></>:null}
   </div>
  </article>)}</div>
  <nav aria-label={t.page} className="flex flex-wrap items-center gap-3"><Button size="lg" variant="outline" disabled={loading||page===1} onClick={()=>setPage(page-1)}>{t.previous}</Button><p>{t.page} {page} {t.of} {Math.max(1,Math.ceil((data?.total??0)/20))}</p><Button size="lg" variant="outline" disabled={loading||page*20>=(data?.total??0)} onClick={()=>setPage(page+1)}>{t.next}</Button></nav>
 </div>;
}
