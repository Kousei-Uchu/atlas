// Locked backup: a full backup encrypted with a password (M8-04, D-071). See docs/decisions/0031-locked-backup.md
// for what this does and does not protect against.
//
// Everything runs on this device with the browser's own Web Crypto. No password, key or plaintext is ever
// stored or sent anywhere. The plaintext is exactly the ordinary backup text, so the same validation gate (I-08),
// size limit and import-as-new rule (I-12) apply after unlocking.
//
//   Key:     PBKDF2 with SHA-256, a fresh random 16-byte salt, 600,000 rounds, from the NFKC-normalised password.
//   Cipher:  AES-256-GCM with a fresh random 12-byte nonce.
//   Binding: the format name, version and key settings are authenticated as additional data, so changing any
//            of them makes decryption fail instead of quietly using other settings.
//   Reading: untrusted. Strict shape, only the one algorithm pair, rounds within fixed bounds (so a file cannot
//            make the browser work for minutes), exact salt and nonce sizes, and a size limit before anything runs.
import { z } from 'zod';
import { LIMITS } from '../domain/limits.js';
import { failure, parseJsonText } from '../domain/validation.js';

export const LOCKED_FORMAT = 'atlas-locked-backup';
export const LOCKED_FORMAT_VERSION = 1;
export const KDF_NAME = 'PBKDF2-SHA256';
export const CIPHER_NAME = 'AES-256-GCM';
export const KDF_ROUNDS = 600_000;
export const MIN_ROUNDS = 300_000;
export const MAX_ROUNDS = 2_000_000;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;

/** A locked file is the backup text, encrypted and written in base64, plus a small header. */
export const MAX_LOCKED_FILE_BYTES = Math.ceil(((LIMITS.backupFileBytes + GCM_TAG_BYTES) * 4) / 3) + 4096;

export const WRONG_PASSWORD_MESSAGE = 'That password did not unlock this file, or the file has been changed.';

const b64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);
const headerSchema = z.strictObject({
  format: z.literal(LOCKED_FORMAT),
  formatVersion: z.literal(LOCKED_FORMAT_VERSION),
  kdf: z.strictObject({
    name: z.literal(KDF_NAME),
    rounds: z.number().int().min(MIN_ROUNDS).max(MAX_ROUNDS),
    salt: b64,
  }),
  cipher: z.strictObject({ name: z.literal(CIPHER_NAME), nonce: b64 }),
  data: b64,
});

// ---- small helpers ----

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text) {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Whether this browser page can do the encryption (Web Crypto needs a secure page such as https or localhost). */
export function canLock() {
  return typeof globalThis.crypto?.subtle?.importKey === 'function' && typeof globalThis.crypto.getRandomValues === 'function';
}

/** @returns {{ ok: true } | { ok: false, message: string }} */
export function checkPassword(password) {
  const length = [...password.normalize('NFKC')].length;
  if (length < MIN_PASSWORD_LENGTH) return { ok: false, message: `Use at least ${MIN_PASSWORD_LENGTH} characters. A few words in a row works well.` };
  if (length > MAX_PASSWORD_LENGTH) return { ok: false, message: `Use at most ${MAX_PASSWORD_LENGTH} characters.` };
  return { ok: true };
}

const additionalData = (kdf) => new TextEncoder().encode(`${LOCKED_FORMAT}|${LOCKED_FORMAT_VERSION}|${KDF_NAME}|${kdf.rounds}|${kdf.salt}|${CIPHER_NAME}`);

async function deriveKey(password, salt, rounds) {
  const material = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---- lock ----

/**
 * Encrypt backup text with a password.
 * @param {string} backupText the ordinary backup file contents
 * @param {string} password
 * @param {{ rounds?: number }} [options] `rounds` is for tests only and is held to the same bounds
 * @returns {Promise<{ ok: true, text: string } | { ok: false, error: { code: string, message: string, problems: string[] } }>}
 */
export async function lockBackup(backupText, password, { rounds = KDF_ROUNDS } = {}) {
  if (!canLock()) return failure('crypto-unavailable');
  const checked = checkPassword(password);
  if (!checked.ok) return failure('password-too-weak', [checked.message]);
  if (rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) return failure('schema-invalid', ['key settings out of range']);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const kdf = { name: KDF_NAME, rounds, salt: toBase64(salt) };
  try {
    const key = await deriveKey(password, salt, rounds);
    const sealed = new Uint8Array(await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: additionalData(kdf), tagLength: GCM_TAG_BYTES * 8 },
      key,
      new TextEncoder().encode(backupText),
    ));
    const file = { format: LOCKED_FORMAT, formatVersion: LOCKED_FORMAT_VERSION, kdf, cipher: { name: CIPHER_NAME, nonce: toBase64(nonce) }, data: toBase64(sealed) };
    return { ok: true, text: JSON.stringify(file, null, 2) };
  } catch {
    return failure('crypto-unavailable');
  }
}

// ---- unlock ----

/** Cheap check that a file's text is a locked backup, using the same untrusted-input gate as every other file. */
export function looksLocked(text) {
  const parsed = parseJsonText(text, { maxBytes: MAX_LOCKED_FILE_BYTES });
  return parsed.ok && parsed.value !== null && typeof parsed.value === 'object' && parsed.value.format === LOCKED_FORMAT;
}

/**
 * Read a locked file's header without any password. Never throws.
 * @returns {{ ok: true, header: z.infer<typeof headerSchema> } | ReturnType<typeof failure>}
 */
export function readLockedHeader(text) {
  const parsed = parseJsonText(text, { maxBytes: MAX_LOCKED_FILE_BYTES });
  if (!parsed.ok) return parsed;
  const raw = parsed.value;
  if (raw === null || typeof raw !== 'object' || raw.format !== LOCKED_FORMAT) return failure('wrong-format');
  if (typeof raw.formatVersion === 'number' && raw.formatVersion > LOCKED_FORMAT_VERSION) return failure('newer-version');
  const header = headerSchema.safeParse(raw);
  if (!header.success) return failure('schema-invalid', ['The locked file is not in a form this version can read.']);
  const salt = fromBase64(header.data.kdf.salt);
  const nonce = fromBase64(header.data.cipher.nonce);
  const data = fromBase64(header.data.data);
  if (!salt || salt.length !== SALT_BYTES || !nonce || nonce.length !== NONCE_BYTES || !data || data.length < GCM_TAG_BYTES) {
    return failure('schema-invalid', ['The locked file is not in a form this version can read.']);
  }
  if (data.length - GCM_TAG_BYTES > LIMITS.backupFileBytes) return failure('file-too-large');
  return { ok: true, header: header.data, parts: { salt, nonce, data } };
}

/**
 * Decrypt a locked file. A wrong password and a changed file give the same answer, on purpose.
 * @returns {Promise<{ ok: true, text: string } | ReturnType<typeof failure>>}
 */
export async function unlockBackup(lockedText, password) {
  if (!canLock()) return failure('crypto-unavailable');
  const read = readLockedHeader(lockedText);
  if (!read.ok) return read;
  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH * 4) return failure('wrong-password');
  try {
    const key = await deriveKey(password, read.parts.salt, read.header.kdf.rounds);
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: read.parts.nonce, additionalData: additionalData(read.header.kdf), tagLength: GCM_TAG_BYTES * 8 },
      key,
      read.parts.data,
    );
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(plain) };
  } catch {
    return failure('wrong-password');
  }
}
