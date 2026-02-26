const mysql = require("mysql2/promise");

// configuration can be overridden via environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "#slyAyoo@10620",
  database: process.env.DB_DATABASE || "docmkononi",
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
