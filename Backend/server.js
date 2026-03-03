require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");

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

// REGISTER ROUTE
app.post("/register", async (req, res) => {
  const { fullName, email, phone, password } = req.body;

  if (!fullName || !email || !phone || !password) {
    return res.status(400).json({ message: "All fields are required" });
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

// START SERVER
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});