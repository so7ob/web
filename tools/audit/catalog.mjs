import { AUDIT_CATALOG } from "@so7ob/contracts";
import { readdir, readFile, writeFile } from "node:fs/promises";
const files = [];
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const p = path + "/" + entry.name;
    if (entry.isDirectory()) await walk(p);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts"))
      files.push({ path: p, body: await readFile(p, "utf8") });
  }
}
await walk("packages/server/src");
await walk("apps/api/src");
const rows = Object.entries(AUDIT_CATALOG).map(([code, event]) => {
  const calls = files
    .flatMap(({ path, body }) =>
      body
        .split("\n")
        .flatMap((line, i) =>
          line.includes("'" + code + "'") || line.includes('"' + code + '"')
            ? [`${path}:${i + 1}`]
            : [],
        ),
    )
    .filter(
      (p) => !p.includes("/audit/reader") && !p.includes("/audit/writer"),
    );
  return `| ${code} | ${event.ar} / ${event.en} | ${event.category}${event.sensitive ? " · sensitive" : ""} | ${event.fields.join(", ") || "—"} | ${event.context.join(", ") || "—"} | ${calls.join("<br>") || "Dynamic dispatch; see coverage notes"} |`;
});
await writeFile(
  "docs/migration/audit-70/catalog.md",
  "# Event catalog and recording sites\n\nGenerated from the shared allowlists by `node tools/audit/catalog.mjs`. Schema v1; unknown new event codes are rejected. Legacy codes are projected as unclassified/unknown, never successful by assumption. The catalog contains only operations supported by existing services and the new audit workspace.\n\n| Code | Labels | Category/sensitivity | Allowed diff roots | Allowed context keys | Source sites (includes readers/tests of conditions) |\n|---|---|---|---|---|---|\n" +
    rows.join("\n") +
    "\n\nDynamic conversation dispatch emits request/inquiry archived/restored/replied/internal_note. User update selects suspended/reactivated/role_changed/updated after its authorized transaction. Each batch emits resource events and a separate batch.completed summary. These are not new business operations. Fields not listed are discarded; listed secret/content fields record a change marker only.\n",
);
