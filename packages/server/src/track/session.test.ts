import {afterEach,expect,it} from 'vitest';
import {createTrackSessionValue,verifyTrackSessionValue,hashTrackToken,generateTrackToken} from './session.js';
const original=process.env.AUTH_SECRET;
afterEach(()=>{if(original===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=original;});
it('binds a signed capability to its generation and expires at the earlier of link expiry and twelve hours',()=>{
 process.env.AUTH_SECRET='Synthetic-session-signing-only';const now=1700000000000,generation=hashTrackToken(generateTrackToken());
 const value=createTrackSessionValue('link',generation,new Date(now+60000),now);
 expect(verifyTrackSessionValue(value,now)).toEqual({lid:'link',generation,exp:(now+60000)/1000});
 expect(verifyTrackSessionValue(value,now+60000)).toBeNull();
 const long=createTrackSessionValue('link',generation,new Date(now+86400000),now);
 expect(verifyTrackSessionValue(long,now+43200000)).toBeNull();
 expect(verifyTrackSessionValue(long,now+43199000)).not.toBeNull();
});
it('rejects tampering, oversized input, extra segments and missing signing configuration',()=>{
 process.env.AUTH_SECRET='Synthetic-session-signing-only';const now=Date.now();const value=createTrackSessionValue('link',hashTrackToken('token'),new Date(now+60000),now);
 const [body,sig]=value.split('.');const changed=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(body,'base64url').toString()),lid:'other'})).toString('base64url');
 for(const invalid of [changed+'.'+sig,value+'.extra','x'.repeat(1025),null,'bad'])expect(verifyTrackSessionValue(invalid,now)).toBeNull();
 delete process.env.AUTH_SECRET;expect(verifyTrackSessionValue(value,now)).toBeNull();expect(()=>createTrackSessionValue('link',hashTrackToken('token'),new Date(now+60000))).toThrow('TRACK_SIGNING_SECRET_MISSING');
});
