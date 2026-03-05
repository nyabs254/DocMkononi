CREATE DATABASE IF NOT EXISTS doc_mkononi;
USE doc_mkononi;

-- Users reminder fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_details_logged_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS reminder_frequency ENUM('daily', 'weekly', 'monthly') NOT NULL DEFAULT 'daily';

-- Store user health metric logs
CREATE TABLE IF NOT EXISTS health_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  bp_systolic INT NULL,
  heart_rate INT NULL,
  sleep_hours DECIMAL(4,2) NULL,
  blood_sugar DECIMAL(8,2) NULL,
  exercise_minutes INT NULL,
  score INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_health_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_health_logs_user_created ON health_logs (user_id, created_at);

-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'health_reminder',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user_read_created
  ON notifications (user_id, is_read, created_at);
