import { createDataSource, assertSchema } from './data-source.js';
const command = process.argv[2];
if (!['migrate', 'check', 'check-cms'].includes(command)) throw new Error('Usage: db:migrate, db:check or db:check-cms');
const db = await createDataSource().initialize();
try {
  if (command === 'migrate') console.log('Applied migrations:', (await db.runMigrations()).map(m => m.name));
  await assertSchema(db);
  if (command === 'check-cms') {
    const [row] = await db.query('SELECT @@session.max_allowed_packet bytes');
    if (Number(row.bytes) < 256 * 1024 * 1024) throw new Error('CMS compatibility requires max_allowed_packet >=256MiB; configure MariaDB and reconnect before accepting large legacy writes');
    console.log('CMS packet capacity verified:', Number(row.bytes));
  }
  console.log('Schema verified; synchronize and destructive reset are disabled.');
} finally { await db.destroy(); }
