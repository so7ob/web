import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDataSource } from "../../packages/server/src/database/data-source.js";
import {
  assertDevelopmentDatabase,
  createDevelopmentAdmin,
} from "../../packages/server/src/auth/development-admin.js";
const argument = (name: string) =>
  process.argv
    .find((a) => a.startsWith("--" + name + "="))
    ?.slice(name.length + 3);
const database = argument("database"),
  email = argument("email"),
  name = argument("name") ?? "مدير النظام";
if (!database || !email)
  throw new Error(
    'Usage: npm run admin:create -- --database=so7ob --email=you@example.com --name="مدير النظام" [--password-from-stdin]',
  );
assertDevelopmentDatabase(database);
const password = process.argv.includes("--password-from-stdin")
  ? readFileSync(0, "utf8").replace(/[\r\n]+$/, "")
  : randomBytes(24).toString("base64url") + "Aa9";
const db = await createDataSource().initialize();
try {
  const result = await createDevelopmentAdmin(db, {
    database,
    email,
    name,
    password,
  });
  console.log("Created local development administrator:", result.email);
  if (!process.argv.includes("--password-from-stdin"))
    console.log("Random password (shown once; store privately):", password);
  console.log(
    "Sign in:",
    (process.env.SITE_URL ?? "http://localhost:3108") + "/ar/auth/login",
  );
} finally {
  await db.destroy();
}
