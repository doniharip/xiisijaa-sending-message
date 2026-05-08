/**
 * backup.js — Backup otomatis MySQL ke Google Drive
 * 
 * Cara setup Google Drive API:
 * 1. Buka https://console.cloud.google.com
 * 2. Buat project baru → Enable "Google Drive API"
 * 3. Buat Service Account → Download JSON key
 * 4. Simpan JSON key sebagai credentials.json di folder ini
 * 5. Buat folder di Google Drive → klik kanan → Share → tambahkan email service account
 * 6. Copy folder ID dari URL Google Drive ke GDRIVE_FOLDER_ID di .env
 */

const { exec } = require('child_process');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BACKUP_DIR = path.join(__dirname, '../backups');
const CREDENTIALS_PATH = path.join(__dirname, '../credentials.json');

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `backup_${timestamp}.sql`;
  const filePath = path.join(BACKUP_DIR, fileName);

  // Ensure backup dir exists
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  console.log(`[${timestamp}] Memulai backup database...`);

  try {
    // Step 1: Dump MySQL
    await dumpDatabase(filePath);
    console.log(`✓ Database berhasil di-dump ke ${fileName}`);

    // Step 2: Upload ke Google Drive
    const driveUrl = await uploadToDrive(filePath, fileName);
    console.log(`✓ Upload ke Google Drive berhasil: ${driveUrl}`);

    // Step 3: Log ke database
    await logBackup('success', fileName, driveUrl);

    // Step 4: Hapus file lokal lama (simpan 7 hari terakhir)
    cleanOldBackups();

    console.log('✓ Backup selesai!');
  } catch (err) {
    console.error('✗ Backup gagal:', err.message);
    await logBackup('failed', fileName, null, err.message);
  }
}

function dumpDatabase(outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = [
      'mysqldump',
      `--host=${process.env.DB_HOST || 'localhost'}`,
      `--port=${process.env.DB_PORT || 3306}`,
      `--user=${process.env.DB_USER}`,
      `--password=${process.env.DB_PASSWORD}`,
      '--single-transaction',
      '--routines',
      '--triggers',
      process.env.DB_NAME,
      `> "${outputPath}"`
    ].join(' ');

    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(outputPath);
    });
  });
}

async function uploadToDrive(filePath, fileName) {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('credentials.json tidak ditemukan. Lihat petunjuk setup di atas file ini.');
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });

  const folderId = process.env.GDRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GDRIVE_FOLDER_ID belum diset di .env');

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/sql',
    },
    media: {
      mimeType: 'application/sql',
      body: fs.createReadStream(filePath),
    },
  });

  return `https://drive.google.com/file/d/${response.data.id}/view`;
}

async function logBackup(status, fileName, driveUrl, errorMsg = null) {
  try {
    const db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await db.execute(
      'INSERT INTO backup_logs (status, file_name, drive_url, error_msg) VALUES (?, ?, ?, ?)',
      [status, fileName, driveUrl, errorMsg]
    );
    await db.end();
  } catch (e) {
    console.error('Gagal menyimpan log backup:', e.message);
  }
}

function cleanOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
    .sort((a, b) => b.time - a.time);

  // Keep only 7 most recent
  files.slice(7).forEach(f => {
    fs.unlinkSync(path.join(BACKUP_DIR, f.name));
    console.log(`✓ File lama dihapus: ${f.name}`);
  });
}

// Jalankan backup
runBackup();
