// Offline reference-only extraction. Production never imports Prisma or .migration.
import {createRequire} from 'node:module';
import {referencePath,sourceSHA} from './reference-paths.mjs';
if (sourceSHA !== 'fc4a959e87e7c3750a0546f9d4fa10e31ac3b63c') throw new Error('Schema v2 is frozen; a later source needs a separate snapshot and migration');
import {readFileSync,writeFileSync} from 'node:fs';
const load=createRequire(referencePath+'/package.json');
const models=load('@prisma/client').Prisma.dmmf.datamodel.models;
const schema=JSON.parse(readFileSync('packages/server/src/database/schema-v1.json','utf8'));
const prisma=readFileSync(referencePath+'/prisma/schema.prisma','utf8');
for(const m of models){
 const body=prisma.match(new RegExp('model '+m.name+' \\{([\\s\\S]*?)\\n\\}'))[1];
 const indexes=[...body.matchAll(/@@index\(\[([^\]]+)\]/g)].map(x=>x[1].split(',').map(x=>x.trim()));
 const uniques=m.uniqueFields;
 const out=schema[m.name]??{table:m.name,columns:{},relations:{},indexes:[],uniques:[]};
 const indexed=new Set([...indexes.flat(),...uniques.flat(),...m.fields.filter(f=>f.isId||f.isUnique).map(f=>f.name),...m.fields.flatMap(f=>f.relationFromFields??[])]);
 for(const f of m.fields){
  const existing=out.columns[f.name];
  if(f.kind==='scalar'&&existing&&(existing.type!==f.type||existing.nullable!==!f.isRequired||existing.primary!==f.isId||existing.unique!==f.isUnique)) throw Error('Non-additive source column needs explicit review: '+m.name+'.'+f.name);
  if(f.kind==='scalar'&&!out.columns[f.name]) out.columns[f.name]={type:f.type,nullable:!f.isRequired,primary:f.isId,unique:f.isUnique,updated:f.isUpdatedAt,default:!f.hasDefaultValue?null:typeof f.default==='object'?{kind:f.default.name}:{kind:'literal',value:f.default},indexed:indexed.has(f.name)};
  if(f.kind==='object'&&!out.relations[f.name]){
   const inverse=models.find(x=>x.name===f.type).fields.find(x=>x.kind==='object'&&x.type===m.name&&x.relationName===f.relationName);
   out.relations[f.name]={model:f.type,many:f.isList,nullable:!f.isRequired,tag:body.match(new RegExp('\\b'+f.name+'[^\\n]+@relation\\("([^"]+)"'))?.[1]??null,fields:f.relationFromFields,references:f.relationToFields,onDelete:f.relationOnDelete?.toUpperCase()??(f.isRequired?'RESTRICT':'SET NULL'),...(!f.relationFromFields.length&&inverse?{inverseFields:inverse.relationFromFields,localReferences:inverse.relationToFields}:{})};
  }
 }
 out.indexes=indexes;out.uniques=uniques;schema[m.name]=out;
}
writeFileSync('packages/server/src/database/schema-v2.json',JSON.stringify(schema,null,2)+'\n');
const type=f=>f.type==='String'?'string':f.type==='Boolean'?'boolean':['Int','Float'].includes(f.type)?'number':f.type==='DateTime'?'Date':f.type;
let output='// Scalar/relationship contracts from Website '+sourceSHA.slice(0,7)+'; no source ORM runtime dependency.\nexport interface Models {\n'+models.map(m=>`  ${m.name}: ${m.name};`).join('\n')+'\n}\n';
for(const m of models)output+=`export interface ${m.name} {\n`+m.fields.map(f=>`  ${f.name}: ${type(f)}${f.isList?'[]':f.isRequired?'':' | null'};`).join('\n')+'\n  _count: Record<string, number>;\n}\n';
writeFileSync('packages/server/src/database/models.ts',output);
const old=JSON.parse(readFileSync('packages/server/src/database/schema-v1.json','utf8'));
for(const [name,m]of Object.entries(schema)) console.log(name,old[name]?Object.keys(m.columns).filter(k=>!old[name].columns[k]):'new table');
