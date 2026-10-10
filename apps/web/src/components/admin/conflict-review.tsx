import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {apiGet} from './helpers';
import type{Locale}from '@/lib/i18n';
/** Only the current user's configuration draft; never automatically reapplied. */
export function ConflictReview({locale,storageKey,captured,remoteUrl,onReload}:{locale:Locale;storageKey:string;captured:unknown;remoteUrl:string;onReload:()=>Promise<void>}){
 const [draft,setDraft]=useState<string|null>(null),[remote,setRemote]=useState<string|null>(null);
 const ar=locale==='ar';
 useEffect(()=>{try{setDraft(sessionStorage.getItem(storageKey));}catch{/* storage unavailable */}},[storageKey]);
 useEffect(()=>{if(captured===null)return;const text=JSON.stringify(captured,null,2);setDraft(text);try{sessionStorage.setItem(storageKey,text);}catch{/* retain in memory */}},[captured,storageKey]);
 if(!draft)return null;
 return <section role="alert" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
  <p>{ar?'توجد تعديلات أحدث. حُفظت مسودة تعديلاتك هنا؛ راجع النسخة الحالية قبل إعادة الحفظ.':'Newer edits exist. Your draft is preserved here; review the current version before saving again.'}</p>
  <label className="block">{ar?'مسودة تعديلاتك المحفوظة':'Your preserved draft'}<textarea readOnly value={draft} rows={6} className="mt-2 w-full rounded border bg-white p-2 text-sm text-foreground"/></label>
  <div className="flex flex-wrap gap-2">
   <Button variant="outline" onClick={()=>{void apiGet(remoteUrl).then(value=>setRemote(JSON.stringify(value,null,2))).catch(()=>setRemote(ar?'تعذرت قراءة النسخة الحالية':'Unable to read current version'));}}>{ar?'مراجعة النسخة الحالية':'Review current version'}</Button>
   <Button variant="outline" onClick={()=>{void onReload();}}>{ar?'إعادة تحميل مع الاحتفاظ بالمسودة':'Reload and keep draft'}</Button>
   <Button variant="outline" onClick={()=>{setDraft(null);try{sessionStorage.removeItem(storageKey);}catch{/* storage unavailable */}}}>{ar?'إزالة المسودة بعد المراجعة':'Dismiss reviewed draft'}</Button>
  </div>
  {remote&&<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm" tabIndex={0}>{remote}</pre>}
 </section>;
}
