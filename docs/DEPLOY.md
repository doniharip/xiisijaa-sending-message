# 🚀 Panduan Deploy — Secret Notes Kelas

## Cara Termudah: Railway.app (Gratis)

### Step 1 — Buat akun Railway
1. Buka **https://railway.app** → Sign up dengan GitHub
2. Klik **New Project** → **Deploy from GitHub repo**

### Step 2 — Upload kode ke GitHub
```bash
cd secret-notes
git init
git add .
git commit -m "first commit"
# Buat repo baru di github.com, lalu:
git remote add origin https://github.com/username/secret-notes.git
git push -u origin main
```

### Step 3 — Setup di Railway
1. Di Railway, pilih repo GitHub kamu
2. Klik **Add Service** → **Database** → **MySQL**
3. Railway akan otomatis mengisi variabel DB_HOST, DB_PORT, dll

### Step 4 — Set Environment Variables di Railway
Klik tab **Variables** dan isi:
```
JWT_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
ADMIN_PASSWORD=password_admin_kamu_yang_kuat
NODE_ENV=production
```

### Step 5 — Setup database
Di Railway, klik service MySQL → tab **Query** → paste isi file `database/schema.sql` → Run

### Step 6 — Deploy!
Railway otomatis deploy setiap kamu push ke GitHub. Kamu dapat URL seperti:
`https://secret-notes-production.up.railway.app`

---

## Setup Backup Google Drive

### 1. Buat Google Cloud Project
1. Buka https://console.cloud.google.com
2. **New Project** → beri nama
3. **APIs & Services** → **Enable APIs** → cari "Google Drive API" → Enable

### 2. Buat Service Account
1. **APIs & Services** → **Credentials** → **Create Credentials** → **Service Account**
2. Isi nama → Create
3. Klik service account yang dibuat → tab **Keys** → **Add Key** → **JSON**
4. File JSON ter-download otomatis — ini adalah `credentials.json`

### 3. Share Google Drive Folder ke Service Account
1. Buat folder baru di Google Drive untuk backup
2. Klik kanan folder → **Share**
3. Paste email service account (ada di JSON file, field `client_email`)
4. Beri akses **Editor**
5. Copy **Folder ID** dari URL: `drive.google.com/drive/folders/`**INI_FOLDER_ID**

### 4. Upload credentials ke Railway
Di Railway → tab Variables:
```
GDRIVE_FOLDER_ID=folder_id_dari_url_google_drive
```
Untuk credentials.json, upload sebagai file atau paste isinya ke variabel:
```
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}
```

Lalu update `backup.js` untuk baca dari env jika file tidak ada:
```js
const credentials = process.env.GOOGLE_CREDENTIALS_JSON 
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
  : require('./credentials.json');
```

---

## Restore dari Backup

Jika database bermasalah dan perlu restore:

1. Download file `.sql` dari Google Drive
2. Di Railway MySQL → tab **Query** → paste perintah ini:
```sql
SOURCE /path/to/backup_file.sql;
```
Atau via terminal:
```bash
mysql -h HOST -u USER -pPASSWORD DATABASE < backup_file.sql
```

---

## Distribusi Login ke Teman

Setelah semua akun dibuat via Admin Panel:
1. Buka halaman Admin → tab **Siswa**
2. Klik **🔑 Password** untuk lihat password tiap siswa
3. Bagikan link website + nama + password ke masing-masing orang (via WA/chat pribadi)
4. Minta mereka **tidak share password** ke siapa pun

---

## Troubleshooting

**Website tidak bisa diakses?**
→ Cek tab **Logs** di Railway

**Database error?**
→ Pastikan schema.sql sudah dijalankan

**Backup gagal?**
→ Pastikan `credentials.json` ada dan folder Drive sudah di-share ke service account
