import {readFileSync} from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
let revision='unavailable';
try{const info=JSON.parse(readFileSync(new URL('../api/dist/build-info.json',import.meta.url),'utf8'));if(/^[a-f0-9]{40}$/.test(info.sha))revision=info.sha+(info.dirty?'+dirty':'');}catch{/* Source-only development has no claimed build SHA. */}
export default defineConfig({
  define:{'import.meta.env.VITE_BUILD_SHA':JSON.stringify(revision)},
  plugins: [react()], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { sourcemap: true, manifest: true, target: 'es2022' },
  ssr: { noExternal: ['lucide-react'] },
});
