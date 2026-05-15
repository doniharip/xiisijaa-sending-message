/**
 * crypto.js — AES-256-GCM encryption/decryption + SHA-256 helper
 *
 * Alur enkripsi:
 * 1. Saat user setup password → SHA-256(password) disimpan sebagai key_hash
 *    di DB dan di localStorage sebagai sn_key
 * 2. Saat kirim pesan → server mengirim key_hash penerima → enkripsi AES-GCM
 * 3. Saat baca pesan → dekripsi pakai sn_key dari localStorage
 *
 * Server tidak pernah menyimpan atau melihat plaintext pesan maupun password asli.
 */

// SHA-256 helper — dipakai di app.js saat login/setup
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

const Crypto = (() => {
  const ITERATIONS = 150000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  async function deriveKey(keyMaterial, salt) {
    const imported = await crypto.subtle.importKey(
      'raw', enc.encode(keyMaterial), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
      imported,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(plaintext, keyMaterial, salt) {
    const key = await deriveKey(keyMaterial, salt);
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
    const out = new Uint8Array(iv.byteLength + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), iv.byteLength);
    return btoa(String.fromCharCode(...out));
  }

  async function decrypt(ciphertext, keyMaterial, salt) {
    try {
      const key  = await deriveKey(keyMaterial, salt);
      const data = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
      const iv   = data.slice(0, 12);
      const ct   = data.slice(12);
      const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return dec.decode(pt);
    } catch {
      return null;
    }
  }

  return { encrypt, decrypt };
})();
