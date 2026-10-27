// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Six-digit book code. The code alone cannot open a book: the browser also
// needs the server's share, which the server releases only after the right code.
import {unlockVaultWithKey} from './vault.mjs';
import {validateCodeStatus, validateCodeOpened, validateCodeSet} from './hosted-bridge.mjs';

export const BOOK_SCOPE = 'personal';
export const LEGACY_SCOPE = 'business';
export const CODE_ITERATIONS = 600000;
export const CODE_ATTEMPTS = 10;
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toB64 = bytes => btoa(String.fromCharCode(...bytes));
const fromB64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export const validCode = code => typeof code === 'string' && /^[0-9]{6}$/.test(code);
const wrapAad = vaultId => encoder.encode(JSON.stringify(['passport-code-wrap-v1', vaultId]));
const bookKey = key => key?.type === 'secret' && key.extractable && key.algorithm?.name === 'AES-GCM' &&
  key.algorithm?.length === 256;

/** PBKDF2 stretches the code; HKDF splits it into the server proof and the local half. */
export async function deriveCode(code, salt, iterations = CODE_ITERATIONS) {
  if (!validCode(code) || !(salt instanceof Uint8Array) || salt.length !== 16 ||
      !Number.isSafeInteger(iterations) || iterations < CODE_ITERATIONS) throw Error('invalid');
  const base = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveBits']);
  const stretched = new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt,
    iterations}, base, 256));
  try {
    const hkdf = await crypto.subtle.importKey('raw', stretched, 'HKDF', false, ['deriveBits']);
    const part = async label => new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256',
      salt, info: encoder.encode(label)}, hkdf, 256));
    return {auth: await part('passport-code-auth-v1'), kekPart: await part('passport-code-kek-v1')};
  } finally { stretched.fill(0); }
}

/** W = HKDF(kekPart || S). Nonextractable; it only wraps and unwraps one book key. */
async function wrappingKey(kekPart, share, vaultId) {
  const material = new Uint8Array(64);
  material.set(kekPart); material.set(share, 32);
  try {
    const hkdf = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(vaultId),
      info: encoder.encode('passport-code-wrap-v1')}, hkdf, {name: 'AES-GCM', length: 256}, false,
      ['encrypt', 'decrypt']);
  } finally { material.fill(0); }
}

/** Everything the server keeps for a new code. The book key leaves only wrapped. */
export async function sealCode(code, key, vaultId, iterations = CODE_ITERATIONS) {
  if (!validCode(code) || !bookKey(key) || typeof vaultId !== 'string' || !uuid.test(vaultId)) throw Error('invalid');
  const salt = crypto.getRandomValues(new Uint8Array(16)), share = crypto.getRandomValues(new Uint8Array(32));
  const {auth, kekPart} = await deriveCode(code, salt, iterations);
  let raw;
  try {
    const wrap = await wrappingKey(kekPart, share, vaultId), nonce = crypto.getRandomValues(new Uint8Array(12));
    raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce,
      additionalData: wrapAad(vaultId), tagLength: 128}, wrap, raw));
    const body = {vaultId, salt: toB64(salt), iterations, auth: toB64(auth), share: toB64(share),
      wrappedKey: {nonce: toB64(nonce), ciphertext: toB64(ciphertext)}};
    if (!validateCodeSet(body)) throw Error('invalid');
    return body;
  } finally { raw?.fill(0); kekPart.fill(0); share.fill(0); auth.fill(0); }
}

/** Unwraps the book key from the server's reply. A wrong share or book fails closed. */
export async function openBookKey(kekPart, opened, vaultId) {
  if (!validateCodeOpened(opened) || opened.vaultId !== vaultId) throw Error('invalid');
  const share = fromB64(opened.share);
  let raw;
  try {
    const wrap = await wrappingKey(kekPart, share, vaultId);
    raw = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromB64(opened.wrappedKey.nonce),
      additionalData: wrapAad(vaultId), tagLength: 128}, wrap, fromB64(opened.wrappedKey.ciphertext)));
    if (raw.length !== 32) throw Error('invalid');
    return await crypto.subtle.importKey('raw', raw, {name: 'AES-GCM'}, true, ['encrypt', 'decrypt']);
  } catch { throw Error('code-unwrap-failed'); }
  finally { raw?.fill(0); share.fill(0); }
}

/** Reads the code status through the host. Null means the host has no code door. */
export async function readCodeStatus(host) {
  try {
    // A host without the code door ignores the message; do not hang the book on it.
    const result = await host.request('code-status', BOOK_SCOPE, {}, {timeout: 2500});
    return validateCodeStatus(result.status) ? result.status : null;
  } catch (error) {
    if (error.message === 'unauthorized') throw error;
    return null;
  }
}
/** A code applies only to the exact saved book it was set for. */
export const codeFits = (status, envelope) => !!status?.hasCode && !!envelope && status.vaultId === envelope.vaultId;

/** One try. Returns the opened book, or a plain reason with the tries left. */
export async function unlockWithCode(host, envelope, code, status = null) {
  if (!envelope) return {ok: false, reason: 'no-book', attemptsLeft: CODE_ATTEMPTS};
  status = status || await readCodeStatus(host);
  if (!status) throw Error('unavailable');
  if (!codeFits(status, envelope)) return {ok: false, reason: 'no-code', attemptsLeft: status.attemptsLeft, status};
  if (status.disabled) return {ok: false, reason: 'disabled', attemptsLeft: 0, status};
  // A malformed code never reaches the server and never uses a try.
  if (!validCode(code)) return {ok: false, reason: 'wrong', attemptsLeft: status.attemptsLeft, status};
  const {auth, kekPart} = await deriveCode(code, fromB64(status.salt), status.iterations);
  try {
    let result;
    try { result = await host.request('code-unlock', BOOK_SCOPE, {auth: toB64(auth)}); }
    catch (error) {
      if (['wrong', 'disabled', 'no-code', 'rate'].includes(error.message))
        return {ok: false, reason: error.message, attemptsLeft: error.attemptsLeft ?? 0};
      throw error;
    }
    let key, opened;
    try {
      key = await openBookKey(kekPart, result.opened, envelope.vaultId);
      opened = await unlockVaultWithKey(envelope, key);
    } catch { return {ok: false, reason: 'no-code', attemptsLeft: CODE_ATTEMPTS}; }
    return {ok: true, key: opened.key, document: opened.document};
  } finally { auth.fill(0); kekPart.fill(0); }
}

/** Sets or replaces the code for an open book. Tries reset on the server. */
export async function setBookCode(host, key, vaultId, code) {
  if (!validCode(code)) return {ok: false, reason: 'invalid'};
  if (!bookKey(key)) return {ok: false, reason: 'locked'};
  const body = await sealCode(code, key, vaultId);
  const result = await host.request('code-set', BOOK_SCOPE, {code: body});
  if (!validateCodeStatus(result.status) || result.status.vaultId !== vaultId) throw Error('unavailable');
  return {ok: true, status: result.status};
}

/** Recovery files stay the backup. Plain reasons, no thrown parse errors. */
export async function readRecoveryFile(file) {
  let value;
  try {
    if (file && typeof file.text === 'function') {
      if (file.size > 64 * 1024) return {ok: false, reason: 'invalid-file'};
      value = JSON.parse(await file.text());
    } else value = file;
  } catch { return {ok: false, reason: 'invalid-file'}; }
  if (value?.format === 'passport-vault-v1') return {ok: false, reason: 'backup-file'};
  if (!value || value.format !== 'passport-recovery-v1' || Object.keys(value).sort().join(',') !== 'format,key,vaultId' ||
      typeof value.vaultId !== 'string' || !uuid.test(value.vaultId) || typeof value.key !== 'string')
    return {ok: false, reason: 'invalid-file'};
  return {ok: true, recovery: value};
}
