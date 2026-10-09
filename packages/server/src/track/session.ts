import {createHmac,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
export const TRACK_COOKIE_NAME='so7ob_track';
export const TRACK_SESSION_TTL_SEC=12*60*60;
export interface TrackCapability {lid:string;generation:string;exp:number}
const secret=()=>{if(!process.env.AUTH_SECRET)throw new Error('TRACK_SIGNING_SECRET_MISSING');return process.env.AUTH_SECRET;};
const signature=(body:string)=>createHmac('sha256',secret()).update('so7ob-track-v1:'+body).digest('base64url');
export const generateTrackToken=()=>randomBytes(32).toString('base64url');
export const hashTrackToken=(raw:string)=>createHash('sha256').update(raw,'utf8').digest('hex');
export function createTrackSessionValue(lid:string,generation:string,linkExpiresAt:Date,now=Date.now()){
 const exp=Math.min(Math.floor(linkExpiresAt.getTime()/1000),Math.floor(now/1000)+TRACK_SESSION_TTL_SEC);
 const body=Buffer.from(JSON.stringify({lid,generation,exp})).toString('base64url');return body+'.'+signature(body);
}
export function verifyTrackSessionValue(value:string|undefined|null,now=Date.now()):TrackCapability|null{
 if(!value||value.length>1024)return null;
 const [body,sig,extra]=value.split('.');if(!body||!sig||extra!==undefined)return null;
 try{
  const expected=signature(body);if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
  const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as TrackCapability;
  if(typeof p.lid!=='string'||!p.lid||p.lid.length>64||typeof p.generation!=='string'||!/^[a-f0-9]{64}$/.test(p.generation)||!Number.isInteger(p.exp)||p.exp*1000<=now)return null;
  return {lid:p.lid,generation:p.generation,exp:p.exp};
 }catch{return null;}
}
