USE doc_mkononi;

-- Ensure users table has the fields used by backend auth code
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL;

-- Session store table
CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  session_token CHAR(64) NOT NULL UNIQUE,
  login_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logout_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_user_sessions_user_active
  ON user_sessions (user_id, is_active);

CREATE INDEX idx_user_sessions_expiry
  ON user_sessions (expires_at);

-- Optional helper procedure: create a session
DROP PROCEDURE IF EXISTS sp_create_user_session;
DELIMITER $$
CREATE PROCEDURE sp_create_user_session (
  IN p_user_id BIGINT,
  IN p_session_token CHAR(64),
  IN p_expires_at DATETIME
)
BEGIN
  INSERT INTO user_sessions (user_id, session_token, expires_at, is_active)
  VALUES (p_user_id, p_session_token, p_expires_at, 1);
END $$
DELIMITER ;

-- Optional helper procedure: terminate a session
DROP PROCEDURE IF EXISTS sp_terminate_user_session;
DELIMITER $$
CREATE PROCEDURE sp_terminate_user_session (
  IN p_session_token CHAR(64)
)
BEGIN
  UPDATE user_sessions
  SET logout_at = NOW(),
      is_active = 0
  WHERE session_token = p_session_token
    AND is_active = 1;
END $$
DELIMITER ;

-- Optional cleanup event (remove expired inactive sessions older than 7 days)
SET GLOBAL event_scheduler = ON;

DROP EVENT IF EXISTS ev_cleanup_user_sessions;
CREATE EVENT ev_cleanup_user_sessions
ON SCHEDULE EVERY 1 DAY
DO
  DELETE FROM user_sessions
  WHERE is_active = 0
    AND expires_at < NOW() - INTERVAL 7 DAY;
