import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Deliberate content, not application chrome. Keep this list narrow and reviewed.
export const COLOR_EXCEPTIONS = new Map([
  ['apps/web/src/components/works/case-visual.tsx', 'Illustrated portfolio samples retain the represented product colors.'],
  ['apps/web/src/components/works/booking-prototype.tsx', 'Embedded portfolio demonstration retains its own product identity.'],
  ['apps/web/src/print.css', 'Paper output uses a fixed light palette regardless of screen preference.'],
]);
export function literalColors(source: string): string[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const pattern = /(?:\b(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|outline)-(?:white|black)(?![\w-])|\b(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|outline)-(?:slate|gray|zinc|neutral|stone|blue|sky|cyan|indigo|purple|violet|green|emerald|teal|yellow|amber|orange|red|rose|pink|fuchsia)-\d{2,3}\b|#[\da-fA-F]{3,8}(?![\w-])|(?<![a-zA-Z])(?:rgb|rgba|hsl|hsla|oklch)\(\s*[\d.])/g;
  return [...new Set(clean.match(pattern) ?? [])];
}
function files(dir: string): string[] {
  return readdirSync(dir, {withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir+'/'+e.name):[dir+'/'+e.name]);
}
export function checkDesignSystem() {
  const candidates = [...files('apps/web/src'), 'packages/contracts/src/content/style.ts'].filter(f=>/\.(?:tsx?|css)$/.test(f)&&!f.includes('.test.')&&!COLOR_EXCEPTIONS.has(f));
  const violations = candidates.flatMap(file=>literalColors(readFileSync(file,'utf8')).map(value=>`${file}: ${value}`));
  if(violations.length) throw new Error('Use semantic design tokens for interface colors:\n'+violations.join('\n'));
  console.log(`Design tokens: ${candidates.length} source files checked; ${COLOR_EXCEPTIONS.size} documented content/print exceptions.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkDesignSystem();
