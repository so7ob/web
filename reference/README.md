# Read-only historical source archive

`website-import/` retains the imported reference files formerly at the repository root. Do not install or run this archive as the product. It is not a complete standalone package and is not the latest Website snapshot. The original manifest and normalizations remain in docs/migration; reference-relocation.json maps every moved file and its exact hash.

Production uses apps/, packages/, npm and Node. Baseline tools use SHA-pinned isolated snapshots under ignored .migration/reference through tools/migration/reference-paths.mjs. The pinned historical CI job checks out its own historical commit; it does not build this archive. Original copyright and attribution remain applicable.
