-- ============================================================
-- MIGRATION — Jalankan ini jika database sudah ada sebelumnya
-- ============================================================
USE secret_notes;

-- Tambah key_hash jika belum ada
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  key_hash VARCHAR(64) NULL COMMENT 'SHA-256(password) untuk kunci enkripsi E2E'
  AFTER password_hash;

-- Tambah is_setup jika belum ada
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  is_setup TINYINT(1) NOT NULL DEFAULT 0 AFTER key_hash;

-- Hapus plain_password jika masih ada
ALTER TABLE users DROP COLUMN IF EXISTS plain_password;

-- User lama (sudah punya password_hash) tandai is_setup=1
-- key_hash akan NULL — mereka perlu login ulang untuk generate key_hash
-- (atau reset semua password dan minta setup ulang)
UPDATE users SET is_setup = 1 WHERE password_hash IS NOT NULL AND is_setup = 0;

-- Buat tabel settings jika belum ada
CREATE TABLE IF NOT EXISTS app_settings (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  setting_key   VARCHAR(50)  NOT NULL UNIQUE,
  setting_value VARCHAR(255) NOT NULL,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('phase_send', 'open'), ('phase_read', 'closed')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

SELECT 'Migration selesai!' AS status;

-- ── Tambahan: tabel pesan kelas ──────────────────────────────
CREATE TABLE IF NOT EXISTS class_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  sender_name VARCHAR(100) NOT NULL,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_class_sender FOREIGN KEY (sender_name) REFERENCES users(name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS idx_class_sender ON class_messages(sender_name);

-- Tambah fase pesan kelas
INSERT INTO app_settings (setting_key, setting_value) VALUES ('phase_class', 'closed')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

SELECT 'Migration class_messages selesai!' AS status;

-- Tambah kolom temp_key untuk enkripsi pesan sebelum user setup password
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  temp_key VARCHAR(64) NULL COMMENT 'Kunci sementara sebelum user setup password'
  AFTER key_hash;

-- Pisah phase_class menjadi phase_class_write dan phase_class_read
INSERT INTO app_settings (setting_key, setting_value) VALUES ('phase_class_write', 'closed')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

INSERT INTO app_settings (setting_key, setting_value) VALUES ('phase_class_read', 'closed')
ON DUPLICATE KEY UPDATE setting_value = setting_value;
