import { describe, it, expect } from 'vitest';
import { validateContent } from './validate.js';
import { MAX_CONTENT_BYTES } from './tree.js';
function document(bytes: number, defaults = true) {
  const doc = { schemaVersion: 1, blocks: Array.from({length:2},(_,i)=>({id:'t'+i,type:'text',props:{paragraphs:Array<string>(20).fill(''),...(defaults?{align:'start',size:'base'}:{})}})) };
  let remaining = bytes - new TextEncoder().encode(JSON.stringify(doc)).byteLength;
  for (const block of doc.blocks) for (let i=0;i<20;i++) {
    const count=Math.min(5000,Math.floor(remaining/2));block.props.paragraphs[i]='ع'.repeat(count);remaining-=2*count;
    if(remaining===1&&count<5000){block.props.paragraphs[i]+='a';remaining--;}
  }
  expect(remaining).toBe(0);return JSON.stringify(doc);
}
describe('CMS byte boundary is stable through normalization and reload',()=>{
  it('accepts the exact UTF-8 maximum and can read its own canonical output',()=>{
    const raw=document(MAX_CONTENT_BYTES);expect(new TextEncoder().encode(raw).byteLength).toBe(MAX_CONTENT_BYTES);
    const saved=validateContent(raw);expect(saved.ok).toBe(true);if(!saved.ok)throw Error(saved.error);
    expect(saved.json).toBe(raw);expect(validateContent(saved.json).ok).toBe(true);
  });
  it('rejects one extra UTF-8 byte',()=>{
    expect(validateContent(document(MAX_CONTENT_BYTES+1))).toEqual({ok:false,error:'content_too_large'});
  });
  it('rejects default expansion that would save a document its own reader rejects',()=>{
    expect(validateContent(document(MAX_CONTENT_BYTES,false))).toEqual({ok:false,error:'content_too_large'});
  });
  it('allows default expansion ending exactly at the same limit',()=>{
    const saved=validateContent(document(MAX_CONTENT_BYTES-60,false));expect(saved.ok).toBe(true);if(!saved.ok)throw Error(saved.error);
    expect(new TextEncoder().encode(saved.json).byteLength).toBe(MAX_CONTENT_BYTES);expect(validateContent(saved.json).ok).toBe(true);
  });
});
