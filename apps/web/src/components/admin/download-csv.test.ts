// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {downloadCsv} from './download-csv';
afterEach(()=>vi.unstubAllGlobals());
for(const status of [401,403,413,500])it(`rejects HTTP ${status} without reporting a download`,async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'forbidden'}),{status,headers:{'content-type':'application/json'}})));
 await expect(downloadCsv('/api/admin/requests/export','requests.csv')).rejects.toMatchObject({status});
});
it('rejects network failure and a login HTML response',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('network')));
 await expect(downloadCsv('/export','export.csv')).rejects.toThrow('network');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>login</html>',{headers:{'content-type':'text/html'}})));
 await expect(downloadCsv('/export','export.csv')).rejects.toMatchObject({code:'export_incomplete'});
});
it('rejects truncated content before handing a file to the browser',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('partial',{headers:{'content-type':'text/csv','content-length':'200'}})));
 await expect(downloadCsv('/export','export.csv')).rejects.toMatchObject({code:'export_incomplete'});
});
