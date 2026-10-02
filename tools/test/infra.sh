#!/usr/bin/env bash
set -euo pipefail
# Syntax checks only: never install/start/reload services or target a public domain.
node ops/check-runtime.mjs
command -v nginx >/dev/null
command -v systemd-analyze >/dev/null
command -v openssl >/dev/null
infra_tmp=$(mktemp -d "${TMPDIR:-/tmp}/so7ob-infra.XXXXXXXX")
trap 'rm -r -- "$infra_tmp"' EXIT
export SO7OB_INFRA_TMP="$infra_tmp"
export SO7OB_INFRA_NODE="$(command -v node)"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=isolated.example.invalid' -keyout "$infra_tmp/key.pem" -out "$infra_tmp/cert.pem" > "$infra_tmp/openssl.log" 2>&1
node --input-type=module <<'JS'
import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir=process.env.SO7OB_INFRA_TMP, cwd=process.cwd();
let template=readFileSync('ops/nginx/so7ob-web.conf.template','utf8');
for (const [key,value] of Object.entries({DOMAIN:'isolated.example.invalid',CERTIFICATE:join(dir,'cert.pem'),CERTIFICATE_KEY:join(dir,'key.pem'),LOG_DIR:dir,RELEASE:cwd})) template=template.replaceAll(`__${key}__`,value);
const directives = template.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
assert(!directives.includes('try_files'));  assert(!template.includes('$request"')); assert(!template.includes('$http_referer')); assert(template.includes('proxy_set_header X-Forwarded-For $remote_addr;')); assert(!template.includes('/Website'));
assert(directives.includes('listen 80;')); assert(directives.includes('listen 443 ssl http2;'));
// The unprivileged CI runner cannot bind privileged ports during Nginx validation.
template = template.replace('listen 80;', 'listen 127.0.0.1:18080;').replace('listen 443 ssl http2;', 'listen 127.0.0.1:18443 ssl http2;');
writeFileSync(join(dir,'nginx.conf'),`pid ${dir}/nginx.pid;\nerror_log ${dir}/error.log;\nevents { worker_connections 16; }\nhttp { access_log off; ${template} }\n`);
for (const name of ['api','worker']) {
 const source=readFileSync(`ops/systemd/so7ob-web-${name}.service`,'utf8');
 assert(source.includes('ProtectSystem=strict')); assert(source.includes('User=so7ob-web')); assert(!source.includes('/Website')); assert(source.includes('NoNewPrivileges=true'));
 writeFileSync(join(dir,`so7ob-web-${name}.service`),source.replaceAll('/opt/node-v24.21.0/bin/node',process.env.SO7OB_INFRA_NODE).replaceAll('/opt/so7ob-web/current',cwd));
}
JS
nginx -t -p "$infra_tmp/" -c "$infra_tmp/nginx.conf"
systemd-analyze verify "$infra_tmp/so7ob-web-api.service" "$infra_tmp/so7ob-web-worker.service"
printf '%s\n' 'Node runtime, Nginx TLS/proxy configuration and systemd units verified; no service started or deployed.'
