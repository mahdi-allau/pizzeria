import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Resend } from 'resend';
import { type Env, devFeaturesEnabled, getEnv } from '@/env';

/**
 * One function to send an email, three outcomes:
 *  - `RESEND_API_KEY` set                → Resend (sender `EMAIL_FROM`).
 *  - no key, development helpers on      → DEV MAILBOX: the email is written to `<project>/.data/mailbox/` as `.html`
 *                                           and `.txt` so the whole flow can be seen without any account.
 *  - no key, development helpers off     → `EmailNotConfiguredError`: production never silently drops an email.
 * Resend's SDK reports most failures in a `{ data, error }` result instead of throwing; both are turned into an
 * `EmailSendError` here so callers have a single failure path.
 */

export interface EmailTag {
  name: string;
  value: string;
}

export interface EmailMessage {
  /** One address, or several (the pizzeria alert can go to more than one inbox). */
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: EmailTag[];
  /** Short machine name ("customer_receipt"): names the dev-mailbox files. Falls back to a slug of the subject. */
  kind?: string;
  /** Lets Resend drop a duplicate if the same send is retried within 24 hours. */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  provider: 'resend' | 'dev';
  /** Resend's email id, or the dev-mailbox file name (without extension). */
  id: string;
}

/** The slice of the Resend SDK we use; tests (and any other transport) can provide their own. */
export interface ResendLike {
  emails: {
    send(
      payload: ResendPayload,
      options?: { idempotencyKey?: string; signal?: AbortSignal },
    ): Promise<{
      data: { id: string } | null;
      error: { name: string; message: string; statusCode: number | null } | null;
      headers: Record<string, string> | null;
    }>;
  };
}

export interface ResendPayload {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: EmailTag[];
}

export interface SendEmailDeps {
  /** Replaces the real Resend client (tests). When given, it is used even if `RESEND_API_KEY` is unset. */
  resend?: ResendLike;
  /** Where the dev mailbox writes (default `<cwd>/.data/mailbox`). */
  mailboxDir?: string;
  now?: () => Date;
  /** Give up on Resend after this long (default 15 s). */
  timeoutMs?: number;
}

export class EmailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailNotConfiguredError';
  }
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    /** Resend's error name ("validation_error", ...) or one of ours ("timeout", "invalid_message", ...). */
    readonly code?: string,
    readonly statusCode?: number | null,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const SANDBOX_SENDER = 'Pizzeria <onboarding@resend.dev>';

export function defaultMailboxDir(): string {
  return path.join(process.cwd(), '.data', 'mailbox');
}

// ───────────────────────────── validation ─────────────────────────────

/** Deliberately strict about what can smuggle headers (whitespace, commas, angle brackets), lenient about the rest. */
const ADDRESS = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

export function isValidEmailAddress(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS.test(value);
}

function checkAddress(value: unknown, field: string): string {
  if (!isValidEmailAddress(value)) throw new EmailSendError(`Invalid email address in "${field}"`, 'invalid_message');
  return value;
}

/** Tags accept only ASCII letters, digits, underscores and dashes (max 256). */
const cleanTagPart = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);

function validate(message: EmailMessage): EmailMessage {
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  if (recipients.length === 0) throw new EmailSendError('No recipient', 'invalid_message');
  for (const address of recipients) checkAddress(address, 'to');
  if (message.replyTo !== undefined) checkAddress(message.replyTo, 'replyTo');
  return {
    ...message,
    subject: message.subject.replace(/[\r\n]+/g, ' ').trim(),
    ...(message.tags ? { tags: message.tags.map((tag) => ({ name: cleanTagPart(tag.name), value: cleanTagPart(tag.value) })) } : {}),
  };
}

// ───────────────────────────── Resend ─────────────────────────────

function isProduction(env: Env): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

function resolveSender(env: Env): string {
  const configured = env.EMAIL_FROM?.trim();
  if (configured) return configured;
  if (isProduction(env)) {
    throw new EmailNotConfiguredError('EMAIL_FROM is not set. In production it must be a sender on a domain verified in Resend, e.g. "Pizzeria <ordini@yourdomain.it>".');
  }
  return SANDBOX_SENDER;
}

let cachedClient: { key: string; client: ResendLike } | undefined;
function resendClient(apiKey: string): ResendLike {
  if (cachedClient?.key !== apiKey) cachedClient = { key: apiKey, client: new Resend(apiKey) };
  return cachedClient.client;
}

async function sendWithResend(client: ResendLike, payload: ResendPayload, idempotencyKey: string | undefined, timeoutMs: number): Promise<SendEmailResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new EmailSendError(`Resend did not answer within ${timeoutMs} ms`, 'timeout'));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      client.emails.send(payload, { signal: controller.signal, ...(idempotencyKey ? { idempotencyKey } : {}) }),
      timeout,
    ]);
    if (response.error) throw new EmailSendError(`Resend: ${response.error.message}`, response.error.name, response.error.statusCode);
    if (!response.data?.id) throw new EmailSendError('Resend answered without an email id', 'no_id');
    return { provider: 'resend', id: response.data.id };
  } catch (error) {
    if (error instanceof EmailSendError) throw error;
    throw new EmailSendError(`Resend request failed: ${error instanceof Error ? error.message : String(error)}`, 'request_failed');
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────────── dev mailbox ─────────────────────────────

function fileSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

async function writeToMailbox(message: EmailMessage, dir: string, now: Date): Promise<SendEmailResult> {
  await fs.mkdir(dir, { recursive: true });
  // The ISO timestamp has ":" and "." which Windows does not allow in file names.
  const base = `${now.toISOString().replace(/[:.]/g, '-')}-${fileSlug(message.kind ?? message.subject) || 'email'}`;

  let id = base;
  for (let attempt = 2; ; attempt++) {
    try {
      await fs.writeFile(path.join(dir, `${id}.html`), message.html, { flag: 'wx' });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 1000) throw error;
      id = `${base}-${attempt}`;
    }
  }

  const recipients = (Array.isArray(message.to) ? message.to : [message.to]).join(', ');
  const header = [`To: ${recipients}`, `Subject: ${message.subject}`, ...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []), '', ''].join('\n');
  await fs.writeFile(path.join(dir, `${id}.txt`), `${header}${message.text}\n`);

  console.info(`[email:dev] to ${recipients} "${message.subject}" -> ${path.join(dir, `${id}.html`)}`);
  return { provider: 'dev', id };
}

// ───────────────────────────── public API ─────────────────────────────

export async function sendEmail(input: EmailMessage, deps: SendEmailDeps = {}): Promise<SendEmailResult> {
  const message = validate(input);
  const env = getEnv();

  if (env.RESEND_API_KEY || deps.resend) {
    const payload: ResendPayload = {
      from: resolveSender(env),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.tags ? { tags: message.tags } : {}),
    };
    const client = deps.resend ?? resendClient(env.RESEND_API_KEY!);
    return sendWithResend(client, payload, message.idempotencyKey, deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  if (devFeaturesEnabled()) {
    return writeToMailbox(message, deps.mailboxDir ?? defaultMailboxDir(), (deps.now ?? (() => new Date()))());
  }

  throw new EmailNotConfiguredError('Email is not configured: set RESEND_API_KEY (and EMAIL_FROM). The development mailbox is disabled here.');
}
