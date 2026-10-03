// Reproducible upgrade of an empty, explicitly named synthetic MariaDB only.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createDataSource, assertSchema } from '../../packages/server/src/database/data-source.js';
import { schemaV1, identifier as q } from '../../packages/server/src/database/schema.js';
import { syntheticSnapshot } from '../../packages/server/src/migration/fixture.js';
import { normalize, orderedTables } from '../../packages/server/src/migration/snapshot.js';

const name = process.env.DATABASE_NAME;
if (!name || !/^so7ob_[a-z0-9_]+_test$/.test(name) || !['127.0.0.1','localhost'].includes(process.env.DATABASE_HOST ?? '')) {
  throw new Error('An explicit loopback so7ob_*_test database is required');
}
const db = await createDataSource().initialize();
try {
  const [state] = await db.query('SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=?', [name]);
  if (Number(state.n) !== 0) throw new Error('Upgrade rehearsal requires a new empty test database; no reset is performed');
  const complete = db.migrations;
  db.migrations = complete.filter(m => m.name !== 'SourceV21791072000000');
  await db.runMigrations();
  mkdirSync('.migration', {recursive:true});
  const root = mkdtempSync('.migration/upgrade-v2-');
  const fixture = syntheticSnapshot(root + '/source', 1);
  const sqlite = new DatabaseSync(fixture.sqlite, {readOnly:true});
  const before: Record<string, unknown[]> = {};
  try {
    for (const table of orderedTables(schemaV1)) {
      const columns = Object.entries(schemaV1[table].columns);
      const rows = sqlite.prepare(`SELECT * FROM ${q(table)}`).all();
      for (const row of rows) {
        const values = columns.map(([key,c]) => c.type === 'DateTime' && row[key] !== null ? new Date(String(normalize(row[key], c))) : row[key]);
        await db.query(`INSERT INTO ${q(table)} (${columns.map(([key])=>q(key)).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`, values);
      }
      before[table] = rows.map(row => Object.fromEntries(columns.map(([key,c])=>[key,normalize(row[key],c)])));
    }
  } finally { sqlite.close(); }
  db.migrations = complete;
  const applied = await db.runMigrations();
  assert.deepEqual(applied.map(m=>m.name), ['SourceV21791072000000']);
  await assertSchema(db);
  for (const [table, rows] of Object.entries(before)) {
    const actual = await db.query(`SELECT * FROM ${q(table)}`);
    const projection = actual.map((row: Record<string, unknown>) => Object.fromEntries(Object.entries(schemaV1[table].columns).map(([key,c])=>[key,normalize(row[key],c)])));
    const stable = (values: unknown[]) => values.map(value=>JSON.stringify(value)).sort();
    assert.deepEqual(stable(projection), stable(rows), `All original ${table} values must survive`);
  }
  assert.deepEqual(await db.runMigrations(), []);
  const result = {database:name,sourceSchemaVersion:1,targetSchemaVersion:2,originalTables:23,targetTables:25,
    allOriginalIdsAndValuesPreserved:true,repeatApplied:0,productionData:false,fixtureDirectory:root};
  writeFileSync(root+'/result.json', JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally { await db.destroy(); }
