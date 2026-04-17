const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Check your .env loading path.");
}

const isProductionDb =
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes("localhost");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProductionDb
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = { pool };