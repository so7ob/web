// Synthetic-only benchmark. Run after build:server with a dedicated empty *_test database.
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createDataSource } from '../../packages/server/dist/database/data-source.js';
import { AdminConversationService } from '../../packages/server/dist/admin/conversations.js';
import { SYSTEM_ROLES } from '../../packages/contracts/dist/index.js';
if (!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME??'') || !['127.0.0.1','localhost'].includes(process.env.DATABASE_HOST??'')) throw Error('Dedicated loopback synthetic test database required');
const db=await createDataSource().initialize();
const prefix='bench'+randomBytes(6).toString('hex');
const actor={id:prefix,name:'Synthetic benchmark',email:prefix+'@example.invalid',roleKey:'super_admin',status:'active',locale:'en',emailVerified:true,permissions:SYSTEM_ROLES.find(r=>r.key==='super_admin').permissions};
const service=new AdminConversationService(db);
const result={sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,mariaDB:null,parentsPerKind:20,messagesPerParent:1000,samples:[]};
try {
 await db.runMigrations();result.mariaDB=(await db.query('SELECT VERSION() v'))[0].v;
 for (const table of ['Inquiry','ProjectRequest']) if(Number((await db.query(`SELECT COUNT(*) n FROM ${table}`))[0].n)) throw Error('Benchmark requires empty parent tables');
 for(let i=0;i<20;i++){
  const id=prefix+i;
  await db.query("INSERT INTO Inquiry(id,refCode,subject,name,email,category,locale) VALUES(?,?,?,'Synthetic','benchmark@example.invalid','general','en')",[id,id,prefix]);
  await db.query("INSERT INTO ProjectRequest(id,refCode,requestType,serviceType,description,descriptionHash,budget,timeline,name,email,preferredContact,locale) VALUES(?,?,'quote','web',?,'synthetic','unspecified','flexible','Synthetic','benchmark@example.invalid','email','en')",[id,id,prefix]);
  for(const [table,fk] of [['InquiryMessage','inquiryId'],['RequestMessage','requestId']]){
   for(let offset=0;offset<1000;offset+=250){
    const values=[];for(let j=offset;j<offset+250;j++)values.push(id+'m'+String(j).padStart(4,'0'),id,j%2?'staff':'client','x'.repeat(1024),new Date(Date.UTC(2026,0,1,0,0,j)));
    await db.query(`INSERT INTO ${table}(id,${fk},authorType,body,createdAt) VALUES ${Array(250).fill('(?,?,?,?,?)').join(',')}`,values);
   }
  }
 }
 const original=db.query.bind(db);
 for(const kind of ['requests','inquiries']){
  await service.list(actor,kind,{q:prefix}); // warm connection/query caches
  for(let sample=0;sample<5;sample++){
   global.gc?.();let messageRows=0;
   db.query=async(...args)=>{const rows=await original(...args);if(/^SELECT/.test(args[0])&&/parentId/.test(args[0]))messageRows+=rows.length;return rows;};
   const heap=process.memoryUsage().heapUsed,start=performance.now();
   const list=await service.list(actor,kind,{q:prefix});
   result.samples.push({kind,sample,milliseconds:Number((performance.now()-start).toFixed(2)),messageRows,heapDeltaBytes:process.memoryUsage().heapUsed-heap,returnedParents:list[kind].length,total:list.total,countsCorrect:list[kind].every(r=>r.messageCount===1000)});
   db.query=original;
  }
 }
 result.peakRssKiB=process.resourceUsage().maxRSS;
 console.log(JSON.stringify(result,null,2));
} finally {
 await db.query('DELETE FROM Inquiry WHERE id LIKE ?',[prefix+'%']);
 await db.query('DELETE FROM ProjectRequest WHERE id LIKE ?',[prefix+'%']);
 await db.destroy();
}
