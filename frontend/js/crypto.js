/**
 * crypto.js — AES-256-GCM encryption/decryption di sisi client
 * 
 * Kunci diturunkan dari password penerima menggunakan PBKDF2.
 * Server TIDAK pernah melihat plaintext.
 */

const Crypto = (() => {
  const ITERATIONS = 150000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  async function deriveKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(plaintext, password, salt) {
    const key = await deriveKey(password, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
    const combined = new Uint8Array(iv.byteLength + ct.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ct), iv.byteLength);
    return btoa(String.fromCharCode(...combined));
  }

  async function decrypt(ciphertext, password, salt) {
    try {
      const key = await deriveKey(password, salt);
      const data = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
      const iv = data.slice(0, 12);
      const ct = data.slice(12);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return dec.decode(pt);
    } catch {
      return null;
    }
  }

  return { encrypt, decrypt };
})();
