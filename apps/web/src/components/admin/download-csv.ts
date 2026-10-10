import {ApiError} from './helpers';
/** Verify the complete bounded response before handing it to the browser. */
export async function downloadCsv(url:string,filename:string):Promise<void> {
 const response=await fetch(url,{cache:'no-store',credentials:'same-origin',redirect:'error'});
 if(!response.ok){
  const data=await response.json().catch(()=>null);
  throw new ApiError(response.status,data?.code??'generic',data);
 }
 if(!response.headers.get('content-type')?.startsWith('text/csv')) throw new ApiError(502,'export_incomplete');
 const blob=await response.blob();
 const length=Number(response.headers.get('content-length'));
 if(!blob.size || blob.size>32*1024*1024 || (length>0 && length!==blob.size)) throw new ApiError(502,'export_incomplete');
 const objectUrl=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=objectUrl;link.download=filename;
 document.body.append(link);link.click();link.remove();
 // The browser may consume the URL asynchronously; no claim that it saved to disk.
 window.setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
}
