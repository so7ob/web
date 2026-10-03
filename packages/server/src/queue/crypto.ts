import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
export interface MailInput { to: string; subject: string; text: string; html?: string }
export class QueueError extends Error {}
export class PayloadCipher {
  private readonly key: Buffer;
  constructor(secret: string | undefined = process.env.OUTBOX_KEY) {
    if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret)) throw new QueueError('OUTBOX_KEY must contain 32 random bytes encoded as hex');
    this.key = Buffer.from(secret, 'hex');
  }
  digest(mail: MailInput): string { return createHmac('sha256', this.key).update(this.serialize(mail)).digest('hex'); }
  encrypt(mail: MailInput, id: string): string {
    const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, nonce); cipher.setAAD(Buffer.from(`so7ob-mail:v1:${id}`));
    const body = Buffer.concat([cipher.update(this.serialize(mail), 'utf8'), cipher.final()]);
    return JSON.stringify({ v: 1, nonce: nonce.toString('base64'), body: body.toString('base64'), tag: cipher.getAuthTag().toString('base64') });
  }
  decrypt(payload: string, id: string): MailInput {
    try {
      const p = JSON.parse(payload) as { v: number; nonce: string; body: string; tag: string };
      if (p.v !== 1) throw new Error();
      const cipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(p.nonce,'base64')); cipher.setAAD(Buffer.from(`so7ob-mail:v1:${id}`)); cipher.setAuthTag(Buffer.from(p.tag,'base64'));
      const mail = JSON.parse(Buffer.concat([cipher.update(Buffer.from(p.body,'base64')), cipher.final()]).toString('utf8')) as MailInput;
      this.serialize(mail); return mail;
    } catch { throw new QueueError('Encrypted mail payload could not be authenticated'); }
  }
  private serialize(mail: MailInput): string {
    if (!mail || typeof mail.to !== 'string' || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(mail.to) || mail.to.length > 254 || typeof mail.subject !== 'string' || /[\r\n]/.test(mail.subject) || mail.subject.length > 500 || typeof mail.text !== 'string' || mail.text.length > 200000 || (mail.html !== undefined && (typeof mail.html !== 'string' || mail.html.length > 200000))) throw new QueueError('Invalid mail payload');
    return JSON.stringify({ to: mail.to, subject: mail.subject, text: mail.text, ...(mail.html === undefined ? {} : { html: mail.html }) });
  }
}
