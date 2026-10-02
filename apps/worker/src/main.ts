import { database, assertSchema } from '@so7ob/server';
// Phase B verifies worker isolation and database compatibility. Queue handlers are phase E.
const db = await database();
await assertSchema(db);
if (process.argv.includes('--check')) { await db.destroy(); }
else { await db.destroy(); throw new Error('Worker handlers have not passed phase E acceptance; refusing to advertise readiness.'); }
