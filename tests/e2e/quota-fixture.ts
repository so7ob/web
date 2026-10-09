import {test as base} from '@playwright/test';
import {createDataSource,sha256} from '@so7ob/server';
// New acceptance cases share a single loopback IP. Preserve its pre-test quota
// instead of making later, unrelated journeys consume our login attempts. The
// production limiter remains enabled for every request, including negative cases.
export const test=base.extend<{preserveLoginQuota:void}>({
 preserveLoginQuota:[async({baseURL},use)=>{
  if(new URL(baseURL!).hostname!=='127.0.0.1'||!['127.0.0.1','::1'].includes(process.env.DATABASE_HOST??'')||!/^so7ob_[a-z0-9_]+_test$/.test(process.env.DATABASE_NAME??''))throw new Error('Quota fixture requires isolated loopback test environment');
  const db=await createDataSource().initialize(),key=sha256('login:127.0.0.1');
  const [original]=await db.query('SELECT timestamps,updatedAt FROM RateLimitBucket WHERE bucketKey=?',[key]);
  try{await use();}finally{
   if(original)await db.query('INSERT INTO RateLimitBucket(bucketKey,timestamps,updatedAt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE timestamps=VALUES(timestamps),updatedAt=VALUES(updatedAt)',[key,original.timestamps,original.updatedAt]);
   else await db.query('DELETE FROM RateLimitBucket WHERE bucketKey=?',[key]);
   await db.destroy();
  }
 },{auto:true}],
});
