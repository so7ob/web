// Synthetic acceptance fixture. Source DDL stays frozen at Website 5321b7f.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashSync } from 'bcryptjs';
import { orderedTables, primaryKey } from './snapshot.js';
import { schema as currentSchema, schemaV1, identifier as q } from '../database/schema.js';
export const fixtureInstant = Date.parse('2026-10-02T12:34:56.789Z');
export function syntheticSnapshot(root: string, version: 1 | 2 = 1): { sqlite: string; sourceUploads: string } {
  const schema = version === 1 ? schemaV1 : currentSchema;
  mkdirSync(root, { recursive: true }); const sqlite = join(root, 'snapshot.db'); const sourceUploads = join(root, 'uploads'); mkdirSync(sourceUploads);
  const db = new DatabaseSync(sqlite);
  const passwordHash = hashSync('Synthetic-Only-4829', 12);
  try {
    const ddl = fileURLToPath(new URL(version === 1 ? './fixtures/' : './fixtures-v2/', import.meta.url));
    for (const file of readdirSync(ddl).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(ddl, file), 'utf8'));
    db.exec('PRAGMA foreign_keys=ON');
    for (const table of orderedTables(schema)) {
      const values: Record<string, string | number | null> = {};
      for (const [key,c] of Object.entries(schema[table].columns)) {
        values[key] = c.nullable ? null : c.type === 'DateTime' ? fixtureInstant : c.type === 'Boolean' ? 1 : c.type === 'Int' ? 1 : c.type === 'Float' ? 1.5 : `${table}_${key}`;
        if (c.default?.kind === 'literal' && !c.primary) values[key] = typeof c.default.value === 'boolean' ? Number(c.default.value) : c.default.value ?? null;
        if (c.primary) values[key] = `${table}_synthetic`;
      }
      for (const rel of Object.values(schema[table].relations)) for (const field of rel.fields) values[field] = `${rel.model}_synthetic`;
      const overrides: Record<string, Record<string, string | number | null>> = {
        Role: { permissions: '["requests.view", "content.edit"]', nameAr: 'اصطناعي 😀', nameEn: 'Synthetic' },
        User: { email: 'synthetic@example.invalid', passwordHash, status: 'active', locale: 'ar', phone: null, sessionsRevokedAt: fixtureInstant - 1000 },
        AuthSession: { fingerprint: 'legacy-fingerprint-preserved', expiresAt: fixtureInstant - 10, revokedAt: fixtureInstant - 100, revokedReason: 'suspended' },
        AuthToken: { tokenHash: 'used-token-hash-preserved', type: 'password_reset', expiresAt: fixtureInstant - 200, usedAt: fixtureInstant - 300 },
        UserInvite: { tokenHash: 'expired-invite-hash', expiresAt: fixtureInstant - 1, acceptedAt: fixtureInstant - 100 },
        RequestDraft: { data: '{ "description": "نص 😀", "extra": null }' },
        ProjectRequest: { refCode: 'S7-TEST0001', email: 'synthetic@example.invalid', status: 'awaiting_info', description: 'نص عربي 😀\nSecond line', descriptionHash: 'synthetic-description-hash' },
        RequestMessage: { body: 'ملاحظة داخلية خاصة', kind: 'internal_note' },
        Inquiry: { refCode: 'IQ-TEST0001', email: 'synthetic@example.invalid' },
        Attachment: { storedName: 'attachment.pdf', filename: 'ملف.pdf', size: 27, mimeType: 'application/pdf', inquiryId: null, messageId: 'RequestMessage_synthetic' },
        MediaItem: { storedName: 'media.png', filename: 'صورة.png', size: 12, mimeType: 'image/png' },
        Page: { slug: 'synthetic', draftBlocksAr: '[{"id":"draft","type":"text","data":{"text":"مسودة"}}]', publishedBlocksAr: '[{"id":"public","type":"text","data":{"text":"منشور"}}]', visibility: 'role', allowedRoles: '["Role_synthetic"]', ogMediaId: 'MediaItem_synthetic', draftUpdatedById: 'User_synthetic', publishedById: 'User_synthetic' },
        PageVersion: { blocks: '[{"id":"version","type":"text"}]', locale: 'ar', version: 3 },
        ...(version === 2 ? {
          TrackLink: { scope: 'request', tokenHash: 'expired-revoked-track-hash', inquiryId: null, expiresAt: fixtureInstant - 100, revokedAt: fixtureInstant - 200, revokedReason: 'policy_changed' },
          PageTemplate: { key: null, nameAr: 'قالب اصطناعي 😀', kind: 'custom', blocksAr: '{"schemaVersion":1,"blocks":[]}', blocksEn: null },
        } : {}),
        Notification: { payload: '{ "name": "اختبار 😀", "nested": { "n": 1 } }' },
        AuditLog: { details: '{"before":null,"after":"active"}', entityType: 'User', entityId: 'User_synthetic' },
        MenuItem: { pageSlug: 'synthetic', location: 'header' },
        PageRedirect: { fromSlug: 'previous', toSlug: 'synthetic' },
      };
      Object.assign(values, overrides[table]);
      if (table === 'Attachment') { const bytes = Buffer.from('%PDF-1.4\nsynthetic attachment'); values.size = bytes.length; writeFileSync(join(sourceUploads, 'attachment.pdf'), bytes); }
      if (table === 'MediaItem') { const bytes = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]); values.size = bytes.length; writeFileSync(join(sourceUploads, 'media.png'), bytes); }
      const fields = Object.keys(values); db.prepare(`INSERT INTO ${q(table)} (${fields.map(q).join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...fields.map(k => values[k]));
    }
    // SQLite BINARY edge cases must remain distinct under the target collation.
    for (const id of ['Case', 'case', 'case ']) db.prepare('INSERT INTO Role (`key`,nameAr,nameEn,updatedAt) VALUES (?,?,?,?)').run(id, 'دور 😀', id, fixtureInstant);
    writeFileSync(join(sourceUploads,'unreferenced.txt'), 'Preserved orphan file for operator review.');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Invalid test fixture');
  } finally { db.close(); }
  return { sqlite, sourceUploads };
}
export const fixtureIds = Object.fromEntries(orderedTables().map(table => [table, { [primaryKey(table)]: `${table}_synthetic` }]));
