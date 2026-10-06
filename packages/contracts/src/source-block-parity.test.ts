import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {blockSchemas,type BlockType} from './blocks.js';
const golden=JSON.parse(readFileSync('tests/fixtures/source-block-contracts.json','utf8')) as {defaults:Record<string,unknown>;cases:Array<{type:BlockType;path:Array<string|number>;value:unknown;mutation:string;valid:boolean;normalizedSHA256?:string}>};
describe('pinned Website property acceptance and normalization',()=>{
 for(const type of Object.keys(blockSchemas) as BlockType[])it(type,()=>{
  const cases=golden.cases.filter(c=>c.type===type);expect(cases.length).toBeGreaterThan(0);
  for(const c of cases){
   const block={id:'parity-'+type,type,props:structuredClone(golden.defaults[type])};
   if(!c.path.length)block.props=c.value;
   else{let object=block.props as Record<string|number,unknown>;for(const key of c.path.slice(0,-1))object=object[key] as Record<string|number,unknown>;object[c.path.at(-1)!]=c.value;}
   const parsed=blockSchemas[type].safeParse(block),label=type+'.'+c.path.join('.')+' '+c.mutation;
   expect(parsed.success,label).toBe(c.valid);
   if(parsed.success)expect(createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex'),label).toBe(c.normalizedSHA256);
  }
 });
});
