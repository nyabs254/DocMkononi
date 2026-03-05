require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const cron = require("node-cron");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// DATABASE CONNECTION
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "#slyAyoo@10620", 
  database: "doc_mkononi"
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL Database");
  }
});

let mailTransporter = null;
if (
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_PORT
) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function getReminderHours(frequency) {
  if (frequency === "weekly") return 7 * 24;
  if (frequency === "monthly") return 30 * 24;
  return 24; // daily default
}

function sendNotification(user, message, channels = ["in_app"]) {
  if (!user || !user.id) return;

  // Always create an in-app notification
  db.query(
    `INSERT INTO notifications (user_id, type, title, message, is_read)
     VALUES (?, 'health_reminder', 'Health Log Reminder', ?, 0)`,
    [user.id, message],
    () => {},
  );

  // Email channel (if SMTP is configured)
  if (channels.includes("email") && mailTransporter && user.email) {
    mailTransporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: "Doc Mkononi Reminder: Log your health details",
      text: message,
    }).catch(() => {});
  }

  // Push channel placeholder
  if (channels.includes("push")) {
    console.log(`Push notification placeholder for user ${user.id}`);
  }
}

function checkReminderAndNotifyUsers() {
  const sql = `
    SELECT id, full_name, email, reminder_frequency, last_details_logged_at
    FROM users
  `;

  db.query(sql, (err, users) => {
    if (err) {
      console.error("Reminder check failed:", err.message);
      return;
    }

    const now = new Date();

    users.forEach((user) => {
      const frequency = user.reminder_frequency || "daily";
      const thresholdHours = getReminderHours(frequency);
      const lastLoggedAt = user.last_details_logged_at
        ? new Date(user.last_details_logged_at)
        : null;
      const elapsedHours = lastLoggedAt
        ? (now - lastLoggedAt) / (1000 * 60 * 60)
        : Number.MAX_SAFE_INTEGER;

      if (elapsedHours >= thresholdHours) {
        const message = `Hello ${user.full_name || "User"}, please log your health details. Your reminder frequency is set to ${frequency}.`;
        sendNotification(user, message, ["in_app", "email", "push"]);
      }
    });
  });
}

// REGISTER ROUTE
app.post("/register", async (req, res) => {
  const { fullName, email, phone, password } = req.body;

  if (!fullName || !email || !phone || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (!PASSWORD_RULE.test(password)) {
    return res.status(400).json({
      message:
        "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
    });
  }

  try {
    // Check if email already exists
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.length > 0) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      const sql = `
        INSERT INTO users (full_name, email, phone, password)
        VALUES (?, ?, ?, ?)
      `;

      db.query(sql, [fullName, email, phone, hashedPassword], (err) => {
        if (err) return res.status(500).json(err);

        res.status(201).json({ message: "User registered successfully" });
      });
    });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN ROUTE
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  db.query(
    "SELECT id, full_name, email, password, reminder_frequency FROM users WHERE email = ? LIMIT 1",
    [email],
    async (err, result) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (result.length === 0) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const user = result[0];
      const passwordOk = await bcrypt.compare(password, user.password);

      if (!passwordOk) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = generateSessionToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      db.query(
        "INSERT INTO user_sessions (user_id, session_token, login_at, expires_at, is_active) VALUES (?, ?, ?, ?, 1)",
        [user.id, token, now, expiresAt],
        (sessionErr) => {
          if (sessionErr) {
            return res.status(500).json({ message: "Could not create session" });
          }

          db.query(
            "UPDATE users SET last_login = NOW() WHERE id = ?",
            [user.id],
            () => {
              res.json({
                message: "Login successful",
                token,
                user: {
                  id: user.id,
                  name: user.full_name,
                  email: user.email,
                  reminderFrequency: user.reminder_frequency || "daily",
                },
              });
            },
          );
        },
      );
    },
  );
});

// SESSION LOOKUP ROUTE
app.get("/session/:token", (req, res) => {
  const { token } = req.params;

  db.query(
    `SELECT us.id AS session_id, us.user_id, us.session_token, us.expires_at, us.is_active,
            u.full_name, u.email, u.reminder_frequency
     FROM user_sessions us
     INNER JOIN users u ON u.id = us.user_id
     WHERE us.session_token = ?
     LIMIT 1`,
    [token],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (result.length === 0) {
        return res.status(401).json({ message: "Invalid session" });
      }

      const session = result[0];
      const expired = new Date(session.expires_at) < new Date();

      if (!session.is_active || expired) {
        return res.status(401).json({ message: "Session expired" });
      }

      return res.json({
        user: {
          id: session.user_id,
          name: session.full_name,
          email: session.email,
          reminderFrequency: session.reminder_frequency || "daily",
        },
      });
    },
  );
});

// LOGOUT ROUTE
app.post("/logout", (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Session token is required" });
  }

  db.query(
    "UPDATE user_sessions SET logout_at = NOW(), is_active = 0 WHERE session_token = ? AND is_active = 1",
    [token],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Active session not found" });
      }
      return res.json({ message: "Logout successful" });
    },
  );
});

// CONTACT US ROUTE
app.post("/contact-us", (req, res) => {
  const { fullName, email, message } = req.body;

  if (!fullName || !email || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const sql = `
    INSERT INTO contact_messages (full_name, email, message)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [fullName, email, message], (err) => {
    if (err) {
      return res.status(500).json({ message: "Failed to send message" });
    }
    return res.status(201).json({ message: "Message sent" });
  });
});

// SAVE METRICS + update last details log time
app.post("/save-metrics", (req, res) => {
  const { email, bp, heartRate, sleep, bs, exercise, score } = req.body;

  if (!email) {
    return res.status(400).json({ message: "User email is required" });
  }

  db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email], (userErr, users) => {
    if (userErr) return res.status(500).json({ message: "Database error" });
    if (users.length === 0) return res.status(404).json({ message: "User not found" });

    const userId = users[0].id;

    db.query(
      `INSERT INTO health_logs (user_id, bp_systolic, heart_rate, sleep_hours, blood_sugar, exercise_minutes, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, bp, heartRate, sleep, bs, exercise, score],
      (logErr) => {
        if (logErr) return res.status(500).json({ message: "Could not save metrics" });

        db.query(
          "UPDATE users SET last_details_logged_at = NOW() WHERE id = ?",
          [userId],
          (updateErr) => {
            if (updateErr) return res.status(500).json({ message: "Could not update last log time" });
            return res.status(201).json({ message: "Metrics saved successfully" });
          },
        );
      },
    );
  });
});

// Update reminder frequency (daily, weekly, monthly)
app.post("/reminder-frequency", (req, res) => {
  const { token, frequency } = req.body;
  const allowed = ["daily", "weekly", "monthly"];

  if (!token || !allowed.includes(frequency)) {
    return res.status(400).json({ message: "Invalid token or frequency" });
  }

  db.query(
    `SELECT user_id FROM user_sessions
     WHERE session_token = ? AND is_active = 1 AND expires_at > NOW()
     LIMIT 1`,
    [token],
    (sessionErr, sessions) => {
      if (sessionErr) return res.status(500).json({ message: "Database error" });
      if (sessions.length === 0) return res.status(401).json({ message: "Invalid session" });

      const userId = sessions[0].user_id;
      db.query(
        "UPDATE users SET reminder_frequency = ? WHERE id = ?",
        [frequency, userId],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ message: "Could not update reminder frequency" });
          return res.json({ message: "Reminder frequency updated", frequency });
        },
      );
    },
  );
});

// Get user's in-app notifications
app.get("/notifications/:token", (req, res) => {
  const { token } = req.params;

  db.query(
    `SELECT user_id FROM user_sessions
     WHERE session_token = ? AND is_active = 1 AND expires_at > NOW()
     LIMIT 1`,
    [token],
    (sessionErr, sessions) => {
      if (sessionErr) return res.status(500).json({ message: "Database error" });
      if (sessions.length === 0) return res.status(401).json({ message: "Invalid session" });

      const userId = sessions[0].user_id;
      db.query(
        `SELECT id, title, message, is_read, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId],
        (notificationErr, notifications) => {
          if (notificationErr) return res.status(500).json({ message: "Could not load notifications" });
          return res.json({ notifications });
        },
      );
    },
  );
});

// Mark one notification as read
app.post("/notifications/:id/read", (req, res) => {
  const { id } = req.params;
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Session token is required" });
  }

  db.query(
    `SELECT user_id FROM user_sessions
     WHERE session_token = ? AND is_active = 1 AND expires_at > NOW()
     LIMIT 1`,
    [token],
    (sessionErr, sessions) => {
      if (sessionErr) return res.status(500).json({ message: "Database error" });
      if (sessions.length === 0) return res.status(401).json({ message: "Invalid session" });

      db.query(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
        [id, sessions[0].user_id],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ message: "Could not update notification" });
          return res.json({ message: "Notification marked as read" });
        },
      );
    },
  );
});

// Run reminder check every hour
cron.schedule("0 * * * *", () => {
  checkReminderAndNotifyUsers();
});

// START SERVER
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  checkReminderAndNotifyUsers();
});
