import assert from 'node:assert/strict';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import ts from 'typescript';

export const forbiddenDependency = name => /^(?:next(?:\/|$)|@prisma(?:\/|$)|prisma(?:\/|$)|bun(?:[:/]|$))/.test(name);
const historicalPath = raw => {
  const value = raw.replace(/https?:\/\/[^\s'"`]+/g, '');
  return /(?:^|[\s'"`=:/(])(?:reference(?:\/|\\)|\.migration[/\\]reference(?:[/\\]|$))/.test(value) ||
  /(?:[/\\]|file:)So7ob[/\\](?:Website|Rakim)(?:[/\\]|$)/i.test(value) ||
  /(?:^|[\s'"`=:(])(?:\.\.[/\\])+(?:Website|Rakim)(?:[/\\]|$)/i.test(value) ||
  /REFERENCE_SOURCE_SHA/.test(value);
};
const oldCommand = value => /(?:^|[\s;&|])(?:bun|bunx|next|prisma)(?:\s|$)/.test(value);

export function checkConfiguration(source, file) {
  assert(!historicalPath(source), `${file}: historical source path/configuration`);
  if (/\.github\/workflows\//.test(file)) {
    assert(!/oven-sh\/setup-bun|NEXT_PUBLIC_|DATABASE_URL:\s*file:/.test(source), `${file}: retired runtime job`);
    assert(!/^\s*ref:\s*[a-f0-9]{7,40}\s*$/m.test(source), `${file}: historical checkout`);
    assert(!oldCommand(source), `${file}: retired runtime command`);
  }
}

export function checkManifest(manifest, file) {
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
    assert(!forbiddenDependency(name), `${file}: forbidden dependency ${name}`);
  }
  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    assert(!name.startsWith('reference:'), `${file}: retired reference entry point`);
    checkConfiguration(command, file);
    assert(!oldCommand(command), `${file}: forbidden command ${name}`);
  }
  for (const path of Object.values({ ...manifest.dependencies, ...manifest.devDependencies })) checkConfiguration(path, file);
}

export function checkSource(source, file, root, { inspectPaths = true } = {}) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let imports = 0;
  const inspectImport = name => {
    imports++;
    assert(!forbiddenDependency(name), `${file}: forbidden import ${name}`);
    assert(!/^(?:https?:|file:)/.test(name), `${file}: external module source ${name}`);
    checkConfiguration(name, file);
    if (name.startsWith('.') || name.startsWith('@/') || isAbsolute(name)) {
      const target = name.startsWith('@/') ? resolve(root, 'apps/web/src', name.slice(2)) : resolve(root, dirname(file), name);
      const path = relative(root, target).replaceAll('\\', '/');
      assert(!path.startsWith('../') && !isAbsolute(path), `${file}: import outside this checkout ${name}`);
      assert(!/^(?:reference|src|prisma|scripts|\.migration)(?:\/|$)/.test(path), `${file}: historical source import ${name}`);
    }
  };
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) inspectImport(node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteralLike(node.moduleReference.expression)) inspectImport(node.moduleReference.expression.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || /^(?:require|require\.resolve)$/.test(node.expression.getText(ast)))) {
      if (node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) inspectImport(node.arguments[0].text);
      else {
        // Nest's only computed module load reads this checkout's Vite SSR output.
        assert(file === 'apps/api/src/main.ts' && node.getText(ast).replaceAll(/\s/g, '') === 'import(pathToFileURL(resolve(web,"dist/server/entry-server.js")).href)', `${file}: unreviewed computed module load`);
      }
    }
    if (inspectPaths && ts.isStringLiteralLike(node)) checkConfiguration(node.text, file);
    if (inspectPaths && ts.isCallExpression(node) && /(?:^|\.)(?:join|resolve|readFileSync|readFile|readdirSync|createReadStream|createRequire)$/.test(node.expression.getText(ast))) {
      for (const arg of node.arguments) if (ts.isStringLiteralLike(arg)) {
        assert(!/^(?:reference|Website|Rakim)$/.test(arg.text), `${file}: historical filesystem path component`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return imports;
}
