const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { pool } = require("../db/pool");
const { normalizeEmail } = require("../utils/normalizeEmail");
const { sendTeamInviteEmail } = require("../services/email.service");
const {
  canManageTeam,
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

function inviteUrlForToken(rawToken) {
  const appBase = String(process.env.WEB_APP_URL || "http://localhost:5173").replace(/\/+$/, "");
  return `${appBase}/accept-invite?token=${encodeURIComponent(rawToken)}`;
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
    if (effectiveBefore.teamRole === "team_member") {
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
    const activeEmails = new Set(membersQ.rows.map((m) => normalizeEmail(m.email)));
    const invites = invitesQ.rows.filter((inv) => {
      if (inv.status !== "accepted") return true;
      return !activeEmails.has(normalizeEmail(inv.email));
    });
    return res.json({
      team: teamQ.rows[0] || null,
      members: membersQ.rows,
      invites,
      role: effectivePlan.teamRole,
    });
  } catch (error) {
    return next(error);
  }
}

async function addTeamMember(req, res, next) {
  try {
    const teamCheck = await canManageTeam(req.user.id);
    if (!teamCheck.ok) {
      return res.status(403).json({ error: "Only team owner can manage members" });
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
    if (existingInvite && existingInvite.status === "pending" && !resend) {
      return res.status(200).json({
        ok: true,
        status: "invitation_sent",
        invite: existingInvite,
      });
    }

    const rawToken = createInviteToken();
    const tokenHash = sha256(rawToken);
    await pool.query(
      `INSERT INTO team_member_invites (
         id, team_id, email, invited_by_user_id, role, status, token_hash, expires_at, updated_at
       )
       VALUES ($1, $2, $3, $4, 'team_member', 'pending', $5, NOW() + INTERVAL '${INVITE_TTL_DAYS} days', NOW())
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
      [uuidv4(), teamCheck.effectivePlan.teamId, email, req.user.id, tokenHash],
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
    try {
      await sendTeamInviteEmail({
        to: email,
        inviteUrl: inviteUrlForToken(rawToken),
        teamName,
        invitedByEmail: req.user?.email || "",
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
    const tokenHash = sha256(token);
    const inviteQ = await pool.query(
      `SELECT id, team_id, email, role, status, expires_at
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
    const meQ = await pool.query("SELECT id, email FROM users WHERE id = $1 LIMIT 1", [req.user.id]);
    const me = meQ.rows[0];
    if (!me) return res.status(404).json({ error: "user_not_found" });
    if (normalizeEmail(me.email) !== normalizeEmail(invite.email)) {
      return res.status(403).json({ error: "email_mismatch" });
    }
    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO team_members (team_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
        [invite.team_id, me.id, invite.role || "team_member"],
      );
      await pool.query(
        `UPDATE team_member_invites
         SET status = 'accepted', accepted_at = NOW(), updated_at = NOW(), token_hash = NULL
         WHERE id = $1`,
        [invite.id],
      );
      await pool.query("COMMIT");
      return res.json({ ok: true, status: "accepted" });
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
      return res.status(403).json({ error: "Only team owner can manage members" });
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
        inviteUrl: inviteUrlForToken(rawToken),
        teamName,
        invitedByEmail: req.user?.email || "",
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
      return res.status(403).json({ error: "Only team owner can manage members" });
    }
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId is required" });
    await pool.query("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", [
      teamCheck.effectivePlan.teamId,
      userId,
    ]);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  selectPlan,
  getAccessState,
  getMyTeam,
  addTeamMember,
  acceptTeamInvite,
  declineTeamInvite,
  resendTeamInvite,
  removeTeamMember,
};
