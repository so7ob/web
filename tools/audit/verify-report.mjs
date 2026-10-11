// A checksum verifies the file, not the origin or truth of its contents.
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const [file, manifestFile] = process.argv.slice(2);
if (!file || !manifestFile)
  throw new Error("Usage: verify-report.mjs FILE MANIFEST");
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
if (
  manifest.checksumAlgorithm !== "sha256" ||
  !Array.isArray(manifest.eventIds) ||
  manifest.eventIds.length !== manifest.eventCount ||
  new Set(manifest.eventIds).size !== manifest.eventCount
)
  throw new Error("Invalid manifest");
const hash = createHash("sha256");
let bytes = 0;
for await (const chunk of createReadStream(file)) {
  hash.update(chunk);
  bytes += chunk.length;
}
if (bytes !== manifest.bytes || hash.digest("hex") !== manifest.checksum)
  throw new Error("File does not match manifest");
console.log(
  JSON.stringify({
    verified: true,
    reference: manifest.reference,
    eventCount: manifest.eventCount,
    bytes,
    claim: "File matches this manifest; event origin is not authenticated",
  }),
);
