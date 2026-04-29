const crypto = require("crypto");
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db/pool");
const { normalizeEmail } = require("../utils/normalizeEmail");

function passwordHashPlaceholder() {
  // Keep schema compatibility for oauth-created users (`password_hash` is required).
  return crypto.createHash("sha256").update(`oauth:${uuidv4()}`).digest("hex");
}

function configurePassport() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL;

  if (!clientID || !clientSecret || !callbackURL) {
    return passport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        scope: ["profile", "email"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const rawEmail = profile?.emails?.[0]?.value;
          const email = normalizeEmail(rawEmail);
          if (!email) {
            return done(null, false, { message: "Google account did not provide a usable email." });
          }

          const googleId = profile?.id ? String(profile.id) : null;
          const displayName = profile?.displayName ? String(profile.displayName).trim() : null;
          const avatarUrl = profile?.photos?.[0]?.value ? String(profile.photos[0].value) : null;

          const existing = await pool.query(
            "SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1",
            [email]
          );

          if (existing.rows[0]) {
            await pool.query(
              `UPDATE users
               SET google_id = COALESCE($2, google_id),
                   display_name = COALESCE(NULLIF($3, ''), display_name),
                   avatar_url = COALESCE(NULLIF($4, ''), avatar_url)
               WHERE id = $1`,
              [existing.rows[0].id, googleId, displayName || "", avatarUrl || ""]
            );
            return done(null, { id: existing.rows[0].id, email: existing.rows[0].email });
          }

          const userId = uuidv4();
          await pool.query(
            `INSERT INTO users
               (id, email, password_hash, display_name, avatar_url, google_id, plan, plan_selected, must_change_password)
             VALUES ($1, $2, $3, $4, $5, $6, 'free', FALSE, FALSE)`,
            [userId, email, passwordHashPlaceholder(), displayName, avatarUrl, googleId]
          );

          return done(null, { id: userId, email });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  return passport;
}

module.exports = { configurePassport, passport };
