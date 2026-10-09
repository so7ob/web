import { expect, it } from 'vitest';
import { parsePageSettings, serializePageSettings, normalizePageSettings } from './page-settings.js';
it('an explicit null in a saved snapshot clears SEO rather than resurrecting legacy public text',()=>{
 const legacy={slug:'page',seoTitleAr:'قديم',seoTitleEn:'Old',seoDescAr:'قديم',seoDescEn:'Old'};
 const snapshot=serializePageSettings(normalizePageSettings({...legacy,seoTitleAr:null,seoTitleEn:null,seoDescAr:null,seoDescEn:null}));
 expect(parsePageSettings(snapshot,legacy)).toMatchObject({seoTitleAr:null,seoTitleEn:null,seoDescAr:null,seoDescEn:null});
 expect(parsePageSettings('{}',legacy)).toMatchObject({seoTitleAr:'قديم',seoTitleEn:'Old'});
});
