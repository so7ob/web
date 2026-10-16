// Offline, redacted summary: never print URLs, headers, cookies or payload bytes.
// Use only logs from the isolated loopback synthetic Playwright fixture.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function summarizeNetlog(log) {
  const names = Object.fromEntries(Object.entries(log.constants.logEventTypes).map(([name, id]) => [id, name]));
  const errors = Object.fromEntries(Object.entries(log.constants.netError ?? {}).map(([name, id]) => [id, name]));
  const events = log.events ?? [];
  const counts = {}, failures = {};
  for (const event of events) {
    const name = names[event.type] ?? String(event.type);
    if (/RESTART|RETRY|CERT|SSL_CONNECT|TCP_CONNECT|HTTP_TRANSACTION_RESTART/.test(name)) counts[name] = (counts[name] ?? 0) + 1;
    const code = event.params?.net_error;
    if (typeof code === 'number' && code < 0) {
      const key = `${name}: ${errors[code] ?? code}`;
      failures[key] = (failures[key] ?? 0) + 1;
    }
  }
  return { events: events.length, counts, failures };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Usage: node tools/test/stylesheet-netlog.mjs <synthetic-netlog.json>');
  console.log(JSON.stringify(summarizeNetlog(JSON.parse(readFileSync(process.argv[2], 'utf8'))), null, 2));
}
