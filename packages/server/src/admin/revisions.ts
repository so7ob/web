import type{DataSource,QueryRunner}from'typeorm';
import{AuthFault}from'../auth/persistence.js';
export async function snapshot<T>(db:DataSource,work:(r:QueryRunner)=>Promise<T>):Promise<T>{
 const r=db.createQueryRunner();await r.connect();await r.startTransaction('REPEATABLE READ');
 try{const value=await work(r);await r.commitTransaction();return value;}catch(error){await r.rollbackTransaction();throw error;}finally{await r.release();}
}
export async function revisions(r:QueryRunner):Promise<Record<string,string>>{
 const rows:Array<{scope:string;revision:string|number}>=await r.query('SELECT scope,revision FROM AdminRevision');
 return Object.fromEntries(rows.map(row=>[row.scope,String(row.revision)]));
}
export async function advance(r:QueryRunner,scope:string,base:unknown,checked:boolean):Promise<void>{
 if(checked && (typeof base!=='string'|| !/^(0|[1-9][0-9]{0,18})$/.test(base)))throw new AuthFault(400,'revision_required');
 await r.query('INSERT INTO AdminRevision(scope,revision) VALUES(?,0) ON DUPLICATE KEY UPDATE scope=scope',[scope]);
 const result=await r.query('UPDATE AdminRevision SET revision=revision+1 WHERE scope=?'+(checked?' AND revision=?':''),checked?[scope,base]:[scope]);
 if(result.affectedRows!==1)throw new AuthFault(409,'conflict',{scope});
}
