// Run with a separate maintenance identity. Never invoked by API or worker.
import { createDataSource, AuditOperations } from "@so7ob/server";
import { currentAuditActor } from "../../packages/server/dist/audit/reports.js";
const args = process.argv.slice(2),
  apply = args.includes("--apply"),
  actorId = args.find((a) => a.startsWith("--actor="))?.slice(8),
  revision = args.find((a) => a.startsWith("--policy-revision="))?.slice(18);
if (
  !actorId ||
  args.some(
    (a) =>
      !["--apply", "--dry-run"].includes(a) &&
      !a.startsWith("--actor=") &&
      !a.startsWith("--policy-revision="),
  )
)
  throw new Error(
    "Usage: maintenance.mjs --actor=ID [--dry-run | --apply --policy-revision=N]",
  );
if (
  apply &&
  (!/^\d+$/.test(revision ?? "") || process.env.AUDIT_MAINTENANCE !== "true")
)
  throw new Error(
    "Apply requires AUDIT_MAINTENANCE=true and an explicitly reviewed policy revision",
  );
const db = await createDataSource().initialize();
try {
  const actor = await currentAuditActor(db, actorId),
    ops = new AuditOperations(db);
  const { policy } = await ops.policy(actor);
  if (apply && policy.revision !== Number(revision))
    throw new Error("Policy changed; repeat dry-run and review");
  console.log(
    JSON.stringify(
      await ops.retention(
        actor,
        apply,
        250,
        apply ? Number(revision) : undefined,
      ),
      null,
      2,
    ),
  );
} finally {
  await db.destroy();
}
