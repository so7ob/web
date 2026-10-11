import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomBytes} from 'node:crypto';
import {createDataSource} from '../database/data-source.js';
import {DiagnosticLogger,diagnosticEvent} from './logger.js';
import {DiagnosticStore} from './store.js';
import {DiagnosticAdministration} from './admin.js';
import {transaction,audit} from '../auth/persistence.js';
import type {AuthUser} from '@so7ob/contracts';
const name=process.env.TEST_DATABASE_NAME;
if(!name||!/^so7ob_[a-z0-9_]+_test$/.test(name))throw new Error('Isolated TEST_DATABASE_NAME required');
const db=createDataSource({...process.env,DATABASE_NAME:name}),prefix='diag'+randomBytes(5).toString('hex');
const actor:AuthUser={id:prefix,email:prefix+'@example.invalid',name:'Synthetic',roleKey:'super_admin',status:'active',locale:'ar',emailVerified:true,permissions:[]};
const store=new DiagnosticStore(db),admin=new DiagnosticAdministration(db),ids:string[]=[],prints:string[]=[];
beforeAll(async()=>{await db.initialize();await db.runMigrations();await db.query('INSERT INTO Role(`key`,nameAr,nameEn) VALUES(?,?,?)',[prefix,'اصطناعي','Synthetic']);await db.query('INSERT INTO User(id,email,passwordHash,name,roleKey) VALUES(?,?,?,?,?)',[prefix,actor.email,'synthetic','Synthetic',prefix]);});
afterAll(async()=>{for(const id of ids)await db.query('DELETE FROM DiagnosticEvent WHERE errorId=?',[id]);for(const id of prints)await db.query('DELETE FROM DiagnosticReview WHERE fingerprint=?',[id]);await db.query('DELETE FROM AuditLog WHERE actorId=?',[prefix]);await db.query('DELETE FROM User WHERE id=?',[prefix]);await db.query('DELETE FROM Role WHERE `key`=?',[prefix]);await db.destroy();});
it('persists sanitized diagnostics after business rollback, with exact correlation and independent fallback',async()=>{
 const logger=new DiagnosticLogger(store,()=>{}),event=diagnosticEvent({operation:prefix,code:'internal_error'});ids.push(event.errorId);prints.push(event.fingerprint);
 await expect(transaction(db,async r=>{await audit(r,'user.updated',actor,null,'user',actor.id);logger.record(event,new Error('SYNTHETIC_SECRET_SQL'));await logger.flush();throw new Error('rollback');})).rejects.toThrow('rollback');
 expect((await db.query('SELECT id FROM AuditLog WHERE actorId=?',[prefix]))).toHaveLength(0);
 const [row]=await db.query('SELECT payload FROM DiagnosticEvent WHERE errorId=?',[event.errorId]);expect(row).toBeTruthy();expect(row.payload).not.toContain('SYNTHETIC_SECRET_SQL');
 const fallback:string[]=[];const down=createDataSource({...process.env,DATABASE_NAME:name});const degraded=new DiagnosticLogger(new DiagnosticStore(down),line=>fallback.push(line));degraded.record({operation:prefix},new Error('SYNTHETIC_SECRET_SQL'));await degraded.flush();expect(degraded.lostPersistenceCount).toBe(1);expect(fallback.join('')).not.toContain('SYNTHETIC_SECRET_SQL');
});
it('bounds pages, groups retained occurrences, validates filters and protects classification',async()=>{
 const event=diagnosticEvent({operation:prefix+'.group',component:'Worker',level:'error',code:'internal_error'});
 await Promise.all(Array.from({length:3},async()=>{const e=diagnosticEvent({...event,errorId:undefined});ids.push(e.errorId);await store.write(e);}));prints.push(event.fingerprint);
 const filtered=await admin.list(actor,{operation:event.operation,component:'Worker'});expect(filtered.total).toBe(1);expect(filtered.rows[0].occurrences).toBe(3);expect(filtered.rows[0].event.code).toBe('internal_error');
 const reader={...actor,roleKey:'custom',permissions:['diagnostics.view'] as AuthUser['permissions']};
 await expect(admin.review(reader,event.fingerprint,'resolved')).rejects.toMatchObject({status:403});
 await expect(admin.list({...reader,permissions:[]},{q:'bad'})).rejects.toMatchObject({status:403});
 await expect(admin.list(actor,{q:'SYNTHETIC_SECRET'})).rejects.toMatchObject({status:400});
 await Promise.all([admin.review(actor,event.fingerprint,'resolved'),admin.review(actor,event.fingerprint,'reviewing')]);
 expect((await db.query('SELECT action FROM AuditLog WHERE actorId=?',[prefix]))).toHaveLength(2);
 for(let i=0;i<22;i++){const e=diagnosticEvent({operation:prefix+'.page'+i,code:'invalid'});ids.push(e.errorId);prints.push(e.fingerprint);await store.write(e);}
 expect((await admin.list(actor,{})).rows.length).toBeLessThanOrEqual(20);
 const result=await admin.list(actor,{q:ids.at(-1)});expect(result.total).toBe(1);expect(result.rows[0].event.errorId).toBe(ids.at(-1));
 // Retention removes diagnostics only, never audit history.
 await db.query('UPDATE DiagnosticEvent SET occurredAt=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 31 DAY) WHERE errorId=?',[ids.at(-1)]);await store.prune();expect((await admin.list(actor,{q:ids.at(-1)})).total).toBe(0);expect((await db.query('SELECT id FROM AuditLog WHERE actorId=?',[prefix]))).toHaveLength(2);
});
