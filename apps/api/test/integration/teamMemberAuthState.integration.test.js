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

function clearCookieSeen(response) {
  const setCookie = String(response.res.headers.get("set-cookie") || "");
  if (!setCookie || !setCookie.includes("auth_token=")) return false;
  const lower = setCookie.toLowerCase();
  return lower.includes("max-age=0") || lower.includes("expires=thu, 01 jan 1970");
}

d("team invitation flow", () => {
  /** @type {import('pg').Pool} */
  let pool;
  let baseUrl;
  let closeServer;
  const createdUserIds = [];

  before(async () => {
    process.env.ENABLE_PAID_PLANS = process.env.ENABLE_PAID_PLANS || "true";
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
    const lookupPending = await fetchJson(
      `${baseUrl}/access/team/invites/lookup?token=${encodeURIComponent(knownToken)}`,
    );
    assert.equal(lookupPending.res.status, 200, JSON.stringify(lookupPending.body));
    assert.equal(lookupPending.body.ok, true);
    assert.equal(String(lookupPending.body.invite.email).toLowerCase(), existingEmail.toLowerCase());
    assert.equal(lookupPending.body.hasAccount, true);
    assert.equal(lookupPending.body.invite.canAccept, true);
    assert.equal(lookupPending.body.invite.canDecline, true);
    const lookupInvalid = await fetchJson(
      `${baseUrl}/access/team/invites/lookup?token=${encodeURIComponent(`invalid-${knownToken}`)}`,
    );
    assert.equal(lookupInvalid.res.status, 404);
    assert.equal(lookupInvalid.body.error, "invite_not_found");

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
    assert.equal(acceptMismatch.body.error, "account_mismatch");

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
    const acceptedLookupToken = `accepted-lookup-${crypto.randomBytes(8).toString("hex")}`;
    await pool.query("UPDATE team_member_invites SET token_hash = $2 WHERE id = $1", [
      inviteQ.rows[0].id,
      sha256(acceptedLookupToken),
    ]);
    const lookupAccepted = await fetchJson(
      `${baseUrl}/access/team/invites/lookup?token=${encodeURIComponent(acceptedLookupToken)}`,
    );
    assert.equal(lookupAccepted.res.status, 409);
    assert.equal(lookupAccepted.body.error, "invite_not_pending");
    assert.equal(lookupAccepted.body.status, "accepted");

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
    const lookupNewInvite = await fetchJson(
      `${baseUrl}/access/team/invites/lookup?token=${encodeURIComponent(
        `missing-before-token-${crypto.randomBytes(8).toString("hex")}`,
      )}`,
    );
    assert.equal(lookupNewInvite.res.status, 404);
    const token = `decline-${crypto.randomBytes(8).toString("hex")}`;
    await pool.query("UPDATE team_member_invites SET token_hash = $2 WHERE id = $1", [inviteId, sha256(token)]);
    const lookupBeforeSignup = await fetchJson(
      `${baseUrl}/access/team/invites/lookup?token=${encodeURIComponent(token)}`,
    );
    assert.equal(lookupBeforeSignup.res.status, 200);
    assert.equal(lookupBeforeSignup.body.hasAccount, false, "hasAccount must be based on invited email");

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
    const lookupExpired = await fetchJson(
      `${baseUrl}/access/team/invites/lookup?token=${encodeURIComponent(expiredToken)}`,
    );
    assert.equal(lookupExpired.res.status, 409);
    assert.equal(lookupExpired.body.error, "invite_expired");

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
    assert.equal(accept.body.organizationPlan, "team");
    assert.equal(Boolean(accept.body.planSelected), true);
    assert.equal(Boolean(accept.body.onboardingSkipped), true);

    const invitedMeAfterAccept = await fetchJson(`${baseUrl}/me`, {
      headers: { Cookie: invitedCookie },
    });
    assert.equal(invitedMeAfterAccept.res.status, 200, JSON.stringify(invitedMeAfterAccept.body));
    assert.ok(invitedMeAfterAccept.body.organizationId);
    assert.equal(invitedMeAfterAccept.body.organizationPlan, "team");
    assert.equal(Boolean(invitedMeAfterAccept.body.planSelected), true);
    assert.equal(Boolean(invitedMeAfterAccept.body.plan_selected), true);
    assert.equal(Boolean(invitedMeAfterAccept.body.onboardingSkipped), true);

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

  it("re-invite after account deletion returns lookup with hasAccount=false", async () => {
    const ownerEmail = `owner3-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const ownerPassword = "OwnerPass1!";
    const deletedEmail = `deleted-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const deletedPassword = "DeletedPass1!";

    await signup(baseUrl, ownerEmail, ownerPassword);
    await signup(baseUrl, deletedEmail, deletedPassword);

    const ownerIdQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [ownerEmail]);
    const deletedIdQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [deletedEmail]);
    createdUserIds.push(ownerIdQ.rows[0].id);

    const ownerLogin = await login(baseUrl, ownerEmail, ownerPassword);
    assert.equal(ownerLogin.res.status, 200);
    const ownerCookie = authCookieFromLoginResponse(ownerLogin);
    const selectTeam = await fetchJson(`${baseUrl}/access/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ planCode: "team" }),
    });
    assert.equal(selectTeam.res.status, 200, JSON.stringify(selectTeam.body));

    const deletedLogin = await login(baseUrl, deletedEmail, deletedPassword);
    assert.equal(deletedLogin.res.status, 200);
    const deletedCookie = authCookieFromLoginResponse(deletedLogin);
    const deleteSelf = await fetchJson(`${baseUrl}/me`, {
      method: "DELETE",
      headers: { Cookie: deletedCookie },
    });
    assert.equal(deleteSelf.res.status, 200, JSON.stringify(deleteSelf.body));
    assert.equal(deleteSelf.body.ok, true);

    const deletedStillExistsQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [
      deletedEmail,
    ]);
    assert.equal(deletedStillExistsQ.rows.length, 0, "deleted user must not exist");

    const reinvite = await fetchJson(`${baseUrl}/access/team/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ email: deletedEmail }),
    });
    assert.equal(reinvite.res.status, 201, JSON.stringify(reinvite.body));
    const inviteId = reinvite.body.invite?.id;
    assert.ok(inviteId, "invite id should be returned");

    const inviteRowQ = await pool.query(
      "SELECT id, status, token_hash FROM team_member_invites WHERE id = $1 LIMIT 1",
      [inviteId],
    );
    assert.equal(inviteRowQ.rows[0].status, "pending");
    assert.ok(inviteRowQ.rows[0].token_hash, "token hash should be set");

    const knownToken = `reinvite-${crypto.randomBytes(8).toString("hex")}`;
    await pool.query(
      "UPDATE team_member_invites SET token_hash = $2, expires_at = NOW() + INTERVAL '7 days', status = 'pending', updated_at = NOW() WHERE id = $1",
      [inviteId, sha256(knownToken)],
    );
    const lookup = await fetchJson(`${baseUrl}/access/team/invites/lookup?token=${encodeURIComponent(knownToken)}`);
    assert.equal(lookup.res.status, 200, JSON.stringify(lookup.body));
    assert.equal(lookup.body.ok, true);
    assert.equal(lookup.body.hasAccount, false);
    assert.equal(String(lookup.body.invite.email).toLowerCase(), deletedEmail.toLowerCase());

    const deletedId = deletedIdQ.rows[0]?.id;
    if (deletedId) {
      const idx = createdUserIds.indexOf(deletedId);
      if (idx >= 0) createdUserIds.splice(idx, 1);
    }
  });

  it("logout and delete-account clear auth cookie and /me returns 401", async () => {
    const logoutEmail = `logout-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const deleteEmail = `delacct-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "AccountPass1!";

    await signup(baseUrl, logoutEmail, password);
    await signup(baseUrl, deleteEmail, password);

    const logoutIdQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [logoutEmail]);
    const deleteIdQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [deleteEmail]);
    createdUserIds.push(logoutIdQ.rows[0].id, deleteIdQ.rows[0].id);

    const logoutLogin = await login(baseUrl, logoutEmail, password);
    assert.equal(logoutLogin.res.status, 200, JSON.stringify(logoutLogin.body));
    const logoutCookie = authCookieFromLoginResponse(logoutLogin);
    const logoutRes = await fetchJson(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { Cookie: logoutCookie },
    });
    assert.equal(logoutRes.res.status, 204);
    assert.equal(clearCookieSeen(logoutRes), true, "logout should clear auth_token cookie");
    const meAfterLogout = await fetchJson(`${baseUrl}/me`);
    assert.equal(meAfterLogout.res.status, 401, JSON.stringify(meAfterLogout.body));

    const deleteLogin = await login(baseUrl, deleteEmail, password);
    assert.equal(deleteLogin.res.status, 200, JSON.stringify(deleteLogin.body));
    const deleteCookie = authCookieFromLoginResponse(deleteLogin);
    const deleteRes = await fetchJson(`${baseUrl}/me`, {
      method: "DELETE",
      headers: { Cookie: deleteCookie },
    });
    assert.equal(deleteRes.res.status, 200, JSON.stringify(deleteRes.body));
    assert.equal(clearCookieSeen(deleteRes), true, "delete account should clear auth_token cookie");
    const meAfterDelete = await fetchJson(`${baseUrl}/me`);
    assert.equal(meAfterDelete.res.status, 401, JSON.stringify(meAfterDelete.body));
    const deletedStillExistsQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [
      deleteEmail,
    ]);
    assert.equal(deletedStillExistsQ.rows.length, 0, "deleted user must not exist");

    const deleteId = deleteIdQ.rows[0]?.id;
    if (deleteId) {
      const idx = createdUserIds.indexOf(deleteId);
      if (idx >= 0) createdUserIds.splice(idx, 1);
    }
  });

  it("team details are visible to all active team members", async () => {
    const ownerEmail = `owner-team-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const memberEmail = `member-team-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TeamPass1!";

    await signup(baseUrl, ownerEmail, password);
    await signup(baseUrl, memberEmail, password);

    const ownerIdQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [ownerEmail]);
    const memberIdQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [memberEmail]);
    const ownerId = ownerIdQ.rows[0].id;
    const memberId = memberIdQ.rows[0].id;
    createdUserIds.push(ownerId, memberId);

    const ownerLogin = await login(baseUrl, ownerEmail, password);
    assert.equal(ownerLogin.res.status, 200, JSON.stringify(ownerLogin.body));
    const ownerCookie = authCookieFromLoginResponse(ownerLogin);

    const selectTeam = await fetchJson(`${baseUrl}/access/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ planCode: "team" }),
    });
    assert.equal(selectTeam.res.status, 200, JSON.stringify(selectTeam.body));

    const invite = await fetchJson(`${baseUrl}/access/team/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ email: memberEmail }),
    });
    assert.equal(invite.res.status, 201, JSON.stringify(invite.body));
    const inviteId = invite.body.invite?.id;
    assert.ok(inviteId);

    const rawToken = `team-view-${crypto.randomBytes(8).toString("hex")}`;
    await pool.query("UPDATE team_member_invites SET token_hash = $2 WHERE id = $1", [inviteId, sha256(rawToken)]);

    const memberLogin = await login(baseUrl, memberEmail, password);
    assert.equal(memberLogin.res.status, 200, JSON.stringify(memberLogin.body));
    const memberCookie = authCookieFromLoginResponse(memberLogin);
    const acceptInvite = await fetchJson(`${baseUrl}/access/team/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: memberCookie },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(acceptInvite.res.status, 200, JSON.stringify(acceptInvite.body));

    const teamDetailsForOwner = await fetchJson(`${baseUrl}/team`, {
      headers: { Cookie: ownerCookie },
    });
    assert.equal(teamDetailsForOwner.res.status, 200, JSON.stringify(teamDetailsForOwner.body));
    assert.equal(teamDetailsForOwner.body.plan, "team");
    assert.equal(teamDetailsForOwner.body.owner.email.toLowerCase(), ownerEmail.toLowerCase());

    const teamDetailsForMember = await fetchJson(`${baseUrl}/team`, {
      headers: { Cookie: memberCookie },
    });
    assert.equal(teamDetailsForMember.res.status, 200, JSON.stringify(teamDetailsForMember.body));
    assert.equal(teamDetailsForMember.body.id, teamDetailsForOwner.body.id);
    assert.equal(
      teamDetailsForMember.body.members.some((m) => m.email.toLowerCase() === ownerEmail.toLowerCase() && m.role === "owner"),
      true
    );
    assert.equal(
      teamDetailsForMember.body.members.some((m) => m.email.toLowerCase() === memberEmail.toLowerCase() && m.role === "member"),
      true
    );
  });

  it("team details expose owner/admin/member roles", async () => {
    const ownerEmail = `owner-role-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const adminEmail = `admin-role-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const memberEmail = `member-role-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TeamPass1!";

    await signup(baseUrl, ownerEmail, password);
    await signup(baseUrl, adminEmail, password);
    await signup(baseUrl, memberEmail, password);

    const ownerId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [ownerEmail])).rows[0].id;
    const adminId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [adminEmail])).rows[0].id;
    const memberId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [memberEmail])).rows[0].id;
    createdUserIds.push(ownerId, adminId, memberId);

    const ownerLogin = await login(baseUrl, ownerEmail, password);
    const ownerCookie = authCookieFromLoginResponse(ownerLogin);
    const selectTeam = await fetchJson(`${baseUrl}/access/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ planCode: "team" }),
    });
    assert.equal(selectTeam.res.status, 200, JSON.stringify(selectTeam.body));
    const teamId = selectTeam.body.teamId;

    await pool.query(
      `INSERT INTO team_members (team_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'active'), ($1, $3, 'member', 'active')
       ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status`,
      [teamId, adminId, memberId]
    );

    const memberLogin = await login(baseUrl, memberEmail, password);
    const memberCookie = authCookieFromLoginResponse(memberLogin);
    const details = await fetchJson(`${baseUrl}/team`, { headers: { Cookie: memberCookie } });
    assert.equal(details.res.status, 200, JSON.stringify(details.body));
    assert.equal(details.body.members.some((m) => m.email.toLowerCase() === ownerEmail.toLowerCase() && m.role === "owner"), true);
    assert.equal(details.body.members.some((m) => m.email.toLowerCase() === adminEmail.toLowerCase() && m.role === "admin"), true);
    assert.equal(details.body.members.some((m) => m.email.toLowerCase() === memberEmail.toLowerCase() && m.role === "member"), true);
  });

  it("non-team users cannot access /team details", async () => {
    const email = `solo-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "SoloPass1!";
    await signup(baseUrl, email, password);
    const userId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [email])).rows[0].id;
    createdUserIds.push(userId);

    const loginRes = await login(baseUrl, email, password);
    const cookie = authCookieFromLoginResponse(loginRes);
    const details = await fetchJson(`${baseUrl}/team`, { headers: { Cookie: cookie } });
    assert.equal(details.res.status, 403, JSON.stringify(details.body));
  });

  it("admin permissions do not exceed owner-only actions", async () => {
    const ownerEmail = `owner-boundary-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const adminAEmail = `admin-a-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const adminBEmail = `admin-b-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const memberEmail = `member-boundary-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TeamPass1!";

    await signup(baseUrl, ownerEmail, password);
    await signup(baseUrl, adminAEmail, password);
    await signup(baseUrl, adminBEmail, password);
    await signup(baseUrl, memberEmail, password);

    const ownerId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [ownerEmail])).rows[0].id;
    const adminAId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [adminAEmail])).rows[0].id;
    const adminBId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [adminBEmail])).rows[0].id;
    const memberId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [memberEmail])).rows[0].id;
    createdUserIds.push(ownerId, adminAId, adminBId, memberId);

    const ownerLogin = await login(baseUrl, ownerEmail, password);
    const ownerCookie = authCookieFromLoginResponse(ownerLogin);
    const selectTeam = await fetchJson(`${baseUrl}/access/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ planCode: "team" }),
    });
    assert.equal(selectTeam.res.status, 200, JSON.stringify(selectTeam.body));
    const teamId = selectTeam.body.teamId;

    await pool.query(
      `INSERT INTO team_members (team_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'active'), ($1, $3, 'admin', 'active'), ($1, $4, 'member', 'active')
       ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status`,
      [teamId, adminAId, adminBId, memberId]
    );

    const adminLogin = await login(baseUrl, adminAEmail, password);
    const adminCookie = authCookieFromLoginResponse(adminLogin);

    const removeOwner = await fetchJson(`${baseUrl}/access/team/members/${ownerId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    assert.equal(removeOwner.res.status, 403);

    const removeAdmin = await fetchJson(`${baseUrl}/access/team/members/${adminBId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    assert.equal(removeAdmin.res.status, 403);

    const removeMember = await fetchJson(`${baseUrl}/access/team/members/${memberId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    assert.equal(removeMember.res.status, 204);
  });

  it("owner can promote and demote roles", async () => {
    const ownerEmail = `owner-rolechg-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const memberEmail = `member-rolechg-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TeamPass1!";
    await signup(baseUrl, ownerEmail, password);
    await signup(baseUrl, memberEmail, password);
    const ownerId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [ownerEmail])).rows[0].id;
    const memberId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [memberEmail])).rows[0].id;
    createdUserIds.push(ownerId, memberId);
    const ownerCookie = authCookieFromLoginResponse(await login(baseUrl, ownerEmail, password));
    const selectTeam = await fetchJson(`${baseUrl}/access/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ planCode: "team" }),
    });
    const teamId = selectTeam.body.teamId;
    await pool.query(
      `INSERT INTO team_members (team_id, user_id, role, status)
       VALUES ($1, $2, 'member', 'active')
       ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status`,
      [teamId, memberId]
    );

    const promote = await fetchJson(`${baseUrl}/team/members/${memberId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ role: "admin" }),
    });
    assert.equal(promote.res.status, 200, JSON.stringify(promote.body));
    const roleAfterPromote = await pool.query(
      "SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2 LIMIT 1",
      [teamId, memberId]
    );
    assert.equal(roleAfterPromote.rows[0].role, "admin");

    const demote = await fetchJson(`${baseUrl}/team/members/${memberId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ role: "member" }),
    });
    assert.equal(demote.res.status, 200, JSON.stringify(demote.body));
    const roleAfterDemote = await pool.query(
      "SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2 LIMIT 1",
      [teamId, memberId]
    );
    assert.equal(roleAfterDemote.rows[0].role, "member");
  });

  it("member cannot change roles and non-owner cannot transfer ownership", async () => {
    const ownerEmail = `owner-transfer-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const adminEmail = `admin-transfer-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const memberEmail = `member-transfer-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const outsiderEmail = `outsider-transfer-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TeamPass1!";
    await signup(baseUrl, ownerEmail, password);
    await signup(baseUrl, adminEmail, password);
    await signup(baseUrl, memberEmail, password);
    await signup(baseUrl, outsiderEmail, password);
    const ownerId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [ownerEmail])).rows[0].id;
    const adminId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [adminEmail])).rows[0].id;
    const memberId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [memberEmail])).rows[0].id;
    const outsiderId = (await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [outsiderEmail])).rows[0].id;
    createdUserIds.push(ownerId, adminId, memberId, outsiderId);
    const ownerCookie = authCookieFromLoginResponse(await login(baseUrl, ownerEmail, password));
    const adminCookie = authCookieFromLoginResponse(await login(baseUrl, adminEmail, password));
    const memberCookie = authCookieFromLoginResponse(await login(baseUrl, memberEmail, password));
    const selectTeam = await fetchJson(`${baseUrl}/access/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ planCode: "team" }),
    });
    const teamId = selectTeam.body.teamId;
    await pool.query(
      `INSERT INTO team_members (team_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'active'), ($1, $3, 'member', 'active')
       ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status`,
      [teamId, adminId, memberId]
    );

    const memberRoleChange = await fetchJson(`${baseUrl}/team/members/${adminId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: memberCookie },
      body: JSON.stringify({ role: "member" }),
    });
    assert.equal(memberRoleChange.res.status, 403);

    const adminTransfer = await fetchJson(`${baseUrl}/team/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ newOwnerUserId: memberId }),
    });
    assert.equal(adminTransfer.res.status, 403);

    const outsiderTransfer = await fetchJson(`${baseUrl}/team/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ newOwnerUserId: outsiderId }),
    });
    assert.equal(outsiderTransfer.res.status, 400);

    const ownerTransfer = await fetchJson(`${baseUrl}/team/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ newOwnerUserId: adminId }),
    });
    assert.equal(ownerTransfer.res.status, 200, JSON.stringify(ownerTransfer.body));
    const newOwnerRow = await pool.query("SELECT owner_user_id FROM teams WHERE id = $1 LIMIT 1", [teamId]);
    assert.equal(newOwnerRow.rows[0].owner_user_id, adminId);

    const accessTeamOwnerView = await fetchJson(`${baseUrl}/access/team`, {
      headers: { Cookie: ownerCookie },
    });
    assert.equal(accessTeamOwnerView.res.status, 200, JSON.stringify(accessTeamOwnerView.body));
    assert.equal(
      accessTeamOwnerView.body.members.some((m) => m.email.toLowerCase() === adminEmail.toLowerCase() && m.role === "owner"),
      true
    );
    assert.equal(
      accessTeamOwnerView.body.members.some((m) => m.email.toLowerCase() === ownerEmail.toLowerCase() && m.role === "admin"),
      true
    );
  });
});
