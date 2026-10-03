import { describe, expect, it, vi } from 'vitest';
import { validateContent } from './validate.js';
import { cloneWithNewIds, collectIds, type ContentNode } from './tree.js';

describe('untrusted content boundaries', () => {
  it('validates UTF-8 in a browser without Node Buffer', () => {
    vi.stubGlobal('Buffer', undefined);
    try {
      const input = JSON.stringify({schemaVersion: 1, blocks: [{id: 'arabic', type: 'text', props: {paragraphs: ['نص عربي']}}]});
      expect(validateContent(input).ok).toBe(true);
      expect(validateContent(' '.repeat(150001) + 'ن'.repeat(75000))).toEqual({ok:false,error:'content_too_large'});
    } finally { vi.unstubAllGlobals(); }
  });
  it('rejects very deep untrusted JSON before recursive migration can exhaust the stack', () => {
    const raw = Array.from({length:5500},(_,i)=>`{"id":"x${i}","type":"container","children":[`).join('') + '{"id":"leaf","type":"text","props":{"paragraphs":["x"]}}' + ']}'.repeat(5500);
    const input = '{"schemaVersion":1,"blocks":[' + raw + ']}';
    expect(new TextEncoder().encode(input).length).toBeLessThan(300000);
    expect(validateContent(input)).toEqual({ok:false,error:'tree_too_deep'});
  });
  it('duplicates long identifiers without collisions even when the suffix source repeats', () => {
    const node: ContentNode = {id:'x'.repeat(60),type:'container',children:[{id:'y'.repeat(60),type:'text',props:{paragraphs:['نص']}}]};
    const taken = collectIds([node]);
    const first = cloneWithNewIds(node,taken,()=> 'same');
    const second = cloneWithNewIds(node,taken,()=> 'same');
    expect(collectIds([node,first,second]).size).toBe(6);
  });
});
