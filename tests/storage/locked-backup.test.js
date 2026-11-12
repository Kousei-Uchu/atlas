import { describe, expect, it } from 'vitest';
import {
  CIPHER_NAME, KDF_NAME, KDF_ROUNDS, LOCKED_FORMAT, MAX_LOCKED_FILE_BYTES, MIN_ROUNDS, WRONG_PASSWORD_MESSAGE,
  checkPassword, fromBase64, lockBackup, looksLocked, readLockedHeader, toBase64, unlockBackup,
} from '../../src/storage/locked-backup.js';
import { parseBackupText, serialiseBackup } from '../../src/storage/backup.js';
import { createBlankProfile } from '../../src/domain/defaults.js';

const NOW = '2026-11-12T00:00:00.000Z';
const PASSWORD = 'correct horse battery staple';
const profile = () => createBlankProfile({ id: 'prof_a', title: 'Secret title Ωmega', now: NOW });
const plain = () => serialiseBackup(profile(), NOW);
// Test files use the lowest allowed rounds so the suite stays quick; one test checks the real default.
const lock = (text = plain(), password = PASSWORD) => lockBackup(text, password, { rounds: MIN_ROUNDS });
const rewrite = (text, change) => { const o = JSON.parse(text); change(o); return JSON.stringify(o); };

describe('locked backup: lock and unlock', () => {
  it('round-trips to exactly the backup text, which then passes the ordinary backup gate (I-08, I-12)', async () => {
    const locked = await lock();
    expect(locked.ok).toBe(true);
    const opened = await unlockBackup(locked.text, PASSWORD);
    expect(opened).toEqual({ ok: true, text: plain() });
    const parsed = parseBackupText(opened.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.profile.title).toBe('Secret title Ωmega');
  });

  it('writes a fixed, readable header and nothing from the profile in the clear', async () => {
    const { text } = await lock();
    const file = JSON.parse(text);
    expect(Object.keys(file)).toEqual(['format', 'formatVersion', 'kdf', 'cipher', 'data']);
    expect(file.format).toBe(LOCKED_FORMAT);
    expect(file.kdf.name).toBe(KDF_NAME);
    expect(file.cipher.name).toBe(CIPHER_NAME);
    expect(fromBase64(file.kdf.salt)).toHaveLength(16);
    expect(fromBase64(file.cipher.nonce)).toHaveLength(12);
    for (const word of ['Secret', 'title', 'prof_a', 'states', 'categories', 'atlas-backup', PASSWORD]) expect(text).not.toContain(word);
    expect(looksLocked(text)).toBe(true);
    expect(looksLocked(plain())).toBe(false);
  });

  it('uses a new salt and nonce every time, so the same backup never locks to the same file', async () => {
    const a = JSON.parse((await lock()).text);
    const b = JSON.parse((await lock()).text);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.nonce).not.toBe(b.cipher.nonce);
    expect(a.data).not.toBe(b.data);
  });

  it('gives one answer for a wrong password and for a changed file', async () => {
    const { text } = await lock();
    const wrong = await unlockBackup(text, 'not the right one');
    expect(wrong.ok).toBe(false);
    expect(wrong.error.code).toBe('wrong-password');
    expect(wrong.error.message).toBe(WRONG_PASSWORD_MESSAGE);

    const flipped = rewrite(text, (o) => { const bytes = fromBase64(o.data); bytes[bytes.length - 1] ^= 1; o.data = toBase64(bytes); });
    const changed = await unlockBackup(flipped, PASSWORD);
    expect(changed.error.code).toBe('wrong-password');
    expect(changed.error.message).toBe(wrong.error.message);
  });

  it('fails if the key settings are changed, because they are part of what is authenticated', async () => {
    const { text } = await lock();
    const moreRounds = rewrite(text, (o) => { o.kdf.rounds += 1; });
    expect((await unlockBackup(moreRounds, PASSWORD)).error.code).toBe('wrong-password');
    const otherSalt = rewrite(text, (o) => { const s = fromBase64(o.kdf.salt); s[0] ^= 1; o.kdf.salt = toBase64(s); });
    expect((await unlockBackup(otherSalt, PASSWORD)).error.code).toBe('wrong-password');
  });

  it('is case and space exact, and treats the same text in different Unicode forms as the same password', async () => {
    const { text } = await lock(plain(), 'Pass phrase 123 café');
    expect((await unlockBackup(text, 'pass phrase 123 café')).ok).toBe(false);
    expect((await unlockBackup(text, 'Pass phrase 123 café ')).ok).toBe(false);
    expect((await unlockBackup(text, 'Pass phrase 123 café')).ok).toBe(true);
  });

  it('uses the strong default number of rounds', async () => {
    const real = await lockBackup(plain(), PASSWORD);
    expect(JSON.parse(real.text).kdf.rounds).toBe(KDF_ROUNDS);
    expect(KDF_ROUNDS).toBeGreaterThanOrEqual(600_000);
    expect((await unlockBackup(real.text, PASSWORD)).ok).toBe(true);
  });
});

describe('locked backup: passwords', () => {
  it('needs at least 12 characters, counts characters not bytes, and has an upper bound', () => {
    expect(checkPassword('eleven char').ok).toBe(false);
    expect(checkPassword('twelve chars').ok).toBe(true);
    expect(checkPassword('\u{1F600}'.repeat(12)).ok).toBe(true);
    expect(checkPassword('x'.repeat(257)).ok).toBe(false);
  });

  it('refuses to lock with a short password and writes nothing', async () => {
    const r = await lockBackup(plain(), 'short');
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('password-too-weak');
  });

  it('refuses key settings outside the bounds when locking', async () => {
    expect((await lockBackup(plain(), PASSWORD, { rounds: 1 })).ok).toBe(false);
    expect((await lockBackup(plain(), PASSWORD, { rounds: 99_000_000 })).ok).toBe(false);
  });
});

describe('locked backup: reading an untrusted file', () => {
  const header = async () => (await lock()).text;

  it('refuses anything that is not a locked file, without trying any password', async () => {
    expect(readLockedHeader('not json').error.code).toBe('not-json');
    expect(readLockedHeader(plain()).error.code).toBe('wrong-format');
    expect(readLockedHeader('[]').error.code).toBe('wrong-format');
    expect((await unlockBackup('{}', PASSWORD)).error.code).toBe('wrong-format');
  });

  it('refuses a newer version, extra fields, other algorithms and out-of-range rounds before doing any work', async () => {
    const text = await header();
    expect(readLockedHeader(rewrite(text, (o) => { o.formatVersion = 2; })).error.code).toBe('newer-version');
    expect(readLockedHeader(rewrite(text, (o) => { o.extra = 1; })).error.code).toBe('schema-invalid');
    expect(readLockedHeader(rewrite(text, (o) => { o.kdf.name = 'MD5'; })).error.code).toBe('schema-invalid');
    expect(readLockedHeader(rewrite(text, (o) => { o.cipher.name = 'none'; })).error.code).toBe('schema-invalid');
    expect(readLockedHeader(rewrite(text, (o) => { o.kdf.rounds = 2; })).error.code).toBe('schema-invalid');
    expect(readLockedHeader(rewrite(text, (o) => { o.kdf.rounds = 2_000_001; })).error.code).toBe('schema-invalid');
    expect(readLockedHeader(rewrite(text, (o) => { o.kdf.rounds = 'many'; })).error.code).toBe('schema-invalid');
  });

  it('refuses the wrong salt size, nonce size, data size and encoding', async () => {
    const text = await header();
    expect(readLockedHeader(rewrite(text, (o) => { o.kdf.salt = toBase64(new Uint8Array(8)); })).error.code).toBe('schema-invalid');
    expect(readLockedHeader(rewrite(text, (o) => { o.cipher.nonce = toBase64(new Uint8Array(16)); })).error.code).toBe('schema-invalid');
    expect(readLockedHeader(rewrite(text, (o) => { o.data = toBase64(new Uint8Array(4)); })).error.code).toBe('schema-invalid');
    expect(readLockedHeader(rewrite(text, (o) => { o.data = 'not*base64!'; })).error.code).toBe('schema-invalid');
  });

  it('refuses reserved keys and files over the size limit', async () => {
    expect(readLockedHeader('{"format":"atlas-locked-backup","__proto__":{}}').error.code).toBe('forbidden-key');
    expect(readLockedHeader(' '.repeat(MAX_LOCKED_FILE_BYTES + 1)).error.code).toBe('file-too-large');
  });

  it('a wrong-password unlock never returns any plaintext', async () => {
    const r = await unlockBackup(await header(), 'wrong wrong wrong');
    expect(JSON.stringify(r)).not.toContain('Secret');
    expect(r.text).toBeUndefined();
  });
});
