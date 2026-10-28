import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeNetlog } from './stylesheet-netlog.mjs';
test('transport summary distinguishes retry events and error codes without exposing request data', () => {
  const result = summarizeNetlog({ constants: { logEventTypes: { SSL_CONNECT: 1, HTTP_TRANSACTION_RESTART_AFTER_ERROR: 2 }, netError: { ERR_CERT_AUTHORITY_INVALID: -202, ERR_TOO_MANY_RETRIES: -375 } }, events: [
    { type: 1, params: { net_error: -202, url: 'https://127.0.0.1/private?token=secret', headers: ['Cookie: secret'] } },
    { type: 2, params: { net_error: -375 } }, { type: 1, params: {} },
  ] });
  assert.deepEqual(result, { events: 3, counts: { SSL_CONNECT: 2, HTTP_TRANSACTION_RESTART_AFTER_ERROR: 1 }, failures: { 'SSL_CONNECT: ERR_CERT_AUTHORITY_INVALID': 1, 'HTTP_TRANSACTION_RESTART_AFTER_ERROR: ERR_TOO_MANY_RETRIES': 1 } });
  assert(!JSON.stringify(result).includes('secret'));
});
