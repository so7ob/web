// Offline, redacted summary: never print URLs, headers, cookies or payload bytes.
// Use only logs from the isolated loopback synthetic Playwright fixture.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// Names come from a log too: never copy arbitrary log-controlled strings into
// an artifact, including constants. Unknown events/errors retain numeric IDs.
const eventNames = new Set(['SSL_CONNECT', 'TCP_CONNECT', 'TCP_CONNECT_ATTEMPT',
  'CERT_VERIFIER_JOB', 'CERT_VERIFIER_REQUEST', 'CERT_VERIFY_PROC',
  'HTTP_TRANSACTION_RESTART_AFTER_ERROR', 'HTTP_TRANSACTION_RESTART_AFTER_AUTH',
  'HTTP_TRANSACTION_RESTART_AFTER_CERT_ERROR', 'URL_REQUEST_START_JOB']);
const errorNames = new Map([[-202, 'ERR_CERT_AUTHORITY_INVALID'], [-375, 'ERR_TOO_MANY_RETRIES']]);
export function summarizeNetlog(log) {
  const names = Object.fromEntries(Object.entries(log.constants.logEventTypes).map(([name, id]) => [id, name]));
  const events = log.events ?? [];
  const counts = {}, failures = {};
  for (const event of events) {
    if (!Number.isSafeInteger(event.type)) continue;
    const rawName = names[event.type];
    const name = eventNames.has(rawName) ? rawName : `EVENT_${event.type}`;
    if (/RESTART|RETRY|CERT|SSL_CONNECT|TCP_CONNECT/.test(rawName ?? '')) counts[name] = (counts[name] ?? 0) + 1;
    const code = event.params?.net_error;
    if (Number.isSafeInteger(code) && code < 0) {
      const key = `${name}: ${errorNames.get(code) ?? code}`;
      failures[key] = (failures[key] ?? 0) + 1;
    }
  }
  return { events: events.length, counts, failures };
}
export function summarizeDirectory(input, output) {
  if (!existsSync(input)) return;
  mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const file of readdirSync(input).filter(name => /^process-\d+\.json$/.test(name))) {
    let result;
    try { result = summarizeNetlog(JSON.parse(readFileSync(join(input, file), 'utf8'))); }
    catch { result = { status: 'unreadable-or-incomplete' }; }
    // A killed browser may leave incomplete JSON. Report that fact, never copy
    // raw content or parser messages (which can contain request fragments).
    writeFileSync(join(output, file), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 5 && process.argv[2] === '--directory') summarizeDirectory(process.argv[3], process.argv[4]);
  else if (process.argv.length === 3) console.log(JSON.stringify(summarizeNetlog(JSON.parse(readFileSync(process.argv[2], 'utf8'))), null, 2));
  else throw new Error('Usage: stylesheet-netlog.mjs <file> | --directory <input> <summary-output>');
}
