const express    = require('express');
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
require('dotenv').config();

const app = express();
const JWT_SECRET   = process.env.JWT_SECRET   || 'secret_kelas_2024';
const ADMIN_PASS   = process.env.ADMIN_PASSWORD || 'admin2025';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const limiter      = rateLimit({ windowMs: 15*60*1000, max: 200 });
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 15,
  message: { error: 'Terlalu banyak percobaan. Coba lagi nanti.' } });
app.use('/api/', limiter);

// ─── DB POOL ─────────────────────────────────────────────────
const db = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             process.env.DB_PORT     || 3306,
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_NAME     || 'secret_notes',
  waitForConnections: true,
  connectionLimit:  10,
});

// ─── HELPERS ─────────────────────────────────────────────────
async function getSetting(key) {
  try {
    const [rows] = await db.query(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
    return rows[0]?.setting_value ?? null;
  } catch (err) {
    // Tabel app_settings belum ada — jalankan migrate.sql
    console.error('getSetting error (tabel belum ada?):', err.message);
    return null;
  }
}
async function setSetting(key, value) {
  await db.query(
    'INSERT INTO app_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?',
    [key, value, value]);
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────
function authUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token tidak valid atau expired' }); }
}
function authAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Akses ditolak' });
    req.user = decoded; next();
  } catch { res.status(401).json({ error: 'Token tidak valid' }); }
}

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

// Admin login
app.post('/api/auth/admin', loginLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password diperlukan' });
  if (password !== ADMIN_PASS) return res.status(401).json({ error: 'Password admin salah' });
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// Cek apakah nama sudah terdaftar & apakah sudah setup password
app.get('/api/auth/check/:name', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT is_setup FROM users WHERE name = ?', [req.params.name]);
    if (!rows.length) return res.status(404).json({ error: 'Nama tidak ditemukan' });
    res.json({ is_setup: rows[0].is_setup === 1 });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Setup password pertama kali (user belum punya password)
app.post('/api/auth/setup', loginLimiter, async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Nama dan password diperlukan' });
  if (password.length < 4) return res.status(400).json({ error: 'Password minimal 4 karakter' });
  try {
    const [rows] = await db.query('SELECT id, is_setup FROM users WHERE name = ?', [name]);
    if (!rows.length) return res.status(404).json({ error: 'Nama tidak ditemukan' });
    if (rows[0].is_setup) return res.status(409).json({ error: 'Password sudah pernah dibuat' });
    const hash = await bcrypt.hash(password, 12);
    await db.query(
      'UPDATE users SET password_hash=?, plain_password=?, is_setup=1 WHERE name=?',
      [hash, password, name]);
    const token = jwt.sign({ name, role: 'user' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, name });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Login normal
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Nama dan password diperlukan' });
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE name = ?', [name]);
    if (!rows.length) return res.status(401).json({ error: 'Nama atau password salah' });
    const user = rows[0];
    if (!user.is_setup) return res.status(403).json({ error: 'Kamu belum membuat password. Daftar dulu.' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Nama atau password salah' });
    const token = jwt.sign({ name: user.name, role: 'user' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, name: user.name });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC ROUTES — harus di atas route authUser
// ═══════════════════════════════════════════════════════════════

// Semua nama user (untuk dropdown login) — PUBLIK, tanpa auth
// PENTING: harus didaftarkan SEBELUM app.get('/api/users', authUser, ...)
app.get('/api/users/all-names', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT name, is_setup FROM users ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('all-names error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Status fase (publik)
app.get('/api/settings/phases', async (req, res) => {
  try {
    const send = await getSetting('phase_send');
    const read = await getSetting('phase_read');
    res.json({ phase_send: send ?? 'open', phase_read: read ?? 'closed' });
  } catch (err) {
    console.error('phases error:', err.message);
    // Jika tabel belum ada, kembalikan default daripada crash
    res.json({ phase_send: 'open', phase_read: 'closed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// USER ROUTES
// ═══════════════════════════════════════════════════════════════

// Daftar user lain untuk dropdown kirim
app.get('/api/users', authUser, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT name FROM users WHERE name != ? ORDER BY name', [req.user.name]);
    res.json(rows.map(r => r.name));
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Inbox
app.get('/api/messages/inbox', authUser, async (req, res) => {
  try {
    // Cek fase baca
    const phase = await getSetting('phase_read');
    if (phase !== null && phase !== 'open')
      return res.status(403).json({ error: 'Fase pembacaan belum dibuka oleh admin.' });
    const [rows] = await db.query(
      'SELECT id, ciphertext, created_at FROM messages WHERE recipient_name = ? ORDER BY created_at DESC',
      [req.user.name]);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Sent list
app.get('/api/messages/sent', authUser, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT DISTINCT recipient_name FROM messages WHERE sender_name = ?', [req.user.name]);
    res.json(rows.map(r => r.recipient_name));
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Recipient key (untuk enkripsi di client)
app.get('/api/messages/recipient-key/:name', authUser, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT plain_password FROM users WHERE name = ?', [req.params.name]);
    if (!rows.length) return res.status(404).json({ error: 'User tidak ditemukan' });
    if (!rows[0].plain_password) return res.status(400).json({ error: 'Penerima belum setup password' });
    res.json({ key: rows[0].plain_password });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Kirim pesan
app.post('/api/messages/send', authUser, async (req, res) => {
  const { recipient_name, ciphertext } = req.body;
  if (!recipient_name || !ciphertext) return res.status(400).json({ error: 'Data tidak lengkap' });
  if (recipient_name === req.user.name) return res.status(400).json({ error: 'Tidak bisa kirim ke diri sendiri' });
  try {
    // Cek fase kirim
    const phase = await getSetting('phase_send');
    if (phase !== null && phase !== 'open')
      return res.status(403).json({ error: 'Fase pengisian sudah ditutup oleh admin.' });
    const [users] = await db.query('SELECT id FROM users WHERE name = ?', [recipient_name]);
    if (!users.length) return res.status(404).json({ error: 'Penerima tidak ditemukan' });
    // Cek duplikat
    const [existing] = await db.query(
      'SELECT id FROM messages WHERE sender_name = ? AND recipient_name = ?',
      [req.user.name, recipient_name]);
    if (existing.length) return res.status(409).json({
      error: `Kamu sudah mengirim pesan ke ${recipient_name}` });
    await db.query(
      'INSERT INTO messages (sender_name, recipient_name, ciphertext) VALUES (?,?,?)',
      [req.user.name, recipient_name, ciphertext]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════

// Semua user + stats
app.get('/api/admin/users', authAdmin, async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT u.id, u.name, u.is_setup, u.created_at,
        (SELECT COUNT(*) FROM messages WHERE recipient_name = u.name) AS received,
        (SELECT COUNT(*) FROM messages WHERE sender_name   = u.name) AS sent
      FROM users u ORDER BY u.name`);
    res.json(users);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Tambah user (nama saja, tanpa password)
app.post('/api/admin/users', authAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama diperlukan' });
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE name = ?', [name.trim()]);
    if (existing.length) return res.status(409).json({ error: 'Nama sudah terdaftar' });
    await db.query('INSERT INTO users (name) VALUES (?)', [name.trim()]);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Lihat password user
app.get('/api/admin/users/:name/password', authAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT plain_password, is_setup FROM users WHERE name = ?', [req.params.name]);
    if (!rows.length) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ password: rows[0].plain_password, is_setup: rows[0].is_setup });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Reset password (admin reset, user harus setup ulang)
app.put('/api/admin/users/:name/reset-password', authAdmin, async (req, res) => {
  const { name } = req.params;
  try {
    await db.query(
      'UPDATE users SET password_hash=NULL, plain_password=NULL, is_setup=0 WHERE name=?', [name]);
    res.json({ success: true, message: 'Password direset. User harus setup ulang.' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Hapus user
app.delete('/api/admin/users/:name', authAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM messages WHERE sender_name=? OR recipient_name=?',
      [req.params.name, req.params.name]);
    const [result] = await db.query('DELETE FROM users WHERE name=?', [req.params.name]);
    if (!result.affectedRows) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Semua pesan (metadata + preview ciphertext)
app.get('/api/admin/messages', authAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, sender_name, recipient_name, LEFT(ciphertext,40) AS preview, created_at FROM messages ORDER BY created_at DESC');
    res.json(rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Get settings fase
app.get('/api/admin/settings', authAdmin, async (req, res) => {
  try {
    const send = await getSetting('phase_send');
    const read = await getSetting('phase_read');
    res.json({ phase_send: send, phase_read: read });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Update settings fase
app.put('/api/admin/settings', authAdmin, async (req, res) => {
  const { phase_send, phase_read } = req.body;
  try {
    if (phase_send !== undefined) await setSetting('phase_send', phase_send === 'open' ? 'open' : 'closed');
    if (phase_read !== undefined) await setSetting('phase_read', phase_read === 'open' ? 'open' : 'closed');
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Backup logs
app.get('/api/admin/backup-logs', authAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 30');
    res.json(rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// Trigger backup manual
app.post('/api/admin/backup', authAdmin, async (req, res) => {
  try {
    const { exec } = require('child_process');
    exec('node ' + path.join(__dirname, 'backup.js'));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CRON backup tiap hari 02.00 WIB ─────────────────────────
const cron = require('node-cron');
cron.schedule('0 2 * * *', () => {
  const { exec } = require('child_process');
  exec('node ' + path.join(__dirname, 'backup.js'));
}, { timezone: 'Asia/Jakarta' });

// ─── CATCH ALL ────────────────────────────────────────────────
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✓ Server running on http://localhost:${PORT}`));
module.exports = app;
