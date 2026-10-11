import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSource, checkManifest, checkConfiguration } from './independence-policy.mjs';

test('rejects static, dynamic, CommonJS, re-export and aliased historical imports', () => {
  for (const source of [
    'import x from "next/server";', 'export * from "@prisma/client";',
    'const x = import("bun:sqlite");', 'const x = require("prisma");',
    'require.resolve("next");', 'import x = require("bun");',
    'import x from "../../../reference/website-import/src/a";',
    'export * from "@/../../../../reference/website-import/src/a";',
    'import x from "/root/So7ob/Website/src/a";', 'import x from "../../../../Website/a";',
    'const name = "module"; import(name);',
  ]) assert.throws(() => checkSource(source, 'apps/web/src/probe.ts', '/project'));
});

test('rejects archive reads, source configuration and historical CI checkouts', () => {
  for (const source of ['readFileSync(".migration/reference/Website/a")', 'const x = "REFERENCE_SOURCE_SHA";', 'readFileSync("../Website/package.json")', 'readFileSync(join("..","Website","src/a"))', 'readdirSync("reference")']) {
    assert.throws(() => checkSource(source, 'tools/probe.mjs', '/project'));
  }
  for (const source of ['run: bun install', 'uses: oven-sh/setup-bun@v2', '  ref: a2dc18cff582159ef14b66250d600aa8307918cf']) assert.throws(() => checkConfiguration(source, '.github/workflows/ci.yml'));
  for (const manifest of [{ dependencies: { next: '1' } }, { optionalDependencies: { '@prisma/client': '1' } }, { scripts: { dev: 'next dev' } }, { scripts: { 'reference:check': 'node x' } }, { dependencies: { a: 'file:../Website' } }]) assert.throws(() => checkManifest(manifest, 'package.json'));
});

test('accepts standalone theme library, current lazy screens and local synthetic fixtures', () => {
  assert.equal(checkSource('import {useTheme} from "next-themes"; import("./screens/cms"); readFileSync("tests/fixtures/source-block-contracts.json");', 'apps/web/src/probe.ts', '/project'), 2);
  checkSource('const path = ".migration/e2e/run.json"; const provenance = "https://github.com/so7ob/Website";', 'tests/probe.ts', '/project');
  checkManifest({ dependencies: { 'next-themes': '0.4.6' }, scripts: { build: 'vite build' } }, 'package.json');
});
