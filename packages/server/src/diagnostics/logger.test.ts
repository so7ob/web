import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {diagnosticEvent,DiagnosticLogger,RotatingDiagnosticFile} from './logger.js';
describe('allowlisted diagnostic events',()=>{
  it('excludes secrets in provider messages, nested causes, SQL and arbitrary fields',()=>{
    const secret='SYNTHETIC_PRIVATE_PASSWORD',cause=Object.assign(new Error(secret),{code:'ER_DUP_ENTRY',sql:'SELECT '+secret,parameters:[secret]});
    const error=new Error('token='+secret,{cause});error.stack='Error: '+secret+'\n at query (/private/'+secret+'/driver.js:1:2)\n at patch (/root/web/packages/server/src/admin/conversations.ts:12:3)';
    const event=diagnosticEvent({code:secret,operation:'update',fields:['password',secret,'status'],requestId:secret},error);
    expect(JSON.stringify(event)).not.toContain(secret);expect(event.reason).toBe('duplicate_key');expect(event.frames).toEqual(['packages/server/src/admin/conversations.ts:12:3']);
    expect(event.fields).toEqual(['password','status']);expect(event.requestId).toBeUndefined();expect(event.code).toBe('internal_error');
  });
  it('keeps the original failure when both persistence and fallback fail, including synchronous throws',async()=>{
    const logger=new DiagnosticLogger({write(){throw new Error('synthetic secret');}},()=>{throw new Error('stderr unavailable');});
    expect(()=>logger.record({code:'internal_error'},new Error('original'))).not.toThrow();await logger.flush();expect(logger.lostPersistenceCount).toBe(1);
  });
  it('uses stable safe fingerprints without user values or trace IDs',()=>{
    const a=diagnosticEvent({operation:'patch.requests',code:'invalid',status:400}),b=diagnosticEvent({operation:'patch.requests',code:'invalid',status:400});
    expect(a.errorId).not.toBe(b.errorId);expect(a.fingerprint).toBe(b.fingerprint);
  });
  it('rotates bounded diagnostic files and excludes raw messages',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'so7ob-diagnostic-'));
    try {const sink=new RotatingDiagnosticFile(directory,'api',1000,2);for(let i=0;i<12;i++)await sink.write(diagnosticEvent({code:'internal_error'},new Error('SYNTHETIC_SECRET')));
      const files=await readdir(directory);expect(files.length).toBeLessThanOrEqual(3);
      for(const file of files){const text=await readFile(join(directory,file),'utf8');expect(text).not.toContain('SYNTHETIC_SECRET');for(const row of text.trim().split('\n'))expect(JSON.parse(row)).toHaveProperty('errorId');}
    }finally{await rm(directory,{recursive:true});}
  });
});
