#!/usr/bin/env node
"use strict";

const path = require("path");
const bcrypt = require("bcrypt");
const { normalizeEmail } = require("../utils/normalizeEmail");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env"),
});

const { pool } = require("../db/pool");

function usage() {
  console.error(
    "Usage: node apps/api/src/scripts/reset-user-password.js <email> <newPassword>",
  );
}

async function main() {
  const [, , emailArg, passwordArg] = process.argv;
  const email = normalizeEmail(emailArg);
  const newPassword = String(passwordArg || "");

  if (!email || !newPassword) {
    usage();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         must_change_password = FALSE
     WHERE lower(email) = lower($2)
     RETURNING email`,
    [passwordHash, email],
  );

  if (result.rowCount === 0) {
    console.error(`User not found for email: ${email}`);
    process.exit(1);
  }

  console.info(`Password reset successful for ${result.rows[0].email}`);
}

main()
  .catch((error) => {
    console.error("Failed to reset password:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
