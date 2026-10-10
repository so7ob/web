import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
let info={sha:'unavailable',dirty:false};
try {info={sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim()};}catch{/* A source archive may not have Git metadata. */}
for(const app of ['api','worker']){mkdirSync(`apps/${app}/dist`,{recursive:true});writeFileSync(`apps/${app}/dist/build-info.json`,JSON.stringify(info)+'\n');}
