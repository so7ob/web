import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {SYSTEM_ROLES,type AuthUser} from '@so7ob/contracts';
import {createDataSource} from '../database/data-source.js';
import {FileService} from './service.js';
import {PagePublicationService} from '../admin/publication.js';
import {PageTemplateService} from '../admin/templates.js';
import {lockOperation} from '../business/persistence.js';
const name=process.env.TEST_DATABASE_NAME;if(!name||!/^so7ob_[a-z0-9_]+_test$/.test(name))throw new Error('Real isolated MariaDB required');
const db=createDataSource({...process.env,DATABASE_NAME:name}),prefix='media'+randomBytes(6).toString('hex'),svc=new FileService(db),pages=new PagePublicationService(db),templates=new PageTemplateService(db);let serial=0,createdRole=false;
const actor:AuthUser={id:prefix,email:prefix+'@example.invalid',name:'Synthetic media editor',roleKey:'super_admin',status:'active',locale:'en',emailVerified:true,permissions:SYSTEM_ROLES.find(r=>r.key==='super_admin')!.permissions};
async function media(){const id=prefix+String(++serial);await db.query("INSERT INTO MediaItem(id,filename,storedName,mimeType,size,uploadedById,folder) VALUES(?,?,?,'image/png',1,?,'general')",[id,'synthetic-'+id+'.png',id+'.png',actor.id]);return id;}
async function page(){const id=prefix+'page'+(++serial);await db.query("INSERT INTO Page(id,slug,titleAr,titleEn,status) VALUES(?,?,?,?,'draft')",[id,id,'صفحة اصطناعية','Synthetic page']);return id;}
const blocks=(id:string)=>JSON.stringify([{id:'image',type:'image',props:{src:'/api/media/'+id,alt:'Synthetic image'}}]);
beforeAll(async()=>{await db.initialize();await db.runMigrations();const role=SYSTEM_ROLES.find(r=>r.key==='super_admin')!;createdRole=!(await db.query('SELECT `key` FROM Role WHERE `key`=?',[role.key])).length;if(createdRole)await db.query('INSERT INTO Role(`key`,nameAr,nameEn,permissions) VALUES(?,?,?,?)',[role.key,role.nameAr,role.nameEn,JSON.stringify(role.permissions)]);await db.query("INSERT INTO User(id,email,name,passwordHash,roleKey,status) VALUES(?,?,?,'synthetic','super_admin','active')",[actor.id,actor.email,actor.name]);});
afterAll(async()=>{if(!db.isInitialized)return;await db.query('DELETE FROM PageVersion WHERE pageId LIKE ?',[prefix+'%']);await db.query('DELETE FROM Page WHERE id LIKE ?',[prefix+'%']);await db.query('DELETE FROM PageTemplate WHERE createdById=?',[actor.id]);await db.query('DELETE FROM MediaItem WHERE uploadedById=?',[actor.id]);await db.query('DELETE FROM FileCleanupJob WHERE storedName LIKE ?',[prefix+'%']);await db.query('DELETE FROM AuditLog WHERE actorId=?',[actor.id]);await db.query('DELETE FROM User WHERE id=?',[actor.id]);if(createdRole)await db.query("DELETE FROM Role WHERE `key`='super_admin'");await db.destroy();});
it('counts uses by document, includes archived drafts/templates and both settings snapshots, and persists blocked-deletion audit',async()=>{
 const id=await media(),p=await page();await db.query("UPDATE Page SET status='archived',draftBlocksAr=?,publishedBlocksEn=?,draftSettings=?,publishedSettings=? WHERE id=?",[blocks(id),blocks(id),JSON.stringify({ogMediaId:id}),JSON.stringify({ogMediaId:id}),p]);
 const result=await svc.listMedia(actor,'1',{search:id});expect(result.media).toHaveLength(1);expect(result.media[0].usageCount).toBe(3);
 await expect(svc.deleteMedia(actor,id)).rejects.toMatchObject({status:409,code:'media_in_use',extra:{usage:expect.arrayContaining([expect.objectContaining({kind:'page_og',archived:true})])}});
 expect(await db.query("SELECT id FROM AuditLog WHERE entityId=? AND action='media.delete_blocked'",[id])).toHaveLength(1);expect(await db.query('SELECT id FROM FileCleanupJob WHERE storedName=?',[id+'.png'])).toHaveLength(0);
 await db.query("UPDATE Page SET draftBlocksAr='[]',publishedBlocksEn=NULL,draftSettings='{}',publishedSettings='{}' WHERE id=?",[p]);
 const template=await templates.create(actor,{nameAr:'قالب',nameEn:'Synthetic template',blocksAr:blocks(id),blocksEn:'[]'});await expect(svc.deleteMedia(actor,id)).rejects.toMatchObject({code:'media_in_use'});await templates.remove(actor,template.template.id);expect(await svc.deleteMedia(actor,id)).toMatchObject({ok:true});
 expect(await db.query('SELECT id FROM FileCleanupJob WHERE storedName=?',[id+'.png'])).toHaveLength(1);
});
it('filters folders, usage and filename/title/alt text while preserving the global unused count and private field projection',async()=>{
 const a=await media(),b=await media(),p=await page();await svc.updateMedia(actor,a,{folder:' الحملات ',altText:'Find this Arabic صورة',title:'Campaign'});await db.query('UPDATE Page SET draftBlocksEn=? WHERE id=?',[blocks(a),p]);
 expect((await svc.listMedia(actor,'1',{folder:'الحملات',search:'صورة',usage:'in_use'})).media.map(m=>m.id)).toEqual([a]);expect((await svc.listMedia(actor,'1',{folder:'الحملات',usage:'unused'})).media).toEqual([]);
 const unused=await svc.listMedia(actor,'1',{search:b,usage:'unused'});expect(unused.media.map(m=>m.id)).toEqual([b]);expect(unused.unusedTotal).toBeGreaterThanOrEqual(1);expect(unused.media[0]).not.toHaveProperty('storedName');expect(unused.folders).toContain('الحملات');
 await expect(svc.updateMedia(actor,a,{folder:'x'.repeat(61)})).rejects.toMatchObject({code:'invalid_folder'});await expect(svc.deleteMedia({...actor,roleKey:'client',permissions:[]},b)).rejects.toMatchObject({status:403});
});
it('a committed page reference blocks a deletion waiting on the CMS lock',async()=>{
 const id=await media(),p=await page(),r=db.createQueryRunner();await r.connect();await r.startTransaction('READ COMMITTED');let pending:Promise<unknown>|undefined;
 try{await lockOperation(r,'cms-pages');await r.query('UPDATE Page SET draftBlocksAr=? WHERE id=?',[blocks(id),p]);let done=false;pending=svc.deleteMedia(actor,id).finally(()=>{done=true;});await new Promise(resolve=>setTimeout(resolve,30));expect(done).toBe(false);await r.commitTransaction();await expect(pending).rejects.toMatchObject({code:'media_in_use'});expect(await db.query('SELECT id FROM MediaItem WHERE id=?',[id])).toHaveLength(1);}finally{if(r.isTransactionActive)await r.rollbackTransaction();await pending?.catch(()=>{});await r.release();}
});
it('rejects a save or template creation after deletion wins, including v1 aliases',async()=>{
 const id=await media(),p=await page();await svc.deleteMedia(actor,id);
 await expect(pages.save(actor,p,{baseRevision:0,draftBlocksAr:blocks(id).replace('/api/media/','/api/v1/media/')})).rejects.toMatchObject({code:'media_not_found'});
 expect((await db.query('SELECT draftRevision FROM Page WHERE id=?',[p]))[0].draftRevision).toBe(0);
 await expect(templates.create(actor,{nameAr:'مرفوض',nameEn:'Denied template',blocksAr:blocks(id),blocksEn:'[]'})).rejects.toMatchObject({code:'media_not_found'});
});

it('keeps list SELECT count constant as media and referring pages grow',async()=>{
 const original=db.logger.logQuery;let selects=0;
 db.logger.logQuery=function(query,parameters,runner){if(/^SELECT\b/i.test(query))selects++;return original.call(this,query,parameters,runner);};
 try{
  const small=await svc.listMedia(actor,'1',{search:prefix});const initial=selects;
  for(let i=0;i<30;i++){const id=await media(),p=await page();await db.query('UPDATE Page SET draftBlocksAr=? WHERE id=?',[blocks(id),p]);}
  selects=0;const large=await svc.listMedia(actor,'1',{search:prefix});
  expect(large.total-small.total).toBe(30);expect(selects).toBe(initial);expect(selects).toBeGreaterThan(0);
 }finally{db.logger.logQuery=original;}
});

it('retains historical versions but rejects restoring deleted media without changing the draft or backups',async()=>{
 const id=await media(),p=await page();
 await pages.save(actor,p,{baseRevision:0,draftBlocksAr:blocks(id)});
 await pages.publish(actor,p,{baseRevision:1,locales:['ar']});
 const replacement=JSON.stringify({schemaVersion:1,blocks:[{id:'heading',type:'heading',props:{text:'Image removed'}}]});
 await pages.save(actor,p,{baseRevision:1,draftBlocksAr:replacement});
 await pages.publish(actor,p,{baseRevision:2,locales:['ar']});
 await svc.deleteMedia(actor,id);
 const before=await db.query('SELECT id,version,blocks FROM PageVersion WHERE pageId=? ORDER BY id',[p]);expect(before.some((v:{blocks:string})=>v.blocks.includes(id))).toBe(true);
 const draftBefore=await db.query('SELECT draftRevision,draftBlocksAr FROM Page WHERE id=?',[p]);
 await expect(pages.restore(actor,p,'1',{baseRevision:2,locale:'ar'})).rejects.toMatchObject({code:'media_not_found'});
 expect(await db.query('SELECT id,version,blocks FROM PageVersion WHERE pageId=? ORDER BY id',[p])).toEqual(before);
 expect(await db.query('SELECT draftRevision,draftBlocksAr FROM Page WHERE id=?',[p])).toEqual(draftBefore);
});
