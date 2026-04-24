"use strict";

const path = require("path");
const crypto = require("crypto");
const { createHash } = require("crypto");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env"),
});

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

function truthy(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

const enabled =
  truthy(process.env.RUN_API_INTEGRATION) &&
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.REDIS_URL);

const d = enabled ? describe : describe.skip;

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }
  return { res, body };
}

async function signup(baseUrl, email, password) {
  const r = await fetchJson(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(r.res.status, 201, `signup failed: ${JSON.stringify(r.body)}`);
}

async function login(baseUrl, email, password) {
  return fetchJson(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function authCookieFromLoginResponse(loginResponse) {
  const setCookie = loginResponse.res.headers.get("set-cookie");
  assert.ok(setCookie && setCookie.includes("auth_token="), "missing auth_token cookie");
  return setCookie.split(";")[0];
}

d("team invitation flow", () => {
  /** @type {import('pg').Pool} */
  let pool;
  let baseUrl;
  let closeServer;
  const createdUserIds = [];

  before(async () => {
    // eslint-disable-next-line global-require
    pool = require("../../src/db/pool").pool;
    const { startTestServer } = require("./httpServer");
    const s = await startTestServer();
    baseUrl = s.baseUrl;
    closeServer = s.close;
  });

  after(async () => {
    for (const uid of createdUserIds) {
      try {
        await pool.query("DELETE FROM team_members WHERE user_id = $1", [uid]);
        await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [uid]);
        await pool.query("DELETE FROM team_member_invites WHERE invited_by_user_id = $1", [uid]);
        await pool.query("DELETE FROM teams WHERE owner_user_id = $1", [uid]);
        await pool.query("DELETE FROM users WHERE id = $1", [uid]);
      } catch {
        /* ignore cleanup errors */
      }
    }
    if (closeServer) await closeServer();
  });

  it("creates pending invite (not active member), accepts, then falls back after removal", async () => {
    const ownerEmail = `owner-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const ownerPassword = "OwnerPass1!";
    const existingEmail = `member-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const existingPassword = "MemberPass1!";

    await signup(baseUrl, ownerEmail, ownerPassword);
    await signup(baseUrl, existingEmail, existingPassword);

    const ownerIdQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [
      ownerEmail,
    ]);
    const existingUserQ = await pool.query(
      "SELECT id, password_hash, must_change_password FROM users WHERE lower(email) = lower($1) LIMIT 1",
      [existingEmail],
    );
    const ownerId = ownerIdQ.rows[0].id;
    const existingUser = existingUserQ.rows[0];
    createdUserIds.push(ownerId, existingUser.id);

    assert.equal(Boolean(existingUser.must_change_password), false);
    const passwordHashBefore = existingUser.password_hash;

    const existingLoginForPlan = await login(baseUrl, existingEmail, existingPassword);
    assert.equal(existingLoginForPlan.res.status, 200, `existing login failed: ${JSON.stringify(existingLoginForPlan.body)}`);
    const existingAuthCookie = authCookieFromLoginResponse(existingLoginForPlan);
    const existingSelectMonthly = await fetchJson(`${baseUrl}/access/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: existingAuthCookie },
      body: JSON.stringify({ planCode: "individual_monthly" }),
    });
    assert.equal(
      existingSelectMonthly.res.status,
      200,
      `existing select monthly failed: ${JSON.stringify(existingSelectMonthly.body)}`,
    );

    const ownerLogin = await login(baseUrl, ownerEmail, ownerPassword);
    assert.equal(ownerLogin.res.status, 200, `owner login failed: ${JSON.stringify(ownerLogin.body)}`);
    const cookie = authCookieFromLoginResponse(ownerLogin);

    const existingLoginBefore = await login(baseUrl, existingEmail.toUpperCase(), existingPassword);
    assert.equal(
      existingLoginBefore.res.status,
      200,
      `existing user pre-add login failed: ${JSON.stringify(existingLoginBefore.body)}`,
    );

    const selectTeam = await fetchJson(`${baseUrl}/access/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ planCode: "team" }),
    });
    assert.equal(selectTeam.res.status, 200, `select team failed: ${JSON.stringify(selectTeam.body)}`);

    const addExisting = await fetchJson(`${baseUrl}/access/team/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ email: existingEmail.toUpperCase() }),
    });
    assert.equal(addExisting.res.status, 201, `add existing failed: ${JSON.stringify(addExisting.body)}`);
    assert.equal(addExisting.body.status, "invitation_sent");

    const activeMemberCountQ = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND tm.status = 'active' AND lower(u.email) = lower($2)`,
      [selectTeam.body.teamId, existingEmail],
    );
    assert.equal(activeMemberCountQ.rows[0].c, 0, "invite should not create active membership");

    const inviteQ = await pool.query(
      `SELECT id, status, token_hash
       FROM team_member_invites
       WHERE team_id = $1 AND lower(email) = lower($2)
       LIMIT 1`,
      [selectTeam.body.teamId, existingEmail],
    );
    assert.equal(inviteQ.rows[0].status, "pending");
    assert.ok(inviteQ.rows[0].token_hash);

    const ownerTeamList = await fetchJson(`${baseUrl}/access/team`, {
      headers: { Cookie: cookie },
    });
    assert.equal(ownerTeamList.res.status, 200);
    assert.ok(
      ownerTeamList.body.invites.some(
        (inv) => String(inv.email).toLowerCase() === existingEmail.toLowerCase() && inv.status === "pending",
      ),
      "pending invite should appear in team list",
    );

    const knownToken = `known-${crypto.randomBytes(8).toString("hex")}`;
    await pool.query(
      "UPDATE team_member_invites SET token_hash = $2, expires_at = NOW() + INTERVAL '7 days', updated_at = NOW() WHERE id = $1",
      [inviteQ.rows[0].id, sha256(knownToken)],
    );

    const acceptBeforeLogin = await fetchJson(`${baseUrl}/access/team/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: knownToken }),
    });
    assert.equal(acceptBeforeLogin.res.status, 401);
    assert.equal(acceptBeforeLogin.body.error, "requires_auth");

    const acceptMismatch = await fetchJson(`${baseUrl}/access/team/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ token: knownToken }),
    });
    assert.equal(acceptMismatch.res.status, 403);
    assert.equal(acceptMismatch.body.error, "email_mismatch");

    const existingLoginAccept = await login(baseUrl, existingEmail, existingPassword);
    assert.equal(existingLoginAccept.res.status, 200);
    const existingAcceptCookie = authCookieFromLoginResponse(existingLoginAccept);
    const acceptOk = await fetchJson(`${baseUrl}/access/team/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: existingAcceptCookie },
      body: JSON.stringify({ token: knownToken }),
    });
    assert.equal(acceptOk.res.status, 200, JSON.stringify(acceptOk.body));
    assert.equal(acceptOk.body.status, "accepted");

    const activeAfterAcceptQ = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND tm.status = 'active' AND lower(u.email) = lower($2)`,
      [selectTeam.body.teamId, existingEmail],
    );
    assert.equal(activeAfterAcceptQ.rows[0].c, 1, "accept should activate membership");

    const existingUserAfterQ = await pool.query(
      "SELECT password_hash, must_change_password FROM users WHERE id = $1 LIMIT 1",
      [existingUser.id],
    );
    const existingUserAfter = existingUserAfterQ.rows[0];
    assert.equal(existingUserAfter.password_hash, passwordHashBefore, "password_hash must stay unchanged");
    assert.equal(
      Boolean(existingUserAfter.must_change_password),
      false,
      "must_change_password must remain false",
    );

    const duplicateCaseCountQ = await pool.query(
      "SELECT COUNT(*)::int AS c FROM users WHERE lower(email) = lower($1)",
      [existingEmail],
    );
    assert.equal(duplicateCaseCountQ.rows[0].c, 1, "must not create duplicate users for email casing");

    const existingLoginDuringTeam = await login(baseUrl, existingEmail, existingPassword);
    assert.equal(existingLoginDuringTeam.res.status, 200);
    const existingDuringTeamAuthCookie = authCookieFromLoginResponse(existingLoginDuringTeam);
    const meDuringTeam = await fetchJson(`${baseUrl}/me`, {
      headers: { Cookie: existingDuringTeamAuthCookie },
    });
    assert.equal(meDuringTeam.res.status, 200, `me during team failed: ${JSON.stringify(meDuringTeam.body)}`);
    assert.ok(meDuringTeam.body.organizationId, "organizationId should exist while active team member");
    assert.equal(meDuringTeam.body.organizationPlan, "team");

    const removeExisting = await fetchJson(`${baseUrl}/access/team/members/${existingUser.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    assert.equal(removeExisting.res.status, 204, `remove existing failed`);

    const existingLoginAfter = await login(baseUrl, existingEmail, existingPassword);
    assert.equal(
      existingLoginAfter.res.status,
      200,
      `existing user post-add login failed: ${JSON.stringify(existingLoginAfter.body)}`,
    );
    const existingAfterAuthCookie = authCookieFromLoginResponse(existingLoginAfter);
    const meAfterRemove = await fetchJson(`${baseUrl}/me`, {
      headers: { Cookie: existingAfterAuthCookie },
    });
    assert.equal(meAfterRemove.res.status, 200, `me after remove failed: ${JSON.stringify(meAfterRemove.body)}`);
    assert.equal(meAfterRemove.body.organizationId, null);
    assert.equal(meAfterRemove.body.organizationName, null);
    assert.equal(meAfterRemove.body.organizationPlan, null);
    assert.equal(meAfterRemove.body.plan, "individual_monthly");

    const existingUserFinalQ = await pool.query(
      "SELECT password_hash, must_change_password FROM users WHERE id = $1 LIMIT 1",
      [existingUser.id],
    );
    assert.equal(existingUserFinalQ.rows[0].password_hash, passwordHashBefore);
    assert.equal(Boolean(existingUserFinalQ.rows[0].must_change_password), false);
  });

  it("decline/resend/expiry rules work and accepted invites cannot be resent", async () => {
    const ownerEmail = `owner2-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const ownerPassword = "OwnerPass1!";
    const inviteEmail = `invite-${crypto.randomBytes(6).toString("hex")}@t.local`;
    await signup(baseUrl, ownerEmail, ownerPassword);
    const ownerIdQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [ownerEmail]);
    createdUserIds.push(ownerIdQ.rows[0].id);
    const ownerLogin = await login(baseUrl, ownerEmail, ownerPassword);
    assert.equal(ownerLogin.res.status, 200);
    const ownerCookie = authCookieFromLoginResponse(ownerLogin);
    const selectTeam = await fetchJson(`${baseUrl}/access/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ planCode: "team" }),
    });
    assert.equal(selectTeam.res.status, 200);

    const sendInvite = await fetchJson(`${baseUrl}/access/team/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ email: inviteEmail }),
    });
    assert.equal(sendInvite.res.status, 201);
    const inviteId = sendInvite.body.invite.id;
    const token = `decline-${crypto.randomBytes(8).toString("hex")}`;
    await pool.query("UPDATE team_member_invites SET token_hash = $2 WHERE id = $1", [inviteId, sha256(token)]);

    const decline = await fetchJson(`${baseUrl}/access/team/invites/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(decline.res.status, 200);
    assert.equal(decline.body.status, "declined");

    const resendDeclined = await fetchJson(`${baseUrl}/access/team/invites/${inviteId}/resend`, {
      method: "POST",
      headers: { Cookie: ownerCookie },
    });
    assert.equal(resendDeclined.res.status, 200);

    const declinedToPendingQ = await pool.query(
      "SELECT status, token_hash, expires_at FROM team_member_invites WHERE id = $1",
      [inviteId],
    );
    assert.equal(declinedToPendingQ.rows[0].status, "pending");
    assert.ok(declinedToPendingQ.rows[0].token_hash);

    const expiredToken = `expired-${crypto.randomBytes(8).toString("hex")}`;
    await pool.query(
      "UPDATE team_member_invites SET status = 'pending', token_hash = $2, expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [inviteId, sha256(expiredToken)],
    );
    const acceptExpired = await fetchJson(`${baseUrl}/access/team/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ token: expiredToken }),
    });
    assert.equal(acceptExpired.res.status, 409);
    assert.equal(acceptExpired.body.error, "invite_expired");

    const resendExpired = await fetchJson(`${baseUrl}/access/team/invites/${inviteId}/resend`, {
      method: "POST",
      headers: { Cookie: ownerCookie },
    });
    assert.equal(resendExpired.res.status, 200);

    const inviteAfterResendQ = await pool.query("SELECT token_hash FROM team_member_invites WHERE id = $1", [inviteId]);
    const acceptedToken = `accepted-${crypto.randomBytes(8).toString("hex")}`;
    await pool.query(
      "UPDATE team_member_invites SET token_hash = $2, status = 'pending', expires_at = NOW() + INTERVAL '1 day' WHERE id = $1",
      [inviteId, sha256(acceptedToken)],
    );

    const signupInvited = await signup(baseUrl, inviteEmail, "InvitePass1!");
    void signupInvited;
    const invitedIdQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [inviteEmail]);
    createdUserIds.push(invitedIdQ.rows[0].id);
    const invitedLogin = await login(baseUrl, inviteEmail, "InvitePass1!");
    assert.equal(invitedLogin.res.status, 200);
    const invitedCookie = authCookieFromLoginResponse(invitedLogin);
    const accept = await fetchJson(`${baseUrl}/access/team/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: invitedCookie },
      body: JSON.stringify({ token: acceptedToken }),
    });
    assert.equal(accept.res.status, 200);

    const resendAccepted = await fetchJson(`${baseUrl}/access/team/invites/${inviteId}/resend`, {
      method: "POST",
      headers: { Cookie: ownerCookie },
    });
    assert.equal(resendAccepted.res.status, 409);

    const inviteAcceptedQ = await pool.query(
      "SELECT status FROM team_member_invites WHERE id = $1",
      [inviteId],
    );
    assert.equal(inviteAcceptedQ.rows[0].status, "accepted");
    const activeMemberQ = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND tm.status = 'active' AND lower(u.email) = lower($2)`,
      [selectTeam.body.teamId, inviteEmail],
    );
    assert.equal(activeMemberQ.rows[0].c, 1);
    const reinviteActive = await fetchJson(`${baseUrl}/access/team/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ email: inviteEmail.toUpperCase() }),
    });
    assert.equal(reinviteActive.res.status, 409);
  });
});
