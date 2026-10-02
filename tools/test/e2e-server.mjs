// Test-only TLS proxy for real Secure/__Host- cookie behavior. Never a production service.
import https from 'node:https';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const origin=new URL(process.env.E2E_BASE_URL ?? 'https://127.0.0.1:3198');
if (origin.protocol!=='https:' || origin.hostname!=='127.0.0.1' || !/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME ?? '')) throw new Error('TLS fixture requires loopback and an isolated test database');
const directory=resolve('.migration/e2e/tls'); mkdirSync(directory,{recursive:true,mode:0o700});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout',directory+'/key.pem','-out',directory+'/cert.pem'],{stdio:'ignore'});
const api=spawn(process.execPath,['apps/api/dist/main.js'],{env:{...process.env,PORT:'3197',BIND_HOST:'127.0.0.1',TRUST_PROXY_HOPS:'1',SITE_URL:origin.origin,WEB_ORIGIN:origin.origin},stdio:['ignore','inherit','inherit']});
const server=https.createServer({key:readFileSync(directory+'/key.pem'),cert:readFileSync(directory+'/cert.pem')},(req,res)=>{
  const upstream=http.request({host:'127.0.0.1',port:3197,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-proto':'https','x-forwarded-for':'127.0.0.1'}},response=>{res.writeHead(response.statusCode ?? 502,response.headers);response.pipe(res);});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('Starting isolated test server');}); req.pipe(upstream);
});
server.listen(Number(origin.port),'127.0.0.1');
function stop() { api.kill('SIGTERM'); server.close(()=>process.exit(0)); setTimeout(()=>{api.kill('SIGKILL');process.exit(1);},5000).unref(); }
process.once('SIGTERM',stop);process.once('SIGINT',stop);api.once('exit',code=>{if(code)process.exitCode=code;server.close();});
