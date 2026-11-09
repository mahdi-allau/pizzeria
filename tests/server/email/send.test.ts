import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmailNotConfiguredError,
  EmailSendError,
  defaultMailboxDir,
  sendEmail,
  type EmailMessage,
  type ResendLike,
} from '@/server/email/send';
import { setEnv, installCleanEnv } from '../auth/env';

installCleanEnv();

const message: EmailMessage = {
  to: 'mario.rossi@example.com',
  subject: 'Ordine n. 1234 confermato: ritiro oggi alle 19:30',
  html: '<!doctype html><html><body><p>Ciao Mario</p></body></html>',
  text: 'Ciao Mario',
  replyTo: 'info@example.it',
  kind: 'customer_receipt',
  tags: [{ name: 'kind', value: 'customer_receipt' }],
  idempotencyKey: 'order-1234/customer_receipt',
};

let mailbox: string;
beforeEach(() => {
  mailbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-mailbox-'));
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  fs.rmSync(mailbox, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Reply = Awaited<ReturnType<ResendLike['emails']['send']>>;
function fakeResend(reply: Reply | (() => Promise<Reply>)) {
  const calls: Array<{ payload: Record<string, unknown>; options: { idempotencyKey?: string; signal?: AbortSignal } | undefined }> = [];
  const client: ResendLike = {
    emails: {
      send: async (payload, options) => {
        calls.push({ payload: payload as unknown as Record<string, unknown>, options });
        return typeof reply === 'function' ? reply() : reply;
      },
    },
  };
  return { client, calls };
}

describe('sendEmail: development mailbox', () => {
  const at = () => new Date('2026-11-08T17:04:05.123Z');

  it('writes the email to .data/mailbox as .html and .txt when no Resend key is set', async () => {
    const result = await sendEmail(message, { mailboxDir: mailbox, now: at });

    expect(result).toEqual({ provider: 'dev', id: '2026-11-08T17-04-05-123Z-customer_receipt' });
    const html = fs.readFileSync(path.join(mailbox, `${result.id}.html`), 'utf8');
    const txt = fs.readFileSync(path.join(mailbox, `${result.id}.txt`), 'utf8');
    expect(html).toBe(message.html);
    expect(txt).toContain('To: mario.rossi@example.com');
    expect(txt).toContain('Subject: Ordine n. 1234 confermato: ritiro oggi alle 19:30');
    expect(txt).toContain('Reply-To: info@example.it');
    expect(txt.endsWith('Ciao Mario\n') || txt.endsWith('Ciao Mario')).toBe(true);
  });

  it('logs a one-line summary', async () => {
    await sendEmail(message, { mailboxDir: mailbox, now: at });
    expect(console.info).toHaveBeenCalledTimes(1);
    const line = String(vi.mocked(console.info).mock.calls[0]![0]);
    expect(line).not.toContain('\n');
    expect(line).toContain('mario.rossi@example.com');
    expect(line).toContain('Ordine n. 1234 confermato');
  });

  it('names files after the time and the kind, safe on Windows (no colons)', async () => {
    const { id } = await sendEmail(message, { mailboxDir: mailbox, now: at });
    expect(id).toMatch(/^[A-Za-z0-9_.-]+$/);
  });

  it('falls back to a slug of the subject when no kind is given', async () => {
    const withoutKind: EmailMessage = { ...message };
    delete withoutKind.kind;
    const { id } = await sendEmail(withoutKind, { mailboxDir: mailbox, now: at });
    expect(id).toMatch(/^2026-11-08T17-04-05-123Z-ordine-n-1234-confermato-ritiro/);
  });

  it('never overwrites: two emails in the same millisecond get different files', async () => {
    const a = await sendEmail(message, { mailboxDir: mailbox, now: at });
    const b = await sendEmail(message, { mailboxDir: mailbox, now: at });
    expect(b.id).not.toBe(a.id);
    expect(fs.readdirSync(mailbox)).toHaveLength(4);
  });

  it('creates the folder when it does not exist yet', async () => {
    const nested = path.join(mailbox, 'a', 'b');
    await sendEmail(message, { mailboxDir: nested, now: at });
    expect(fs.readdirSync(nested)).toHaveLength(2);
  });

  it('sends to several recipients and lists them all', async () => {
    const result = await sendEmail({ ...message, to: ['a@example.com', 'b@example.com'] }, { mailboxDir: mailbox, now: at });
    expect(fs.readFileSync(path.join(mailbox, `${result.id}.txt`), 'utf8')).toContain('To: a@example.com, b@example.com');
  });

  it('lives in <project>/.data/mailbox by default', () => {
    expect(defaultMailboxDir()).toBe(path.join(process.cwd(), '.data', 'mailbox'));
  });
});

describe('sendEmail: Resend', () => {
  beforeEach(() => setEnv({ RESEND_API_KEY: 're_test_key', EMAIL_FROM: 'Pizzeria La Brace <ordini@labrace.example>' }));

  it('sends through the client with from, recipients, content, reply-to, tags and an idempotency key', async () => {
    const { client, calls } = fakeResend({ data: { id: 're_123' }, error: null, headers: null });
    const result = await sendEmail(message, { resend: client });

    expect(result).toEqual({ provider: 'resend', id: 're_123' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.payload).toEqual({
      from: 'Pizzeria La Brace <ordini@labrace.example>',
      to: 'mario.rossi@example.com',
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: 'info@example.it',
      tags: [{ name: 'kind', value: 'customer_receipt' }],
    });
    expect(calls[0]!.options?.idempotencyKey).toBe('order-1234/customer_receipt');
  });

  it('prefers Resend over the dev mailbox whenever a key is set', async () => {
    const { client } = fakeResend({ data: { id: 're_1' }, error: null, headers: null });
    const result = await sendEmail(message, { resend: client, mailboxDir: mailbox });
    expect(result.provider).toBe('resend');
    expect(fs.readdirSync(mailbox)).toEqual([]);
  });

  it('treats the error field of the response as a failure (the SDK does not throw)', async () => {
    const { client } = fakeResend({
      data: null,
      error: { name: 'validation_error', message: 'Invalid `to` field', statusCode: 422 },
      headers: null,
    });
    const failure = await sendEmail(message, { resend: client }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(EmailSendError);
    expect(failure).toMatchObject({ code: 'validation_error', statusCode: 422 });
    expect((failure as Error).message).toContain('Invalid `to` field');
  });

  it('wraps an exception thrown by the client', async () => {
    const client: ResendLike = {
      emails: {
        send: async () => {
          throw new Error('socket hang up');
        },
      },
    };
    const failure = await sendEmail(message, { resend: client }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(EmailSendError);
    expect((failure as Error).message).toContain('socket hang up');
  });

  it('rejects a response that has neither an error nor an id', async () => {
    const { client } = fakeResend({ data: null, error: null, headers: null });
    await expect(sendEmail(message, { resend: client })).rejects.toBeInstanceOf(EmailSendError);
  });

  it('gives up after the timeout instead of hanging', async () => {
    const client: ResendLike = { emails: { send: () => new Promise(() => {}) } };
    const failure = await sendEmail(message, { resend: client, timeoutMs: 20 }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(EmailSendError);
    expect(failure).toMatchObject({ code: 'timeout' });
  });

  it('adds nothing optional when the message has none', async () => {
    const { client, calls } = fakeResend({ data: { id: 're_2' }, error: null, headers: null });
    await sendEmail({ to: 'a@example.com', subject: 'Ciao', html: '<p>x</p>', text: 'x' }, { resend: client });
    expect(Object.keys(calls[0]!.payload).sort()).toEqual(['from', 'html', 'subject', 'text', 'to']);
    expect(calls[0]!.options?.idempotencyKey).toBeUndefined();
  });

  it('keeps tags within what Resend accepts (ASCII letters, digits, underscore, dash)', async () => {
    const { client, calls } = fakeResend({ data: { id: 're_3' }, error: null, headers: null });
    await sendEmail({ ...message, tags: [{ name: 'order number', value: 'n. 1234/è' }] }, { resend: client });
    expect(calls[0]!.payload.tags).toEqual([{ name: 'order_number', value: 'n__1234__' }]);
  });
});

describe('sendEmail: Resend over the wire (fetch stubbed, no network)', () => {
  beforeEach(() => setEnv({ RESEND_API_KEY: 're_test_key', EMAIL_FROM: 'Pizzeria La Brace <ordini@labrace.example>' }));

  it('uses the real SDK: POST /emails with bearer key, idempotency key and the snake_case JSON body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 're_wire_1' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEmail(message);

    expect(result).toEqual({ provider: 'resend', id: 're_wire_1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { headers: Headers }];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.get('authorization')).toBe('Bearer re_test_key');
    expect(init.headers.get('idempotency-key')).toBe('order-1234/customer_receipt');
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: 'Pizzeria La Brace <ordini@labrace.example>',
      to: 'mario.rossi@example.com',
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: 'info@example.it',
      tags: [{ name: 'kind', value: 'customer_receipt' }],
    });
  });

  it('turns an HTTP error body into an EmailSendError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ name: 'invalid_from_address', message: 'Domain not verified', statusCode: 403 }), { status: 403 })),
    );
    const failure = await sendEmail(message).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(EmailSendError);
    expect(failure).toMatchObject({ code: 'invalid_from_address' });
    expect((failure as Error).message).toContain('Domain not verified');
  });

  it('turns a network failure into an EmailSendError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    await expect(sendEmail(message)).rejects.toBeInstanceOf(EmailSendError);
  });
});

describe('sendEmail: the sender address', () => {
  it('outside production falls back to the Resend sandbox sender', async () => {
    setEnv({ RESEND_API_KEY: 're_test_key' });
    const { client, calls } = fakeResend({ data: { id: 're_4' }, error: null, headers: null });
    await sendEmail(message, { resend: client });
    expect(calls[0]!.payload.from).toBe('Pizzeria <onboarding@resend.dev>');
  });

  it('in production a missing EMAIL_FROM is a hard configuration error and nothing is sent', async () => {
    setEnv({ NODE_ENV: 'production', RESEND_API_KEY: 're_live_key' });
    const { client, calls } = fakeResend({ data: { id: 're_5' }, error: null, headers: null });
    await expect(sendEmail(message, { resend: client })).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(calls).toHaveLength(0);
  });

  it('treats a Vercel production deployment as production too', async () => {
    setEnv({ VERCEL_ENV: 'production', RESEND_API_KEY: 're_live_key' });
    await expect(sendEmail(message, { resend: fakeResend({ data: { id: 'x' }, error: null, headers: null }).client })).rejects.toBeInstanceOf(
      EmailNotConfiguredError,
    );
  });

  it('ignores a blank EMAIL_FROM', async () => {
    setEnv({ NODE_ENV: 'production', RESEND_API_KEY: 're_live_key', EMAIL_FROM: '   ' });
    await expect(sendEmail(message, { resend: fakeResend({ data: { id: 'x' }, error: null, headers: null }).client })).rejects.toBeInstanceOf(
      EmailNotConfiguredError,
    );
  });
});

describe('sendEmail: not configured', () => {
  it('refuses in production without a key, and says what to set', async () => {
    setEnv({ NODE_ENV: 'production' });
    const failure = await sendEmail(message, { mailboxDir: mailbox }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(EmailNotConfiguredError);
    expect((failure as Error).message).toContain('RESEND_API_KEY');
    expect(fs.readdirSync(mailbox)).toEqual([]);
  });

  it('refuses when development helpers are switched off', async () => {
    setEnv({ DEV_FEATURES: 'false' });
    await expect(sendEmail(message, { mailboxDir: mailbox })).rejects.toBeInstanceOf(EmailNotConfiguredError);
  });

  it('never uses the dev mailbox on a Vercel production deployment, whatever DEV_FEATURES says', async () => {
    setEnv({ VERCEL_ENV: 'production', DEV_FEATURES: 'true' });
    await expect(sendEmail(message, { mailboxDir: mailbox })).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(fs.readdirSync(mailbox)).toEqual([]);
  });
});

describe('sendEmail: input hygiene', () => {
  it('refuses a recipient that smuggles a line break or a second address', async () => {
    for (const to of ['a@example.com\r\nBcc: x@evil.test', 'a@example.com, b@evil.test', 'not-an-address', '']) {
      await expect(sendEmail({ ...message, to }, { mailboxDir: mailbox })).rejects.toBeInstanceOf(EmailSendError);
    }
    expect(fs.readdirSync(mailbox)).toEqual([]);
  });

  it('refuses a reply-to with a line break', async () => {
    await expect(sendEmail({ ...message, replyTo: 'a@example.com\nBcc: x@evil.test' }, { mailboxDir: mailbox })).rejects.toBeInstanceOf(
      EmailSendError,
    );
  });

  it('keeps the subject on one line', async () => {
    setEnv({ RESEND_API_KEY: 're_test_key', EMAIL_FROM: 'A <a@labrace.example>' });
    const { client, calls } = fakeResend({ data: { id: 're_6' }, error: null, headers: null });
    await sendEmail({ ...message, subject: 'Ciao\r\nBcc: x@evil.test' }, { resend: client });
    expect(calls[0]!.payload.subject).toBe('Ciao Bcc: x@evil.test');
  });
});
