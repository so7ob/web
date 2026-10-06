// Construct the largest normalized legacy block for every finite schema branch.
// JSON string encoding costs at most six bytes per UTF-16 code unit; control
// characters attain that bound. Anchor IDs use their ASCII regex bound instead.
export function maximumValue(schema, path=''){
 const d=schema._def;
 if(['optional','default','nullable'].includes(d.type))return maximumValue(schema.unwrap(),path);
 if(d.type==='object')return Object.fromEntries(Object.entries(schema.shape).map(([k,v])=>[k,maximumValue(v,path+'.'+k)]));
 if(d.type==='array'){
  const max=d.checks?.map(c=>c._zod.def).find(c=>c.check==='max_length')?.maximum;
  if(!Number.isInteger(max))throw new Error('Unbounded array '+path);
  return Array.from({length:max},()=>maximumValue(d.element,path+'[]'));
 }
 if(d.type==='union')return d.options.map(s=>maximumValue(s,path)).sort((a,b)=>Buffer.byteLength(JSON.stringify(b))-Buffer.byteLength(JSON.stringify(a)))[0];
 if(d.type==='enum')return Object.values(d.entries).sort((a,b)=>JSON.stringify(b).length-JSON.stringify(a).length)[0];
 if(d.type==='literal')return [...d.values].sort((a,b)=>JSON.stringify(b).length-JSON.stringify(a).length)[0];
 if(d.type==='boolean')return false;
 if(d.type==='number'){
  if(!schema.isInt||!Number.isFinite(schema.minValue)||!Number.isFinite(schema.maxValue))throw new Error('Unbounded or noninteger number '+path);
  return [schema.minValue,schema.maxValue].sort((a,b)=>JSON.stringify(b).length-JSON.stringify(a).length)[0];
 }
 if(d.type==='string'){
  if(path.endsWith('.anchorId'))return 'a'.repeat(61);
  const max=schema.maxLength;if(!Number.isInteger(max))throw new Error('Unbounded string '+path);
  const candidate='\u0001'.repeat(max);
  if(schema.safeParse(candidate).success)return candidate;
  const url='/'+candidate.slice(1);if(schema.safeParse(url).success)return url;
  throw new Error('Unsupported constrained string '+path);
 }
 throw new Error('Unproven schema bound '+d.type+' '+path);
}
export function largestLegacyDocument(schemas){
 const ranked=Object.entries(schemas).map(([type,schema])=>{const block=maximumValue(schema);const normalized=schema.parse(block);return{type,block:normalized,bytes:Buffer.byteLength(JSON.stringify(normalized))};}).sort((a,b)=>b.bytes-a.bytes);
 const winner=ranked[0];
 const controls=Array.from({length:32},(_,i)=>String.fromCharCode(i)).filter(c=>JSON.stringify(c).length===8);
 const blocks=Array.from({length:60},(_,i)=>({...winner.block,id:'\u0001'.repeat(58)+controls[Math.floor(i/controls.length)]+controls[i%controls.length]}));
 // Every ID stays 60 UTF-16 units with a six-byte JSON escape for each unit.
 return{blocks,ranking:ranked.map(({type,bytes})=>({type,bytes})),largestType:winner.type};
}
