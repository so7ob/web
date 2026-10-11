// Prints an explicit grant list for review. Does not create users or execute SQL.
import { createDataSource } from "@so7ob/server";
const [name, host] = process.argv.slice(2),
  database = process.env.DATABASE_NAME;
if (
  !/^[a-zA-Z0-9_]{1,64}$/.test(database ?? "") ||
  !/^[a-zA-Z0-9_]{1,32}$/.test(name ?? "") ||
  !/^[a-zA-Z0-9.:-]{1,255}$/.test(host ?? "")
)
  throw new Error(
    "Usage: runtime-grants.mjs NEW_RUNTIME_USER HOST with DATABASE_NAME configured",
  );
const db = await createDataSource().initialize();
try {
  const tables = await db.query(
    "SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=? ORDER BY TABLE_NAME",
    [database, "BASE TABLE"],
  );
  console.log(
    "-- Apply only to a NEW account without global, schema, inherited role, or proxy grants.\n-- Use a separate migration account. Never grant ALL on this schema to the runtime.",
  );
  for (const { name: table } of tables) {
    if (!/^[a-zA-Z0-9_]+$/.test(table))
      throw new Error("Unexpected table name");
    const privileges =
      table === "AuditLog"
        ? "SELECT, INSERT"
        : table === "so7ob_schema_migrations"
          ? "SELECT"
          : "SELECT, INSERT, UPDATE, DELETE";
    console.log(
      `GRANT ${privileges} ON \`${database}\`.\`${table}\` TO '${name}'@'${host}';`,
    );
  }
} finally {
  await db.destroy();
}
