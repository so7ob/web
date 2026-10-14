import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Opt-in timing only: no URLs, request payloads, cookies, or page contents. */
export class PerformanceLedger {
  readonly stages: Record<string, { calls: number; milliseconds: number }> = {};
  async measure<T>(stage: string, action: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await action(); }
    finally {
      const row = this.stages[stage] ??= { calls: 0, milliseconds: 0 };
      row.calls++;
      row.milliseconds += performance.now() - start;
    }
  }
  write(name: string, metadata: Record<string, unknown>) {
    const folder = process.env.SO7OB_E2E_PROFILE_DIR;
    if (!folder) return;
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, name + ".json"), JSON.stringify({ ...metadata, stages: this.stages }, null, 2) + "\n");
  }
}
