// Share payload codec (spec 11.1, 11.3, 11.4; I-08; M5-01).
//
// payload = base64url( DEFLATE( UTF-8 JSON of the envelope ) ), no padding.
//
// Decoding enforces both byte budgets before anything is parsed. The encoded size is checked before
// decoding, and inflation is streamed and aborted as soon as the output passes the budget, so a small
// hostile payload cannot expand into memory ("zip bomb"). Then: strict UTF-8, JSON, forbidden keys and
// depth, and the envelope schema. Nothing is evaluated.
import { LIMITS } from '../domain/limits.js';
import { inspectJson } from '../domain/validation.js';
import { checkEnvelope } from './envelope.js';

export const SHARE_VERSION = '1';

export const DECODE_ERRORS = Object.freeze({
  'too-large': 'This link is larger than the app opens, so it was not read.',
  'bad-encoding': 'This link is damaged or cut short, so it was not read. Links can be shortened by messaging apps.',
  'bad-compression': 'This link is damaged or cut short, so it was not read.',
  'too-big-when-opened': 'This link expands to more than the app allows, so it was not opened.',
  'not-text': 'This link does not hold readable text, so it was not opened.',
  'not-json': 'This link does not hold a chart, so it was not opened.',
  'forbidden-key': 'This link contains a reserved key name that is not allowed, so it was not opened.',
  'too-deep': 'This link is nested more deeply than allowed, so it was not opened.',
  'not-a-chart': 'This link does not hold a chart this version can open.',
  'unsupported': 'This link was made by a different version of the app, so it was not opened.',
  'unavailable': 'This browser cannot open links like this one.',
});

const fail = (code, problems = []) => ({ ok: false, error: { code, message: DECODE_ERRORS[code], problems } });

/** base64url without padding. */
export function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Strict: only the 64 base64url characters, and a length that can be real. Returns null if invalid. */
export function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((text.length + 3) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const streamsAvailable = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** A stream that yields the bytes once. Used instead of Blob.stream(), which not every environment has. */
const sourceOf = (bytes) => new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });

async function deflate(bytes) {
  const stream = sourceOf(bytes).pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Inflate with a budget. Reads chunk by chunk and cancels the stream as soon as the output would pass
 * `maxBytes`, so memory use stays bounded whatever the input claims.
 * @returns {Promise<{ ok: true, bytes: Uint8Array } | { ok: false, code: 'too-big-when-opened' | 'bad-compression' }>}
 */
export async function inflateWithBudget(bytes, maxBytes) {
  const reader = sourceOf(bytes).pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, code: 'too-big-when-opened' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, code: 'bad-compression' };
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return { ok: true, bytes: out };
}

/**
 * Envelope to payload text (without the version prefix).
 * @returns {Promise<{ ok: true, payload: string } | { ok: false, error: { code: string, message: string } }>}
 */
export async function encodePayload(envelope) {
  if (!streamsAvailable()) return fail('unavailable');
  const checked = checkEnvelope(envelope);
  if (!checked.ok) return fail('not-a-chart', checked.problems);
  const json = new TextEncoder().encode(JSON.stringify(checked.envelope));
  if (json.length > LIMITS.shareDecompressedBytes) return fail('too-big-when-opened');
  const payload = toBase64Url(await deflate(json));
  if (payload.length > LIMITS.shareEncodedBytes) return fail('too-large');
  return { ok: true, payload };
}

/**
 * Payload text to a validated envelope. Every failure is a plain code and message; nothing throws.
 * @param {string} payload  Without the version prefix.
 * @param {{ maxEncoded?: number, maxDecoded?: number }} [budget]
 */
export async function decodePayload(payload, { maxEncoded = LIMITS.shareEncodedBytes, maxDecoded = LIMITS.shareDecompressedBytes } = {}) {
  if (!streamsAvailable()) return fail('unavailable');
  if (typeof payload !== 'string' || payload.length > maxEncoded) return fail('too-large');
  const bytes = fromBase64Url(payload);
  if (bytes === null || bytes.length === 0) return fail('bad-encoding');
  const inflated = await inflateWithBudget(bytes, maxDecoded);
  if (!inflated.ok) return fail(inflated.code);
  let json;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(inflated.bytes);
  } catch {
    return fail('not-text');
  }
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    return fail('not-json');
  }
  const inspected = inspectJson(value);
  if (!inspected.ok) return fail(inspected.error.code, inspected.error.problems);
  const checked = checkEnvelope(value);
  if (!checked.ok) return fail('not-a-chart', checked.problems);
  return { ok: true, envelope: checked.envelope };
}
