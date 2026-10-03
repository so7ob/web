import 'reflect-metadata';
import { UtcDefaults1790985602000 } from './migrations/1790985602000-utc-defaults.js';
import { MailQueue1790985601000 } from './migrations/1790985601000-mail-queue.js';
import { Transfer1790985600000 } from './migrations/1790985600000-transfer.js';
import { DataSource, EntitySchema, type EntitySchemaColumnOptions } from 'typeorm';
import { schema } from './schema.js';
import { Website1790899200000 } from './migrations/1790899200000-website.js';
export function createDataSource(env: NodeJS.ProcessEnv = process.env): DataSource {
  if (!env.DATABASE_NAME || !env.DATABASE_USER) throw new Error('DATABASE_NAME and DATABASE_USER are required; no production database defaults');
  const entities = Object.entries(schema).map(([name, model]) => {
    const columns: Record<string, EntitySchemaColumnOptions> = {};
    for (const [key, c] of Object.entries(model.columns)) {
      columns[key] = {
        type: c.type === 'DateTime' ? 'datetime' : c.type === 'Boolean' ? 'boolean' : c.type === 'Int' ? 'int' : c.type === 'Float' ? 'double' : c.indexed ? 'varchar' : 'longtext',
        ...(c.type === 'String' && c.indexed ? { length: 255 } : {}),
        ...(c.type === 'DateTime' ? { precision: 3 } : {}),
        primary: c.primary, nullable: c.nullable, unique: c.unique,
      };
    }
    return new EntitySchema({ name, tableName: model.table, columns });
  });
  return new DataSource({
    type: 'mariadb',
    host: env.DATABASE_HOST ?? '127.0.0.1', port: Number(env.DATABASE_PORT ?? 3306),
    username: env.DATABASE_USER, password: env.DATABASE_PASSWORD ?? '', database: env.DATABASE_NAME,
    charset: 'utf8mb4', timezone: 'Z', synchronize: false, migrationsRun: false,
    migrationsTransactionMode: 'none', migrationsTableName: 'so7ob_schema_migrations',
    entities, migrations: [Website1790899200000, Transfer1790985600000, MailQueue1790985601000, UtcDefaults1790985602000], logging: false,
    extra: { connectionLimit: 10, multipleStatements: false, supportBigNumbers: true, bigNumberStrings: true },
  });
}
let current: Promise<DataSource> | undefined;
export function database(): Promise<DataSource> {
  return current ??= createDataSource().initialize().catch(error => { current = undefined; throw error; });
}
export async function assertSchema(db: DataSource): Promise<void> {
  const applied: Array<{ name: string }> = await db.query('SELECT name FROM so7ob_schema_migrations ORDER BY id');
  const expected = db.migrations.map(m => m.name);
  if (JSON.stringify(applied.map(m => m.name)) !== JSON.stringify(expected)) throw new Error('Database schema is missing migrations or belongs to another release; run db:check');
}
