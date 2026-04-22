const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db/pool");

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const AUTH_COOKIE_NAME = "auth_token";

function authCookieOptions() {
  const explicitSameSite = String(process.env.AUTH_COOKIE_SAMESITE || "").trim().toLowerCase();
  const sameSite =
    explicitSameSite === "strict" || explicitSameSite === "lax" || explicitSameSite === "none"
      ? explicitSameSite
      : process.env.NODE_ENV === "production"
        ? "none"
        : "lax";
  const secure = sameSite === "none" || process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/"
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
}

function clearAuthCookie(res) {
  const opts = authCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path
  });
}

function maskApiKey(keyValue) {
  const raw = String(keyValue || "");
  if (!raw) return "";
  const suffix = raw.slice(-4);
  return `****${suffix}`;
}

/** Returns an error message or null if the password meets policy. */
function passwordPolicyError(password) {
  if (typeof password !== "string") {
    return "Password is required";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return "Password is too long";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include a lowercase letter";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include an uppercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include a number";
  }
  return null;
}

async function signup(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const policyErr = passwordPolicyError(password);
    if (policyErr) {
      return res.status(400).json({ error: policyErr });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    await pool.query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
      [userId, email, passwordHash]
    );

    const token = jwt.sign(
      { sub: userId, email },
      process.env.JWT_SECRET || "change-me",
      { expiresIn: "1d" }
    );
    setAuthCookie(res, token);
    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET || "change-me",
      { expiresIn: "1d" }
    );

    setAuthCookie(res, token);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function logout(_req, res, next) {
  try {
    clearAuthCookie(res);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function listApiKeys(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, key_value, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    return res.json({
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        key_masked: maskApiKey(row.key_value),
        created_at: row.created_at
      }))
    });
  } catch (error) {
    return next(error);
  }
}

async function createApiKey(req, res, next) {
  try {
    const id = uuidv4();
    const keyValue = `mak_${uuidv4()}`;
    const name = req.body.name || "Default key";

    await pool.query(
      "INSERT INTO api_keys (id, user_id, key_value, name) VALUES ($1, $2, $3, $4)",
      [id, req.user.id, keyValue, name]
    );

    return res.status(201).json({ id, name, key: keyValue });
  } catch (error) {
    return next(error);
  }
}

async function deleteApiKey(req, res, next) {
  try {
    await pool.query("DELETE FROM api_keys WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function fetchUserProfile(userId) {
  const { rows } = await pool.query(
    `SELECT id, email, display_name, organization, plan
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  const name =
    row.display_name && String(row.display_name).trim()
      ? String(row.display_name).trim()
      : null;
  const organization =
    row.organization && String(row.organization).trim()
      ? String(row.organization).trim()
      : null;
  return {
    id: row.id,
    email: row.email,
    name,
    organization,
    plan: row.plan || "free",
  };
}

async function getMe(req, res, next) {
  try {
    const profile = await fetchUserProfile(req.user.id);
    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json(profile);
  } catch (error) {
    return next(error);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }
    const policyErr = passwordPolicyError(newPassword);
    if (policyErr) {
      return res.status(400).json({ error: policyErr });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: "New password must be different from your current password" });
    }

    const { rows } = await pool.query(
      "SELECT id, password_hash FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, req.user.id]);

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function updateMe(req, res, next) {
  try {
    const { name, organization } = req.body;
    if (name === undefined && organization === undefined) {
      return res.status(400).json({ error: "Provide at least one of: name, organization" });
    }

    const sets = [];
    const values = [];
    let i = 1;

    if (name !== undefined) {
      sets.push(`display_name = $${i}`);
      const v = name === null ? null : String(name).trim().slice(0, 200);
      values.push(v === "" ? null : v);
      i += 1;
    }
    if (organization !== undefined) {
      sets.push(`organization = $${i}`);
      const v = organization === null ? null : String(organization).trim().slice(0, 200);
      values.push(v === "" ? null : v);
      i += 1;
    }

    values.push(req.user.id);
    await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${i}`, values);

    const profile = await fetchUserProfile(req.user.id);
    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json(profile);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  signup,
  login,
  logout,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  getMe,
  updateMe,
  changePassword,
};
