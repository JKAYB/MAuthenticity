const crypto = require("crypto");
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const { Strategy: GitHubStrategy } = require("passport-github2");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db/pool");
const { normalizeEmail } = require("../utils/normalizeEmail");

function passwordHashPlaceholder() {
  // Keep schema compatibility for oauth-created users (`password_hash` is required).
  return crypto.createHash("sha256").update(`oauth:${uuidv4()}`).digest("hex");
}

async function fetchGitHubPrimaryEmail(accessToken) {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mediaauth-api",
    },
  });
  if (!response.ok) {
    console.error(`[OAuth] GitHub email API failed with status ${response.status}`);
    return null;
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) return null;
  const primaryVerified = payload.find((item) => item?.primary === true && item?.verified === true);
  const anyVerified = payload.find((item) => item?.verified === true);
  return normalizeEmail(primaryVerified?.email || anyVerified?.email || null);
}

function configurePassport() {
  const googleClientID = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleCallbackURL = process.env.GOOGLE_CALLBACK_URL;

  if (googleClientID && googleClientSecret && googleCallbackURL) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientID,
          clientSecret: googleClientSecret,
          callbackURL: googleCallbackURL,
          scope: ["profile", "email"],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const rawEmail = profile?.emails?.[0]?.value;
            const email = normalizeEmail(rawEmail);
            if (!email) {
              console.error("[OAuth] Google login failed: provider returned no usable email");
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
            console.error("[OAuth] Google login failed during profile processing", error);
            return done(null, false);
          }
        }
      )
    );
  }

  const githubClientID = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  const githubCallbackURL = process.env.GITHUB_CALLBACK_URL;

  if (githubClientID && githubClientSecret && githubCallbackURL) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: githubClientID,
          clientSecret: githubClientSecret,
          callbackURL: githubCallbackURL,
          scope: ["user:email"],
        },
        async (accessToken, _refreshToken, profile, done) => {
          try {
            const githubId = profile?.id ? String(profile.id) : null;
            const username = profile?.username ? String(profile.username).trim() : null;
            const avatarUrl = profile?.photos?.[0]?.value ? String(profile.photos[0].value) : null;

            let email = normalizeEmail(profile?.emails?.[0]?.value || null);
            if (!email && accessToken) {
              email = await fetchGitHubPrimaryEmail(accessToken);
            }
            if (!email) {
              console.error("[OAuth] GitHub login failed: no verified email available");
              return done(null, false, { message: "GitHub account did not provide a verified email." });
            }

            const existing = await pool.query(
              "SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1",
              [email]
            );

            if (existing.rows[0]) {
              await pool.query(
                `UPDATE users
                 SET github_id = COALESCE($2, github_id),
                     display_name = COALESCE(NULLIF($3, ''), display_name),
                     avatar_url = COALESCE(NULLIF($4, ''), avatar_url)
                 WHERE id = $1`,
                [existing.rows[0].id, githubId, username || "", avatarUrl || ""]
              );
              return done(null, { id: existing.rows[0].id, email: existing.rows[0].email });
            }

            const userId = uuidv4();
            await pool.query(
              `INSERT INTO users
                 (id, email, password_hash, display_name, avatar_url, github_id, plan, plan_selected, must_change_password)
               VALUES ($1, $2, $3, $4, $5, $6, 'free', FALSE, FALSE)`,
              [userId, email, passwordHashPlaceholder(), username, avatarUrl, githubId]
            );

            return done(null, { id: userId, email });
          } catch (error) {
            console.error("[OAuth] GitHub login failed during profile processing", error);
            return done(null, false);
          }
        }
      )
    );
  }

  return passport;
}

module.exports = { configurePassport, passport };
