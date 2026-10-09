import type {QueryRunner} from 'typeorm';
import {extractMediaRefs,textReferencesMedia,type MediaUsageLocation} from '@so7ob/contracts';
import {AuthFault} from '../auth/persistence.js';
type PageUsage={id:string;titleAr:string;titleEn:string;status:string;ogMediaId:string|null;draftSettings:string|null;publishedSettings:string|null;draftBlocksAr:string|null;draftBlocksEn:string|null;publishedBlocksAr:string|null;publishedBlocksEn:string|null};
type TemplateUsage={id:string;nameAr:string;nameEn:string;blocksAr:string|null;blocksEn:string|null};
function og(raw:string|null):string|null{try{const value=JSON.parse(raw??'null');return typeof value?.ogMediaId==='string'?value.ogMediaId:null;}catch{return null;}}
/** Called inside the same cms-pages lock held by CMS/template writers and media deletion. */
export async function mediaUsageIndex(r:QueryRunner){
 const pages:PageUsage[]=await r.query('SELECT id,titleAr,titleEn,status,ogMediaId,draftSettings,publishedSettings,draftBlocksAr,draftBlocksEn,publishedBlocksAr,publishedBlocksEn FROM Page');
 const templates:TemplateUsage[]=await r.query('SELECT id,nameAr,nameEn,blocksAr,blocksEn FROM PageTemplate');
 const index=new Map<string,MediaUsageLocation[]>();const add=(id:string,place:MediaUsageLocation)=>{const list=index.get(id)??[];list.push(place);index.set(id,list);};
 for(const p of pages){
  const base={entityId:p.id,titleAr:p.titleAr,titleEn:p.titleEn,archived:p.status==='archived'};
  const ogs=new Set([p.ogMediaId,og(p.draftSettings),og(p.publishedSettings)].filter((x):x is string=>!!x));
  for(const id of ogs)add(id,{...base,kind:'page_og',locale:null,state:null});
  for(const [field,locale,state]of [['publishedBlocksAr','ar','published'],['publishedBlocksEn','en','published'],['draftBlocksAr','ar','draft'],['draftBlocksEn','en','draft']] as const)
   for(const id of extractMediaRefs(p[field]))add(id,{...base,kind:state==='published'?'page_published':'page_draft',locale,state});
 }
 for(const p of templates)for(const [field,locale]of [['blocksAr','ar'],['blocksEn','en']]as const)for(const id of extractMediaRefs(p[field]))add(id,{entityId:p.id,titleAr:p.nameAr,titleEn:p.nameEn,kind:'template',locale,state:null});
 return index;
}
/** Reject a newly saved local media reference if deletion won the shared CMS lock first. */
export async function assertMediaReferences(r:QueryRunner,data:Record<string,unknown>){
 const ids=new Set<string>();
 for(const [key,value]of Object.entries(data)){
  if(typeof value!=='string')continue;
  if(/blocks/i.test(key))for(const id of extractMediaRefs(value))ids.add(id);
  if(key==='ogMediaId'&&value)ids.add(value);
  if(key==='draftSettings'||key==='publishedSettings'){const id=og(value);if(id)ids.add(id);}
 }
 if(!ids.size)return;const all=[...ids],found=new Set<string>();
 for(let i=0;i<all.length;i+=500){const part=all.slice(i,i+500);for(const row of await r.query('SELECT id FROM MediaItem WHERE id IN ('+part.map(()=>'?').join(',')+')',part))found.add(row.id);}
 const missing=all.filter(id=>!found.has(id));if(missing.length)throw new AuthFault(409,'media_not_found',{mediaIds:missing.slice(0,50)});
}
export {textReferencesMedia};
