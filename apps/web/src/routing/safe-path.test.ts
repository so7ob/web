import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-path';
describe('login return paths',()=>{
  it('retains deep links and their query parameters',()=>expect(safeInternalPath('/ar/account?filter=open#requests')).toBe('/ar/account?filter=open#requests'));
  it('rejects URL authority normalization and control characters',()=>{
    for (const path of ['//external.invalid','/\\external.invalid','/\n/external.invalid','https://external.invalid','javascript:alert(1)']) expect(safeInternalPath(path)).toBeNull();
  });
});
