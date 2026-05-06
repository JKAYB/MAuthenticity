const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { pool } = require("../db/pool");
const { normalizeEmail } = require("../utils/normalizeEmail");
const { sendTeamInviteEmail } = require("../services/email.service");
const {
  canManageTeam,
  canManageAdmins,
  canManageMembers,
  isOwner,
  normalizeTeamRole,
  TEAM_ROLE_MEMBER,
  getEffectivePlan,
  PLAN_CODE_FREE,
  PLAN_CODE_INDIVIDUAL_MONTHLY,
  PLAN_CODE_INDIVIDUAL_YEARLY,
  PLAN_CODE_TEAM,
} = require("../services/access-control.service");

const PAID_DURATION_DAYS = {
  [PLAN_CODE_INDIVIDUAL_MONTHLY]: 30,
  [PLAN_CODE_INDIVIDUAL_YEARLY]: 365,
  [PLAN_CODE_TEAM]: 30,
};

const INVITE_TTL_DAYS = 7;

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function createInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

function tokenPreview(token) {
  const raw = String(token || "");
  if (!raw) return "(empty)";
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
}

function inviteUrlForToken(rawToken, action = "accept") {
  const appBase = String(process.env.WEB_APP_URL || "http://localhost:5173").replace(/\/+$/, "");
  const safeAction = action === "decline" ? "decline" : "accept";
  return `${appBase}/accept-invite?token=${encodeURIComponent(rawToken)}&action=${safeAction}`;
}

async function lookupTeamInvite(req, res, next) {
  try {
    const token = String(req.query?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token is required" });
    console.info("[invite.lookup] request", { token: tokenPreview(token) });
    const tokenHash = sha256(token);
    const inviteQ = await pool.query(
      `SELECT id, team_id, email, role, status, expires_at
       FROM team_member_invites
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    const invite = inviteQ.rows[0];
    if (!invite) {
      console.info("[invite.lookup] result", { found: false, token: tokenPreview(token) });
      return res.status(404).json({ error: "invite_not_found" });
    }
    if (invite.status !== "pending") {
      if (invite.status === "expired") {
        return res.status(409).json({ error: "invite_expired" });
      }
      return res.status(409).json({ error: "invite_not_pending", status: invite.status });
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      await pool.query(`UPDATE team_member_invites SET status = 'expired', updated_at = NOW() WHERE id = $1`, [invite.id]);
      return res.status(409).json({ error: "invite_expired" });
    }
    const teamQ = await pool.query("SELECT id, name FROM teams WHERE id = $1 LIMIT 1", [invite.team_id]);
    const rawTeam = teamQ.rows[0] || null;
    const resolvedOrganizationName =
      (rawTeam?.name && String(rawTeam.name).trim()) || "MediaAuth Team";
    const invitedUserQ = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [invite.email]);
    console.info("[invite.lookup] result", {
      found: true,
      token: tokenPreview(token),
      status: invite.status,
      inviteEmail: invite.email,
      hasAccount: Boolean(invitedUserQ.rows[0]),
    });
    return res.json({
      ok: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role || "team_member",
        status: invite.status,
        expires_at: invite.expires_at,
        team: rawTeam ? { ...rawTeam, name: resolvedOrganizationName } : null,
        organizationName: resolvedOrganizationName,
        canAccept: true,
        canDecline: true,
      },
      hasAccount: Boolean(invitedUserQ.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
}

async function expirePendingInvitesForTeam(teamId) {
  await pool.query(
    `UPDATE team_member_invites
     SET status = 'expired', updated_at = NOW()
     WHERE team_id = $1
       AND status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`,
    [teamId],
  );
}

async function selectPlan(req, res, next) {
  try {
    const planCode = String(req.body?.planCode || "").trim().toLowerCase();
    const allowed = new Set([
      PLAN_CODE_FREE,
      PLAN_CODE_INDIVIDUAL_MONTHLY,
      PLAN_CODE_INDIVIDUAL_YEARLY,
      PLAN_CODE_TEAM,
    ]);
    if (!allowed.has(planCode)) {
      return res.status(400).json({ error: "Invalid plan selection" });
    }

    const effectiveBefore = await getEffectivePlan(req.user.id);
    if (effectiveBefore.teamRole && !isOwner(effectiveBefore.teamRole)) {
      return res.status(403).json({ error: "Plan is managed by your team owner" });
    }

    await pool.query("BEGIN");
    try {
      // Always clear existing team associations before recomputing new entitlement context.
      // This prevents stale team-based unlimited access after switching away from Team.
      const ownedTeams = await pool.query("SELECT id FROM teams WHERE owner_user_id = $1", [req.user.id]);
      for (const t of ownedTeams.rows) {
        await pool.query("DELETE FROM teams WHERE id = $1", [t.id]);
      }
      await pool.query("DELETE FROM team_members WHERE user_id = $1", [req.user.id]);

      await pool.query("UPDATE users SET plan = $1, plan_selected = TRUE WHERE id = $2", [
        planCode,
        req.user.id,
      ]);

      if (planCode === PLAN_CODE_FREE) {
        await pool.query("COMMIT");
        return res.json({ ok: true, planCode });
      }

      if (planCode === PLAN_CODE_TEAM) {
        const teamId = uuidv4();
        await pool.query("INSERT INTO teams (id, owner_user_id, name) VALUES ($1, $2, $3)", [
          teamId,
          req.user.id,
          "My Team",
        ]);
        await pool.query(
          `INSERT INTO subscriptions (id, user_id, team_id, plan_code, status, started_at, expires_at)
           VALUES ($1, NULL, $2, $3, 'active', NOW(), NOW() + INTERVAL '30 days')`,
          [uuidv4(), teamId, PLAN_CODE_TEAM],
        );
        await pool.query("COMMIT");
        return res.json({ ok: true, planCode, teamId });
      }

      const days = PAID_DURATION_DAYS[planCode] || 30;
      await pool.query(
        `INSERT INTO subscriptions (id, user_id, team_id, plan_code, status, started_at, expires_at)
         VALUES ($1, $2, NULL, $3, 'active', NOW(), NOW() + ($4::text || ' days')::interval)`,
        [uuidv4(), req.user.id, planCode, String(days)],
      );

      await pool.query("COMMIT");
      return res.json({ ok: true, planCode });
    } catch (txError) {
      await pool.query("ROLLBACK");
      throw txError;
    }
  } catch (error) {
    return next(error);
  }
}

async function getAccessState(req, res, next) {
  try {
    const effectivePlan = await getEffectivePlan(req.user.id);
    return res.json({
      plan_code: effectivePlan.planCode,
      access_state: effectivePlan.accessState,
      scans_used: effectivePlan.scansUsed,
      scan_limit: effectivePlan.scanLimit,
      has_paid_history: effectivePlan.hasPaidHistory,
      plan_selected: effectivePlan.planSelected,
      must_change_password: effectivePlan.mustChangePassword,
      team_role: effectivePlan.teamRole,
      team_id: effectivePlan.teamId,
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyTeam(req, res, next) {
  try {
    const effectivePlan = await getEffectivePlan(req.user.id);
    if (!effectivePlan.teamId) {
      return res.json({ team: null, members: [], invites: [] });
    }
    await expirePendingInvitesForTeam(effectivePlan.teamId);
    const teamQ = await pool.query("SELECT id, owner_user_id, name, created_at FROM teams WHERE id = $1", [
      effectivePlan.teamId,
    ]);
    const membersQ = await pool.query(
      `SELECT u.id, u.email, tm.role, tm.status, u.must_change_password
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND tm.status = 'active'
       ORDER BY u.email ASC`,
      [effectivePlan.teamId],
    );
    const invitesQ = await pool.query(
      `SELECT id, email, role, status, expires_at, accepted_at, declined_at, revoked_at, created_at, updated_at
       FROM team_member_invites
       WHERE team_id = $1
       ORDER BY created_at DESC`,
      [effectivePlan.teamId],
    );
    const ownerUserId = teamQ.rows[0]?.owner_user_id || null;
    const ownerQ = ownerUserId
      ? await pool.query(
          "SELECT id, email, must_change_password FROM users WHERE id = $1 LIMIT 1",
          [ownerUserId]
        )
      : { rows: [] };
    const ownerRow = ownerQ.rows[0] || null;
    const membersWithOwnerRole = membersQ.rows.map((member) => ({
      ...member,
      role: member.id === ownerUserId ? "owner" : publicRoleLabel(member.role),
    }));
    const ownerAlreadyPresent = ownerUserId
      ? membersWithOwnerRole.some((member) => member.id === ownerUserId)
      : false;
    if (ownerRow && !ownerAlreadyPresent) {
      membersWithOwnerRole.unshift({
        id: ownerRow.id,
        email: ownerRow.email,
        role: "owner",
        status: "active",
        must_change_password: ownerRow.must_change_password,
      });
    }

    const activeEmails = new Set(membersWithOwnerRole.map((m) => normalizeEmail(m.email)));
    const invites = invitesQ.rows.filter((inv) => {
      if (inv.status !== "accepted") return true;
      return !activeEmails.has(normalizeEmail(inv.email));
    });
    return res.json({
      team: teamQ.rows[0] || null,
      members: membersWithOwnerRole,
      invites: invites.map((inv) => ({ ...inv, role: publicRoleLabel(inv.role) })),
      role: publicRoleLabel(effectivePlan.teamRole),
    });
  } catch (error) {
    return next(error);
  }
}

function publicRoleLabel(rawRole) {
  return normalizeTeamRole(rawRole);
}

async function getTeamDetails(req, res, next) {
  try {
    const effectivePlan = await getEffectivePlan(req.user.id);
    if (!effectivePlan.teamId) {
      return res.status(403).json({ error: "not_in_team" });
    }

    const teamQ = await pool.query(
      `SELECT t.id, t.name, t.owner_user_id,
              owner.email AS owner_email,
              owner.display_name AS owner_name
       FROM teams t
       JOIN users owner ON owner.id = t.owner_user_id
       WHERE t.id = $1
       LIMIT 1`,
      [effectivePlan.teamId]
    );
    const team = teamQ.rows[0];
    if (!team) {
      return res.status(404).json({ error: "team_not_found" });
    }

    const membersQ = await pool.query(
      `SELECT u.id,
              u.email,
              u.display_name,
              CASE
                WHEN u.id = t.owner_user_id THEN 'owner'
                WHEN tm.role IS NULL THEN 'member'
                ELSE tm.role
              END AS role
       FROM teams t
       JOIN users u
         ON u.id = t.owner_user_id
         OR u.id IN (
           SELECT tm2.user_id
           FROM team_members tm2
           WHERE tm2.team_id = t.id
             AND tm2.status = 'active'
         )
       LEFT JOIN team_members tm
         ON tm.team_id = t.id
        AND tm.user_id = u.id
        AND tm.status = 'active'
       WHERE t.id = $1
       GROUP BY t.owner_user_id, u.id, u.email, u.display_name, tm.role
       ORDER BY CASE WHEN u.id = t.owner_user_id THEN 0 ELSE 1 END, lower(u.email) ASC`,
      [team.id]
    );

    return res.json({
      id: team.id,
      name: team.name || "MediaAuth Team",
      plan: PLAN_CODE_TEAM,
      owner: {
        id: team.owner_user_id,
        name: team.owner_name && String(team.owner_name).trim() ? String(team.owner_name).trim() : null,
        email: team.owner_email,
      },
      members: membersQ.rows.map((member) => ({
        id: member.id,
        name: member.display_name && String(member.display_name).trim() ? String(member.display_name).trim() : null,
        email: member.email,
        role: publicRoleLabel(member.role),
      })),
    });
  } catch (error) {
    return next(error);
  }
}

async function addTeamMember(req, res, next) {
  try {
    const teamCheck = await canManageTeam(req.user.id);
    if (!teamCheck.ok) {
      return res.status(403).json({ error: "Only owner/admin can manage members" });
    }
    const email = normalizeEmail(req.body?.email);
    const resend = Boolean(req.body?.resend);
    if (!email) return res.status(400).json({ error: "email is required" });
    await expirePendingInvitesForTeam(teamCheck.effectivePlan.teamId);

    const activeMemberQ = await pool.query(
      `SELECT u.id
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
         AND tm.status = 'active'
         AND lower(u.email) = lower($2)
       LIMIT 1`,
      [teamCheck.effectivePlan.teamId, email],
    );
    if (activeMemberQ.rows[0]) {
      return res.status(409).json({ error: "already_member", code: "already_member" });
    }

    const existingInviteQ = await pool.query(
      `SELECT id, email, role, status, expires_at, created_at, updated_at
       FROM team_member_invites
       WHERE team_id = $1 AND lower(email) = lower($2)
       LIMIT 1`,
      [teamCheck.effectivePlan.teamId, email],
    );
    const existingInvite = existingInviteQ.rows[0] || null;
    const rawToken = createInviteToken();
    const tokenHash = sha256(rawToken);
    await pool.query(
      `INSERT INTO team_member_invites (
         id, team_id, email, invited_by_user_id, role, status, token_hash, expires_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW() + INTERVAL '${INVITE_TTL_DAYS} days', NOW())
       ON CONFLICT (team_id, email)
       DO UPDATE SET
         role = EXCLUDED.role,
         status = 'pending',
         token_hash = EXCLUDED.token_hash,
         invited_by_user_id = EXCLUDED.invited_by_user_id,
         expires_at = EXCLUDED.expires_at,
         accepted_at = NULL,
         declined_at = NULL,
         revoked_at = NULL,
         updated_at = NOW()`,
      [uuidv4(), teamCheck.effectivePlan.teamId, email, req.user.id, TEAM_ROLE_MEMBER, tokenHash],
    );
    const inviteQ = await pool.query(
      `SELECT id, email, role, status, expires_at, created_at, updated_at
       FROM team_member_invites
       WHERE team_id = $1 AND lower(email) = lower($2)
       LIMIT 1`,
      [teamCheck.effectivePlan.teamId, email],
    );
    const teamInfoQ = await pool.query("SELECT name FROM teams WHERE id = $1 LIMIT 1", [
      teamCheck.effectivePlan.teamId,
    ]);
    const teamName = teamInfoQ.rows[0]?.name || "MediaAuth Team";
    console.info("[invite.create]", {
      invitedEmail: email,
      inviteId: inviteQ.rows[0]?.id || null,
      token: tokenPreview(rawToken),
      status: "pending",
      reusedExistingInvite: Boolean(existingInvite),
      requestedResend: resend,
    });
    try {
      await sendTeamInviteEmail({
        to: email,
        inviteUrl: inviteUrlForToken(rawToken, "accept"),
        inviteDeclineUrl: inviteUrlForToken(rawToken, "decline"),
        teamName,
        invitedByEmail: req.user?.email || "",
        inviteTokenPreview: tokenPreview(rawToken),
      });
    } catch (emailError) {
      return res.status(502).json({
        error: "Failed to send invitation email",
        details: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }
    return res.status(201).json({
      ok: true,
      status: "invitation_sent",
      invite: inviteQ.rows[0] || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function acceptTeamInvite(req, res, next) {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token is required" });
    if (!req.user?.id) return res.status(401).json({ error: "requires_auth" });
    console.info("[invite.accept] request", {
      token: tokenPreview(token),
      userId: req.user.id,
    });
    const tokenHash = sha256(token);
    const inviteQ = await pool.query(
      `SELECT id, team_id, email, role, status, expires_at
       FROM team_member_invites
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    const invite = inviteQ.rows[0];
    if (!invite) {
      console.info("[invite.accept] result", { found: false, token: tokenPreview(token) });
      return res.status(404).json({ error: "invite_not_found" });
    }
    console.info("[invite.accept] found", {
      inviteId: invite.id,
      status: invite.status,
      inviteEmail: invite.email,
    });
    if (invite.status !== "pending") return res.status(409).json({ error: "invite_not_pending" });
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      await pool.query(`UPDATE team_member_invites SET status = 'expired', updated_at = NOW() WHERE id = $1`, [invite.id]);
      return res.status(409).json({ error: "invite_expired" });
    }
    const meQ = await pool.query("SELECT id, email FROM users WHERE id = $1 LIMIT 1", [req.user.id]);
    const me = meQ.rows[0];
    if (!me) return res.status(404).json({ error: "user_not_found" });
    if (normalizeEmail(me.email) !== normalizeEmail(invite.email)) {
      return res.status(403).json({ error: "account_mismatch" });
    }
    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO team_members (team_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
        [invite.team_id, me.id, publicRoleLabel(invite.role || TEAM_ROLE_MEMBER)],
      );
      await pool.query(
        `UPDATE team_member_invites
         SET status = 'accepted', accepted_at = NOW(), updated_at = NOW(), token_hash = NULL
         WHERE id = $1`,
        [invite.id],
      );
      await pool.query("COMMIT");
      console.info("[invite.accept] success", {
        inviteId: invite.id,
        tokenHashCleared: true,
      });
      const effectivePlan = await getEffectivePlan(me.id);
      const teamQ = await pool.query("SELECT id, name FROM teams WHERE id = $1 LIMIT 1", [invite.team_id]);
      const team = teamQ.rows[0] || null;
      return res.json({
        ok: true,
        status: "accepted",
        organizationId: team?.id || null,
        organizationName: team?.name || null,
        organizationPlan: effectivePlan.planCode || null,
        planSelected: Boolean(effectivePlan.planSelected || effectivePlan.teamId),
        onboardingSkipped: Boolean(effectivePlan.teamId && !effectivePlan.planSelected),
      });
    } catch (txError) {
      await pool.query("ROLLBACK");
      throw txError;
    }
  } catch (error) {
    return next(error);
  }
}

async function declineTeamInvite(req, res, next) {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token is required" });
    const tokenHash = sha256(token);
    const inviteQ = await pool.query(
      `SELECT id, status, expires_at
       FROM team_member_invites
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    const invite = inviteQ.rows[0];
    if (!invite) return res.status(404).json({ error: "invite_not_found" });
    if (invite.status !== "pending") return res.status(409).json({ error: "invite_not_pending" });
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      await pool.query(`UPDATE team_member_invites SET status = 'expired', updated_at = NOW() WHERE id = $1`, [invite.id]);
      return res.status(409).json({ error: "invite_expired" });
    }
    await pool.query(
      `UPDATE team_member_invites
       SET status = 'declined', declined_at = NOW(), updated_at = NOW(), token_hash = NULL
       WHERE id = $1`,
      [invite.id],
    );
    return res.json({ ok: true, status: "declined" });
  } catch (error) {
    return next(error);
  }
}

async function resendTeamInvite(req, res, next) {
  try {
    const teamCheck = await canManageTeam(req.user.id);
    if (!teamCheck.ok) {
      return res.status(403).json({ error: "Only owner/admin can manage members" });
    }
    const inviteId = String(req.params.inviteId || "").trim();
    if (!inviteId) return res.status(400).json({ error: "inviteId is required" });
    const inviteQ = await pool.query(
      `SELECT id, team_id, status
       FROM team_member_invites
       WHERE id = $1
       LIMIT 1`,
      [inviteId],
    );
    const invite = inviteQ.rows[0];
    if (!invite || invite.team_id !== teamCheck.effectivePlan.teamId) {
      return res.status(404).json({ error: "invite_not_found" });
    }
    if (invite.status === "accepted") {
      return res.status(409).json({ error: "cannot_resend_accepted" });
    }
    if (!["pending", "declined", "expired", "revoked"].includes(invite.status)) {
      return res.status(409).json({ error: "invite_not_resendable" });
    }
    const rawToken = createInviteToken();
    const tokenHash = sha256(rawToken);
    await pool.query(
      `UPDATE team_member_invites
       SET status = 'pending',
           token_hash = $2,
           expires_at = NOW() + INTERVAL '${INVITE_TTL_DAYS} days',
           invited_by_user_id = $3,
           accepted_at = NULL,
           declined_at = NULL,
           revoked_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [inviteId, tokenHash, req.user.id],
    );
    const inviteInfoQ = await pool.query(
      `SELECT email, team_id
       FROM team_member_invites
       WHERE id = $1
       LIMIT 1`,
      [inviteId],
    );
    const inviteInfo = inviteInfoQ.rows[0];
    const teamInfoQ = await pool.query("SELECT name FROM teams WHERE id = $1 LIMIT 1", [invite.team_id]);
    const teamName = teamInfoQ.rows[0]?.name || "MediaAuth Team";
    try {
      await sendTeamInviteEmail({
        to: inviteInfo?.email || "",
        inviteUrl: inviteUrlForToken(rawToken, "accept"),
        inviteDeclineUrl: inviteUrlForToken(rawToken, "decline"),
        teamName,
        invitedByEmail: req.user?.email || "",
        inviteTokenPreview: tokenPreview(rawToken),
      });
    } catch (emailError) {
      return res.status(502).json({
        error: "Failed to send invitation email",
        details: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }
    return res.json({ ok: true, status: "invitation_sent", inviteId });
  } catch (error) {
    return next(error);
  }
}

async function removeTeamMember(req, res, next) {
  try {
    const teamCheck = await canManageTeam(req.user.id);
    if (!teamCheck.ok) {
      return res.status(403).json({ error: "Only owner/admin can manage members" });
    }
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const teamId = teamCheck.effectivePlan.teamId;
    const actorRole = publicRoleLabel(teamCheck.effectivePlan.teamRole);
    const teamOwnerQ = await pool.query("SELECT owner_user_id FROM teams WHERE id = $1 LIMIT 1", [teamId]);
    const ownerId = teamOwnerQ.rows[0]?.owner_user_id || null;
    if (!ownerId) {
      return res.status(404).json({ error: "team_not_found" });
    }
    if (userId === ownerId) {
      return res.status(403).json({ error: "owner_cannot_be_removed" });
    }

    const targetRoleQ = await pool.query(
      `SELECT role
       FROM team_members
       WHERE team_id = $1 AND user_id = $2 AND status = 'active'
       LIMIT 1`,
      [teamId, userId]
    );
    if (!targetRoleQ.rows[0]) {
      return res.status(404).json({ error: "member_not_found" });
    }
    const targetRole = publicRoleLabel(targetRoleQ.rows[0].role);
    if (!canManageMembers(actorRole)) {
      return res.status(403).json({ error: "insufficient_permissions" });
    }
    if (!canManageAdmins(actorRole) && (targetRole === "admin" || targetRole === "owner")) {
      return res.status(403).json({ error: "owner_required_for_admin_management" });
    }

    await pool.query("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", [teamId, userId]);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function updateTeamMemberRole(req, res, next) {
  try {
    const teamCheck = await canManageTeam(req.user.id);
    if (!teamCheck.ok) {
      return res.status(403).json({ error: "Only owner/admin can manage members" });
    }
    const teamId = teamCheck.effectivePlan.teamId;
    const actorRole = publicRoleLabel(teamCheck.effectivePlan.teamRole);
    const memberId = String(req.params.memberId || "").trim();
    const requestedRole = publicRoleLabel(req.body?.role);
    if (!memberId) return res.status(400).json({ error: "memberId is required" });
    if (requestedRole !== "admin" && requestedRole !== "member") {
      return res.status(400).json({ error: "role must be admin or member" });
    }

    const ownerQ = await pool.query("SELECT owner_user_id FROM teams WHERE id = $1 LIMIT 1", [teamId]);
    const ownerId = ownerQ.rows[0]?.owner_user_id || null;
    if (!ownerId) return res.status(404).json({ error: "team_not_found" });
    if (memberId === ownerId) {
      return res.status(403).json({ error: "owner_role_cannot_be_changed" });
    }

    const targetQ = await pool.query(
      `SELECT role
       FROM team_members
       WHERE team_id = $1 AND user_id = $2 AND status = 'active'
       LIMIT 1`,
      [teamId, memberId]
    );
    if (!targetQ.rows[0]) return res.status(404).json({ error: "member_not_found" });
    const targetRole = publicRoleLabel(targetQ.rows[0].role);

    if (!canManageMembers(actorRole)) {
      return res.status(403).json({ error: "insufficient_permissions" });
    }
    if (!canManageAdmins(actorRole) && (targetRole === "admin" || requestedRole === "admin")) {
      return res.status(403).json({ error: "owner_required_for_admin_management" });
    }

    await pool.query(
      "UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2 AND status = 'active'",
      [teamId, memberId, requestedRole]
    );
    return res.json({ ok: true, memberId, role: requestedRole });
  } catch (error) {
    return next(error);
  }
}

async function transferTeamOwnership(req, res, next) {
  try {
    const effectivePlan = await getEffectivePlan(req.user.id);
    if (!effectivePlan.teamId) {
      return res.status(403).json({ error: "not_in_team" });
    }
    if (!isOwner(effectivePlan.teamRole)) {
      return res.status(403).json({ error: "owner_required" });
    }

    const teamId = effectivePlan.teamId;
    const currentOwnerId = req.user.id;
    const newOwnerUserId = String(req.body?.newOwnerUserId || "").trim();
    if (!newOwnerUserId) {
      return res.status(400).json({ error: "newOwnerUserId is required" });
    }
    if (newOwnerUserId === currentOwnerId) {
      return res.status(400).json({ error: "new owner must be a different user" });
    }

    const targetMemberQ = await pool.query(
      `SELECT user_id
       FROM team_members
       WHERE team_id = $1 AND user_id = $2 AND status = 'active'
       LIMIT 1`,
      [teamId, newOwnerUserId]
    );
    if (!targetMemberQ.rows[0]) {
      return res.status(400).json({ error: "new owner must be an active team member" });
    }

    await pool.query("BEGIN");
    try {
      await pool.query("UPDATE teams SET owner_user_id = $2 WHERE id = $1", [teamId, newOwnerUserId]);
      await pool.query(
        `INSERT INTO team_members (team_id, user_id, role, status)
         VALUES ($1, $2, 'admin', 'active')
         ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status`,
        [teamId, currentOwnerId]
      );
      await pool.query(
        `UPDATE team_members
         SET role = 'member'
         WHERE team_id = $1 AND user_id = $2 AND status = 'active'`,
        [teamId, newOwnerUserId]
      );
      await pool.query("COMMIT");
    } catch (txError) {
      await pool.query("ROLLBACK");
      throw txError;
    }

    return res.json({ ok: true, teamId, ownerUserId: newOwnerUserId, previousOwnerRole: "admin" });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  selectPlan,
  getAccessState,
  getMyTeam,
  getTeamDetails,
  lookupTeamInvite,
  addTeamMember,
  acceptTeamInvite,
  declineTeamInvite,
  resendTeamInvite,
  removeTeamMember,
  updateTeamMemberRole,
  transferTeamOwnership,
};
