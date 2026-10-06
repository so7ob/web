// Rebuild source-derived validation oracles from the verified, isolated dddf8cd snapshot.
import {pathToFileURL} from 'node:url';import{resolve}from'node:path';
import ts from 'typescript';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{createHash}from'node:crypto';
import {largestLegacyDocument} from './max-legacy-document.mjs';
const source='.migration/reference/Website-dddf8cd/src',temp='.migration/source-contracts';
const oracle=JSON.parse(readFileSync('docs/migration/evidence/final-code-parity/block-oracle.json','utf8'));
for(const [path,expected]of Object.entries(oracle.inputs)){if(createHash('sha256').update(readFileSync(source+'/'+path)).digest('hex')!==expected)throw new Error('Pinned source mismatch: '+path);}
mkdirSync(temp,{recursive:true});
for(const [name,path]of [['validation','lib/validation.ts'],['blocks','lib/blocks/types.ts']]){let text=readFileSync(source+'/'+path,'utf8').replaceAll('@/lib/validation','./validation.mjs');writeFileSync(temp+'/'+name+'.mjs',ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
const props=ts.createSourceFile('props.ts',readFileSync(source+'/components/admin/editor/prop-fields.ts','utf8'),ts.ScriptTarget.Latest,true);
let defaults;for(const s of props.statements)if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations)if(d.name.getText(props)==='DEFAULT_PROPS')defaults=d.initializer.getText(props);
writeFileSync(temp+'/defaults.mjs',ts.transpileModule('export const defaults='+defaults,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {blockSchemas,validateBlocks}=await import(pathToFileURL(resolve(temp,'blocks.mjs')).href),{defaults:values}=await import(pathToFileURL(resolve(temp,'defaults.mjs')).href);
const cases=[];const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
for(const [type,schema]of Object.entries(blockSchemas)){
 const base={id:'parity-'+type,type,props:values[type]};
 function paths(obj,p=[]){return Object.entries(obj??{}).flatMap(([key,v])=>{const path=[...p,key];return[{path,value:v},...(v&&typeof v==='object'&&!Array.isArray(v)?paths(v,path):Array.isArray(v)&&v[0]&&typeof v[0]==='object'&&!Array.isArray(v[0])?paths(v[0],[...path,0]):[])]});}
 for(const item of [{path:[],value:base.props},...paths(base.props)])for(const [name,value]of [['original',item.value],['null',null],['number',17],['boolean',true],['object',{}],['array',[]],['text','نص UTF-8'],['url','javascript:alert(1)'],['long','x'.repeat(4001)],['many',Array(161).fill(typeof item.value?.[0]==='string'?'x':item.value?.[0]??{})]]){
  const changed=structuredClone(base);let object=changed.props;
  if(item.path.length){for(const key of item.path.slice(0,-1))object=object[key];object[item.path.at(-1)]=value;}else changed.props=value;
  const parsed=schema.safeParse(changed);
  cases.push({type,path:item.path,mutation:name,value,valid:parsed.success,...(parsed.success?{normalizedSHA256:hash(parsed.data)}:{})});
 }
}
mkdirSync('tests/fixtures',{recursive:true});writeFileSync('tests/fixtures/source-block-contracts.json',JSON.stringify({sourceSHA:'dddf8cd00a19cf7d562f503549f4c000109057d1',defaults:values,cases})+'\n');console.log({cases:cases.length,bytes:readFileSync('tests/fixtures/source-block-contracts.json').length});
const maximum=largestLegacyDocument(blockSchemas),raw=JSON.stringify(maximum.blocks),validated=validateBlocks(raw);
if(!validated.ok||JSON.stringify(validated.blocks)!==raw)throw new Error('Source rejected or normalized the maximum document');
writeFileSync('docs/migration/evidence/final-code-parity/legacy-size-ranking.json',JSON.stringify({sourceSHA:'dddf8cd00a19cf7d562f503549f4c000109057d1',bytes:Buffer.byteLength(raw),valid:true,ranking:maximum.ranking},null,2)+'\n');
