/**
 * backup.js — Backup MySQL ke Google Drive tanpa mysqldump
 * Menggunakan query Node.js langsung — kompatibel dengan Railway
 *
 * Setup Google Drive:
 * 1. https://console.cloud.google.com → Enable Google Drive API
 * 2. Buat Service Account → download JSON key
 * 3. Share folder Drive ke email service account
 * 4. Set GDRIVE_FOLDER_ID dan GOOGLE_CREDENTIALS_JSON di Railway Variables
 */

const { google } = require('googleapis');
const { Readable } = require('stream');
const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── DB CONNECTION ────────────────────────────────────────────
async function getDb() {
  return mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

// ─── GENERATE SQL DUMP VIA QUERY ─────────────────────────────
async function generateSqlDump() {
  const db = await getDb();
  const lines = [];
  const ts = new Date().toISOString();

  lines.push(`-- Pesan Rahasia Kelas — Database Backup`);
  lines.push(`-- Generated: ${ts}`);
  lines.push(`-- Database: ${process.env.DB_NAME}`);
  lines.push('');
  lines.push('SET FOREIGN_KEY_CHECKS=0;');
  lines.push('');

  // Daftar tabel yang akan di-backup
  const tables = ['users', 'messages', 'class_messages', 'app_settings', 'backup_logs'];

  for (const table of tables) {
    try {
      // Cek tabel ada
      const [exists] = await db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema=? AND table_name=?`,
        [process.env.DB_NAME, table]
      );
      if (!exists.length) continue;

      // CREATE TABLE statement
      const [[createResult]] = await db.query(`SHOW CREATE TABLE \`${table}\``);
      const createSql = createResult['Create Table'];

      lines.push(`-- ── Table: ${table} ──`);
      lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      lines.push(createSql + ';');
      lines.push('');

      // Data rows
      const [rows] = await db.query(`SELECT * FROM \`${table}\``);
      if (rows.length) {
        const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
        const escVal = v => {
          if (v === null) return 'NULL';
          if (typeof v === 'number') return v;
          if (v instanceof Date) return `'${v.toISOString().slice(0,19).replace('T',' ')}'`;
          return `'${String(v).replace(/\\/g,'\\\\').replace(/'/g, "\\'").replace(/\n/g,'\\n')}'`;
        };
        const valueLines = rows.map(row =>
          `(${Object.values(row).map(escVal).join(', ')})`
        );
        // Batch insert per 100 baris
        for (let i = 0; i < valueLines.length; i += 100) {
          const batch = valueLines.slice(i, i + 100);
          lines.push(`INSERT INTO \`${table}\` (${cols}) VALUES`);
          lines.push(batch.join(',\n') + ';');
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

// ─── UPLOAD KE GOOGLE DRIVE ───────────────────────────────────
async function uploadToDrive(content, fileName) {
  const folderId = process.env.GDRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GDRIVE_FOLDER_ID belum diset');

  // Credentials dari env atau file
  let credentials;
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } else {
    const credPath = path.join(__dirname, '../credentials.json');
    if (!fs.existsSync(credPath)) throw new Error('credentials.json tidak ditemukan');
    credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  // Hapus backup lama dengan nama sama jika ada
  try {
    const existing = await drive.files.list({
      q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of existing.data.files) {
      await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
    }
  } catch {}

  // Upload file baru — supportsAllDrives diperlukan untuk Shared Drive
  const stream = Readable.from([content]);
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: 'text/plain',
    },
    media: {
      mimeType: 'text/plain',
      body: stream,
    },
  });

  return `https://drive.google.com/file/d/${res.data.id}/view`;
}

// ─── LOG BACKUP ───────────────────────────────────────────────
async function logBackup(status, fileName, driveUrl, errorMsg = null) {
  try {
    const db = await getDb();
    await db.execute(
      'INSERT INTO backup_logs (status, file_name, drive_url, error_msg) VALUES (?, ?, ?, ?)',
      [status, fileName, driveUrl, errorMsg]
    );
    await db.end();
  } catch (e) {
    console.error('Gagal log backup:', e.message);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────
async function runBackup() {
  const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `backup_${ts}.sql`;

  console.log(`[backup] Memulai backup — ${ts}`);

  try {
    // 1. Generate SQL dump via query
    console.log('[backup] Mengambil data dari database...');
    const sql = await generateSqlDump();
    console.log(`[backup] Dump selesai — ${(sql.length / 1024).toFixed(1)} KB`);

    // 2. Upload ke Google Drive
    console.log('[backup] Mengupload ke Google Drive...');
    const driveUrl = await uploadToDrive(sql, fileName);
    console.log(`[backup] Upload berhasil: ${driveUrl}`);

    // 3. Log sukses
    await logBackup('success', fileName, driveUrl);
    console.log('[backup] Selesai!');

    return { success: true, fileName, driveUrl };
  } catch (err) {
    console.error('[backup] Gagal:', err.message);
    await logBackup('failed', fileName, null, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { runBackup };

// Jalankan langsung jika dipanggil via CLI: node backup.js
if (require.main === module) runBackup();
