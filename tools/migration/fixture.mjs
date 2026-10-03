// Synthetic baseline only. Never accepts an external database or production path.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
const root = resolve(__dirname, '../..');
const local = createRequire(join(root, '.migration/reference/Website/package.json'));
const { PrismaClient } = local('@prisma/client');
const bcrypt = local('bcryptjs');
const data = join(root, '.migration/baseline/data');
const db = new PrismaClient({ datasourceUrl: `file:${data}/reference.db` });
const password = 'Synthetic-Migration-4829';
async function main() {
  const passwordHash = await bcrypt.hash(password, 12);
  const roles = { admin: 'super_admin', ops: 'ops_manager', support: 'support', editor: 'content_editor', owner: 'client', other: 'client', pending: 'client', suspended: 'client' };
  for (const [id, roleKey] of Object.entries(roles)) {
    await db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@migration.example.invalid`, name: `Synthetic ${id}`, passwordHash, roleKey, status: id === 'pending' ? 'pending_verification' : id === 'suspended' ? 'suspended' : 'active', emailVerifiedAt: id === 'pending' ? null : new Date('2026-10-01T00:00:00Z') } });
  }
  await db.projectRequest.upsert({ where: { id: 'migrationrequest' }, update: {}, create: { id: 'migrationrequest', refCode: 'S7-MIGRATE01', requestType: 'discussion', serviceType: 'web', description: 'Synthetic bilingual migration request — طلب اصطناعي', budget: 'unspecified', timeline: 'flexible', name: 'Synthetic owner', email: 'owner@migration.example.invalid', preferredContact: 'email', descriptionHash: 'synthetic', clientId: 'owner', assigneeId: 'support' } });
  for (const [id, kind, body] of [['visiblemessage', 'message', 'Synthetic visible reply'], ['internalmessage', 'internal_note', 'MIGRATION_PRIVATE_NOTE']]) {
    await db.requestMessage.upsert({ where: { id }, update: {}, create: { id, requestId: 'migrationrequest', authorId: 'support', authorType: 'staff', kind, body } });
  }
  await db.inquiry.upsert({ where: { id: 'migrationinquiry' }, update: {}, create: { id: 'migrationinquiry', refCode: 'IQ-MIGRATE01', subject: 'Synthetic inquiry', name: 'Synthetic owner', email: 'owner@migration.example.invalid', clientId: 'owner', assigneeId: 'support' } });
  mkdirSync(join(data, 'uploads'), { recursive: true });
  const bytes = Buffer.from('%PDF-1.4\nSynthetic migration attachment\n%%EOF\n');
  writeFileSync(join(data, 'uploads/synthetic.pdf'), bytes);
  await db.attachment.upsert({ where: { id: 'migrationattachment' }, update: {}, create: { id: 'migrationattachment', filename: 'synthetic.pdf', storedName: 'synthetic.pdf', mimeType: 'application/pdf', size: bytes.length, uploaderId: 'owner', requestId: 'migrationrequest' } });
  const page = await db.page.findFirstOrThrow({ where: { slug: '' } });
  writeFileSync(join(root, '.migration/baseline/fixture.json'), JSON.stringify({ users: Object.keys(roles), pageId: page.id, requestId: 'migrationrequest', inquiryId: 'migrationinquiry', attachmentId: 'migrationattachment' }, null, 2));
  console.log('Synthetic fixture ready; no production database read.');
}
main().finally(() => db.$disconnect());
