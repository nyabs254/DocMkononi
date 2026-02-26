const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const path = require("path");

// mysql connection pool
const pool = require("./db");

const app = express();
app.use(express.json());

// serve frontend static assets so pages load from same origin
const frontendDir = path.join(__dirname, "..", "Frontend");
app.use(express.static(frontendDir));
// if someone hits root, optionally redirect to register or login
app.get("/", (req, res) => {
  res.redirect("/register.html");
});

// Simple CORS middleware (adjust origin as needed)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept",
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  }),
);

// utility helpers that interact with MySQL
async function findUserByEmail(email) {
  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [
    email,
  ]);
  return rows.length ? rows[0] : null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

function verifyPassword(password, stored) {
  const [salt, key] = stored.split(":");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  // timingSafeEqual requires Buffers of same length
  return crypto.timingSafeEqual(
    Buffer.from(derived, "hex"),
    Buffer.from(key, "hex"),
  );
}

app.post("/api/register", async (req, res) => {
  // accept generic profile fields; password will be hashed
  const { email, password, name, age, weight, condition, goals } =
    req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Missing email or password" });
  if (await findUserByEmail(email))
    return res.status(409).json({ error: "User already exists" });

  const hashed = hashPassword(password);
  const [result] = await pool.query(
    "INSERT INTO users (email,password,name,age,weight,`condition`,goals) VALUES (?,?,?,?,?,?,?)",
    [
      email,
      hashed,
      name || "",
      age || null,
      weight || null,
      condition || null,
      goals ? JSON.stringify(goals) : null,
    ],
  );

  const userId = result.insertId;
  req.session.userId = userId;
  const safe = { id: userId, email, name, age, weight, condition, goals };
  res.json({ user: safe });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Missing email or password" });
  const user = await findUserByEmail(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (!verifyPassword(password, user.password))
    return res.status(401).json({ error: "Invalid credentials" });

  await pool.query("UPDATE users SET last_login = NOW() WHERE id = ?", [
    user.id,
  ]);

  req.session.userId = user.id;
  const { password: _p, ...safe } = user;
  res.json({ user: safe });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", async (req, res) => {
  if (!req.session || !req.session.userId) return res.json({ user: null });
  const [rows] = await pool.query(
    "SELECT id,email,name,age,weight,`condition`,goals,created_at,last_login FROM users WHERE id = ?",
    [req.session.userId],
  );
  if (rows.length === 0) return res.json({ user: null });
  res.json({ user: rows[0] });
});

// Example protected route
app.get("/api/protected", (req, res) => {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Unauthorized" });
  res.json({ message: "This is protected", userId: req.session.userId });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Backend server listening on http://localhost:${PORT}`),
);
