import { createDataSource, assertSchema } from './data-source.js';
const command = process.argv[2];
if (!['migrate', 'check'].includes(command)) throw new Error('Usage: db:migrate or db:check');
const db = await createDataSource().initialize();
try {
  if (command === 'migrate') console.log('Applied migrations:', (await db.runMigrations()).map(m => m.name));
  await assertSchema(db);
  console.log('Schema verified; synchronize and destructive reset are disabled.');
} finally { await db.destroy(); }
