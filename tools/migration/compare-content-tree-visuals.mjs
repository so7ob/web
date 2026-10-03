import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { sourceSHA } from './reference-paths.mjs';
const results=[];
for(const locale of ['ar','en'])for(const device of ['desktop','mobile']) {
  const file=`${locale}-${device}.png`;
  const baseline=await sharp(`.migration/content-tree/reference/${file}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const target=await sharp(`.migration/content-tree/${file}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const sameSize=baseline.info.width===target.info.width&&baseline.info.height===target.info.height;
  let different=0;
  if(sameSize)for(let i=0;i<baseline.data.length;i+=4)if(baseline.data[i]!==target.data[i]||baseline.data[i+1]!==target.data[i+1]||baseline.data[i+2]!==target.data[i+2])different++;
  const fraction=sameSize?different/(baseline.info.width*baseline.info.height):null;
  results.push({file,sourceSize:[baseline.info.width,baseline.info.height],targetSize:[target.info.width,target.info.height],differentPixelFraction:fraction,pass:fraction!==null&&fraction<=0.005});
}
const report={sourceSHA,threshold:0.005,metric:'Exact RGB inequality, full-page, no masks',results};
writeFileSync('.migration/content-tree/visual-comparison.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(results.some(r=>!r.pass))process.exitCode=1;
