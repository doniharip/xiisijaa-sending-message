-- ============================================================
-- SECRET NOTES KELAS — Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS secret_notes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE secret_notes;

-- Users table
-- is_setup = 0 → belum pernah login, belum punya password (admin baru tambahkan nama)
-- is_setup = 1 → sudah buat password sendiri, bisa login normal
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NULL     COMMENT 'NULL jika belum setup password',
  plain_password  VARCHAR(255) NULL     COMMENT 'Untuk admin jika user lupa password',
  is_setup        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '0=belum setup, 1=sudah punya password',
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Messages table (ciphertext only)
CREATE TABLE IF NOT EXISTS messages (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  sender_name     VARCHAR(100) NOT NULL,
  recipient_name  VARCHAR(100) NOT NULL,
  ciphertext      TEXT         NOT NULL COMMENT 'AES-256-GCM encrypted — server tidak bisa membaca',
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sender    FOREIGN KEY (sender_name)    REFERENCES users(name) ON DELETE CASCADE,
  CONSTRAINT fk_recipient FOREIGN KEY (recipient_name) REFERENCES users(name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- App settings — fase pengisian & pembacaan dikendalikan admin
CREATE TABLE IF NOT EXISTS app_settings (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  setting_key     VARCHAR(50)  NOT NULL UNIQUE,
  setting_value   VARCHAR(255) NOT NULL,
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default settings
INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('phase_send',    'open')   -- 'open' atau 'closed'
ON DUPLICATE KEY UPDATE setting_value = setting_value;

INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('phase_read',    'closed')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_name);
CREATE INDEX IF NOT EXISTS idx_messages_sender    ON messages(sender_name);

-- Backup log table
CREATE TABLE IF NOT EXISTS backup_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  status      ENUM('success','failed') NOT NULL,
  file_name   VARCHAR(255),
  drive_url   VARCHAR(500),
  error_msg   TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;