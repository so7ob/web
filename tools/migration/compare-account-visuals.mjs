import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
const baseline = JSON.parse(
  readFileSync(".migration/account-reference/report.json", "utf8"),
);
const target = JSON.parse(
  readFileSync(".migration/account-target/report.json", "utf8"),
);
const results = [];
for (const source of baseline.runs) {
  const current = target.runs.find(
    (r) => r.route === source.route && r.width === source.width,
  );
  if (!current) throw new Error("Missing target capture");
  const file = `${source.locale}-${source.name}-${source.width}.png`;
  const a = await sharp(".migration/account-reference/screenshots/" + file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const b = await sharp(".migration/account-target/screenshots/" + file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let different = 0;
  if (a.info.width !== b.info.width || a.info.height !== b.info.height)
    throw new Error("Dimensions differ");
  for (let i = 0; i < a.data.length; i += 4)
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2]
    )
      different++;
  const ratio = different / (a.info.width * a.info.height);
  const inherited = new Set(source.axe.map((v) => v.id));
  const signature = (target) =>
    JSON.stringify(target).replace(
      /#radix-[^\s]*?-trigger-/g,
      "#radix-trigger-",
    );
  const newViolations = current.axe.filter(
    (v) =>
      !inherited.has(v.id) ||
      v.targets.some(
        (target) =>
          !source.axe
            .find((old) => old.id === v.id)
            ?.targets.map(signature)
            .includes(signature(target)),
      ) ||
      v.targets.length >
        (source.axe.find((old) => old.id === v.id)?.targets.length ?? 0),
  );
  results.push({
    file,
    visualSessionFixture: current.visualSessionFixture ?? null,
    ratio,
    pass:
      ratio <= 0.005 &&
      current.status === source.status &&
      !current.errors.length &&
      !current.failedRequests.length &&
      !newViolations.length,
    newViolations,
    errors: current.errors,
    failedRequests: current.failedRequests,
  });
}
writeFileSync(
  ".migration/account-target/comparison.json",
  JSON.stringify(
    {
      sourceSHA: baseline.sourceSHA,
      threshold: 0.005,
      metric:
        "Exact RGB inequality; viewport 900px; no masks; equal source-bounded display fixture for security sessions only",
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    results.map((r) => ({
      file: r.file,
      ratio: r.ratio,
      pass: r.pass,
      newViolations: r.newViolations.map((v) => v.id),
      errors: r.errors,
    })),
    null,
    2,
  ),
);
if (results.some((r) => !r.pass)) process.exitCode = 1;
