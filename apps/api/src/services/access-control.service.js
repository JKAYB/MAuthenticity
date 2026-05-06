const { pool } = require("../db/pool");
const { getBillableScanCountForUser } = require("./scan.service");

const FREE_SCAN_LIMIT = 2;
const INDIVIDUAL_MONTHLY_SCAN_LIMIT = 50;
const INDIVIDUAL_YEARLY_SCAN_LIMIT = 600;
const PLAN_CODE_FREE = "free";
const PLAN_CODE_TEAM = "team";
const PLAN_CODE_INDIVIDUAL_MONTHLY = "individual_monthly";
const PLAN_CODE_INDIVIDUAL_YEARLY = "individual_yearly";
const TEAM_ROLE_OWNER = "owner";
const TEAM_ROLE_ADMIN = "admin";
const TEAM_ROLE_MEMBER = "member";

function normalizeTeamRole(rawRole) {
  const role = String(rawRole || "").trim().toLowerCase();
  if (role === TEAM_ROLE_OWNER || role === "team_owner") return TEAM_ROLE_OWNER;
  if (role === TEAM_ROLE_ADMIN || role === "team_admin") return TEAM_ROLE_ADMIN;
  if (role === TEAM_ROLE_MEMBER || role === "team_member") return TEAM_ROLE_MEMBER;
  return TEAM_ROLE_MEMBER;
}

function isOwner(teamRole) {
  return normalizeTeamRole(teamRole) === TEAM_ROLE_OWNER;
}

function isAdmin(teamRole) {
  return normalizeTeamRole(teamRole) === TEAM_ROLE_ADMIN;
}

function canManageMembers(teamRole) {
  const role = normalizeTeamRole(teamRole);
  return role === TEAM_ROLE_OWNER || role === TEAM_ROLE_ADMIN;
}

function canManageAdmins(teamRole) {
  return normalizeTeamRole(teamRole) === TEAM_ROLE_OWNER;
}

function isPaidPlanCode(planCode) {
  return (
    planCode === PLAN_CODE_INDIVIDUAL_MONTHLY ||
    planCode === PLAN_CODE_INDIVIDUAL_YEARLY ||
    planCode === PLAN_CODE_TEAM
  );
}

function scanLimitForPlanCode(planCode) {
  if (planCode === PLAN_CODE_FREE) return FREE_SCAN_LIMIT;
  if (planCode === PLAN_CODE_TEAM) return null;
  if (planCode === PLAN_CODE_INDIVIDUAL_MONTHLY) return INDIVIDUAL_MONTHLY_SCAN_LIMIT;
  if (planCode === PLAN_CODE_INDIVIDUAL_YEARLY) return INDIVIDUAL_YEARLY_SCAN_LIMIT;
  return FREE_SCAN_LIMIT;
}

async function getUserCore(userId) {
  const { rows } = await pool.query(
    `SELECT id, email, plan, plan_selected, must_change_password
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function getTeamContext(userId) {
  const ownerTeamQ = await pool.query(
    `SELECT t.id, t.owner_user_id
     FROM teams t
     WHERE t.owner_user_id = $1
     LIMIT 1`,
    [userId],
  );
  if (ownerTeamQ.rows[0]) {
    return { teamId: ownerTeamQ.rows[0].id, teamRole: TEAM_ROLE_OWNER };
  }
  const memberQ = await pool.query(
    `SELECT tm.team_id, tm.role
     FROM team_members tm
     WHERE tm.user_id = $1 AND tm.status = 'active'
     LIMIT 1`,
    [userId],
  );
  if (memberQ.rows[0]) {
    return { teamId: memberQ.rows[0].team_id, teamRole: normalizeTeamRole(memberQ.rows[0].role) };
  }
  return { teamId: null, teamRole: null };
}

async function getLatestSubscriptionForUser(userId) {
  const { rows } = await pool.query(
    `SELECT s.*, p.kind AS plan_kind
     FROM subscriptions s
     JOIN plans p ON p.code = s.plan_code
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function getLatestSubscriptionForTeam(teamId) {
  if (!teamId) return null;
  const { rows } = await pool.query(
    `SELECT s.*, p.kind AS plan_kind
     FROM subscriptions s
     JOIN plans p ON p.code = s.plan_code
     WHERE s.team_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [teamId],
  );
  return rows[0] || null;
}

function isSubscriptionActive(subscription) {
  if (!subscription) return false;
  if (String(subscription.status || "").toLowerCase() !== "active") return false;
  if (!subscription.expires_at) return true;
  return new Date(subscription.expires_at).getTime() > Date.now();
}

async function hadPaidPlanBefore({ userId, teamId }) {
  const userPaidQ = await pool.query(
    `SELECT 1
     FROM subscriptions
     WHERE user_id = $1
       AND plan_code IN ($2, $3, $4)
     LIMIT 1`,
    [userId, PLAN_CODE_INDIVIDUAL_MONTHLY, PLAN_CODE_INDIVIDUAL_YEARLY, PLAN_CODE_TEAM],
  );
  if (userPaidQ.rows[0]) return true;
  if (!teamId) return false;
  const teamPaidQ = await pool.query(
    `SELECT 1
     FROM subscriptions
     WHERE team_id = $1
       AND plan_code = $2
     LIMIT 1`,
    [teamId, PLAN_CODE_TEAM],
  );
  return Boolean(teamPaidQ.rows[0]);
}

async function getEffectivePlan(userId) {
  const user = await getUserCore(userId);
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  const { teamId, teamRole } = await getTeamContext(userId);
  const teamSub = await getLatestSubscriptionForTeam(teamId);
  const userSub = await getLatestSubscriptionForUser(userId);
  const teamActive = isSubscriptionActive(teamSub);
  const userActive = isSubscriptionActive(userSub);
  const selectedPlan = String(user.plan || PLAN_CODE_FREE).toLowerCase();

  let planCode = selectedPlan;
  let accessState = "free";
  if (teamId) {
    planCode = PLAN_CODE_TEAM;
    accessState = teamActive ? "team_active" : "team_expired";
  } else if (isPaidPlanCode(selectedPlan)) {
    accessState = userActive ? "paid_active" : "paid_expired";
  }

  const scansUsed = await getBillableScanCountForUser({ userId });
  const hasPaidHistory = await hadPaidPlanBefore({ userId, teamId });
  const scanLimit = scanLimitForPlanCode(planCode);

  return {
    userId,
    planCode,
    selectedPlan,
    planSelected: Boolean(user.plan_selected),
    mustChangePassword: Boolean(user.must_change_password),
    teamId,
    teamRole,
    accessState,
    scanLimit,
    scansUsed,
    hasPaidHistory,
    userSubscription: userSub,
    teamSubscription: teamSub,
  };
}

async function canStartScan(userId) {
  const effectivePlan = await getEffectivePlan(userId);
  if (effectivePlan.accessState === "team_expired" || effectivePlan.accessState === "paid_expired") {
    return { ok: false, reason: "plan_expired", effectivePlan };
  }
  if (effectivePlan.planCode === PLAN_CODE_FREE) {
    if (effectivePlan.scansUsed >= FREE_SCAN_LIMIT) {
      return { ok: false, reason: "free_limit_reached", effectivePlan };
    }
    return { ok: true, effectivePlan };
  }
  if (effectivePlan.planCode === PLAN_CODE_TEAM) {
    if (effectivePlan.accessState !== "team_active") {
      return { ok: false, reason: "plan_expired", effectivePlan };
    }
    return { ok: true, effectivePlan };
  }
  if (effectivePlan.scanLimit != null && effectivePlan.scansUsed >= effectivePlan.scanLimit) {
    return { ok: false, reason: "individual_limit_reached", effectivePlan };
  }
  return { ok: true, effectivePlan };
}

async function canDownloadReport(userId) {
  const effectivePlan = await getEffectivePlan(userId);
  if (effectivePlan.planCode === PLAN_CODE_FREE && !effectivePlan.hasPaidHistory) {
    return { ok: false, reason: "paid_plan_required", effectivePlan };
  }
  return { ok: true, effectivePlan };
}

async function canManageTeam(userId) {
  const effectivePlan = await getEffectivePlan(userId);
  return {
    ok: canManageMembers(effectivePlan.teamRole),
    reason: canManageMembers(effectivePlan.teamRole) ? null : "team_manage_members_required",
    effectivePlan,
  };
}

module.exports = {
  getEffectivePlan,
  canStartScan,
  canDownloadReport,
  canManageTeam,
  normalizeTeamRole,
  isOwner,
  isAdmin,
  canManageMembers,
  canManageAdmins,
  TEAM_ROLE_OWNER,
  TEAM_ROLE_ADMIN,
  TEAM_ROLE_MEMBER,
  PLAN_CODE_FREE,
  PLAN_CODE_TEAM,
  PLAN_CODE_INDIVIDUAL_MONTHLY,
  PLAN_CODE_INDIVIDUAL_YEARLY,
};
