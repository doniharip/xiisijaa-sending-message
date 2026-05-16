/**
 * backup.js — Backup MySQL ke Telegram
 *
 * Setup:
 * 1. Buka Telegram → cari @BotFather → /newbot → ikuti instruksi → copy Bot Token
 * 2. Kirim pesan apapun ke bot kamu
 * 3. Buka https://api.telegram.org/bot<TOKEN>/getUpdates → copy "id" dari "chat"
 * 4. Set TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di Railway Variables
 */

const { Readable } = require('stream');
const path  = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── DB CONNECTION ────────────────────────────────────────────
async function getDb() {
  return mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT  || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

// ─── GENERATE SQL DUMP ────────────────────────────────────────
async function generateSqlDump() {
  const db     = await getDb();
  const lines  = [];
  const tables = ['users', 'messages', 'class_messages', 'app_settings', 'backup_logs'];

  lines.push(`-- Pesan Rahasia Kelas — Database Backup`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Database: ${process.env.DB_NAME}`);
  lines.push('');
  lines.push('SET FOREIGN_KEY_CHECKS=0;');
  lines.push('');

  for (const table of tables) {
    try {
      const [exists] = await db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema=? AND table_name=?`,
        [process.env.DB_NAME, table]);
      if (!exists.length) continue;

      const [[createResult]] = await db.query(`SHOW CREATE TABLE \`${table}\``);
      lines.push(`-- ── Table: ${table} ──`);
      lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      lines.push(createResult['Create Table'] + ';');
      lines.push('');

      const [rows] = await db.query(`SELECT * FROM \`${table}\``);
      if (rows.length) {
        const cols   = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
        const escVal = v => {
          if (v === null) return 'NULL';
          if (typeof v === 'number') return v;
          if (v instanceof Date) return `'${v.toISOString().slice(0,19).replace('T',' ')}'`;
          return `'${String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'"  ).replace(/\n/g,'\\n')}'`;
        };
        const vals = rows.map(r => `(${Object.values(r).map(escVal).join(', ')})`);
        for (let i = 0; i < vals.length; i += 100) {
          lines.push(`INSERT INTO \`${table}\` (${cols}) VALUES`);
          lines.push(vals.slice(i, i + 100).join(',\n') + ';');
        }
        lines.push('');
      }
    } catch (err) {
      lines.push(`-- Skipped ${table}: ${err.message}`);
      lines.push('');
    }
  }

  lines.push('SET FOREIGN_KEY_CHECKS=1;');
  await db.end();
  return lines.join('\n');
}

// ─── KIRIM KE TELEGRAM ────────────────────────────────────────
async function sendToTelegram(content, fileName) {
  const token  = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token)  throw new Error('TELEGRAM_BOT_TOKEN belum diset di Railway Variables');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID belum diset di Railway Variables');

  // Pakai FormData + fetch (built-in Node 18) — menghindari masalah karakter di path
  const { Blob } = require('buffer');
  const fileBlob = new Blob([content], { type: 'text/plain' });
  const caption  = `Backup Database\n${new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}\n${(Buffer.byteLength(content)/1024).toFixed(1)} KB`;

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption);
  form.append('document', fileBlob, fileName);

  const url = `https://api.telegram.org/bot${encodeURIComponent(token).replace(/%3A/g,':')}/sendDocument`;
  const res  = await fetch(url, { method: 'POST', body: form });
  const json = await res.json();

  if (!json.ok) throw new Error(`Telegram error: ${json.description}`);
  return `https://t.me/${chatId}/${json.result.message_id}`;
}

// ─── LOG BACKUP ───────────────────────────────────────────────
async function logBackup(status, fileName, url, errorMsg = null) {
  try {
    const db = await getDb();
    await db.execute(
      'INSERT INTO backup_logs (status, file_name, drive_url, error_msg) VALUES (?, ?, ?, ?)',
      [status, fileName, url, errorMsg]);
    await db.end();
  } catch (e) { console.error('Gagal log backup:', e.message); }
}

// ─── MAIN ─────────────────────────────────────────────────────
async function runBackup() {
  const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `backup_${ts}.sql`;

  console.log(`[backup] Memulai — ${ts}`);
  try {
    console.log('[backup] Mengambil data...');
    const sql = await generateSqlDump();
    console.log(`[backup] Dump selesai — ${(sql.length / 1024).toFixed(1)} KB`);

    console.log('[backup] Mengirim ke Telegram...');
    const url = await sendToTelegram(sql, fileName);
    console.log(`[backup] Terkirim!`);

    await logBackup('success', fileName, url);
    return { success: true, fileName };
  } catch (err) {
    console.error('[backup] Gagal:', err.message);
    await logBackup('failed', fileName, null, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { runBackup };
if (require.main === module) runBackup();
