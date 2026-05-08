-- ============================================================
-- MIGRATION — Jalankan ini jika database sudah ada sebelumnya
-- ============================================================
USE secret_notes;

-- Tambah kolom is_setup jika belum ada
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS is_setup TINYINT(1) NOT NULL DEFAULT 0 
  COMMENT '0=belum setup password, 1=sudah' 
  AFTER plain_password;

-- Semua user lama dianggap sudah setup
UPDATE users SET is_setup = 1 WHERE password_hash IS NOT NULL AND is_setup = 0;

-- Buat tabel settings jika belum ada
CREATE TABLE IF NOT EXISTS app_settings (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  setting_key     VARCHAR(50)  NOT NULL UNIQUE,
  setting_value   VARCHAR(255) NOT NULL,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('phase_send', 'open'),
  ('phase_read', 'closed')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

SELECT 'Migration selesai!' AS status;
