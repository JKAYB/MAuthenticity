"use strict";

const PLAN_CODE_FREE = "free";
const PLAN_CODE_INDIVIDUAL_MONTHLY = "individual_monthly";
const PLAN_CODE_INDIVIDUAL_YEARLY = "individual_yearly";
const PLAN_CODE_TEAM = "team";

function paidPlansEnabled() {
  return String(process.env.ENABLE_PAID_PLANS || "").trim().toLowerCase() === "true";
}

function isPaidPlanCode(planCode) {
  return (
    planCode === PLAN_CODE_INDIVIDUAL_MONTHLY ||
    planCode === PLAN_CODE_INDIVIDUAL_YEARLY ||
    planCode === PLAN_CODE_TEAM
  );
}

function isPlanSelectionAllowed(planCode) {
  if (planCode === PLAN_CODE_FREE) {
    return { ok: true };
  }
  if (isPaidPlanCode(planCode) && !paidPlansEnabled()) {
    return { ok: false, error: "Paid plans are not available yet.", status: 403 };
  }
  return { ok: true };
}

module.exports = {
  paidPlansEnabled,
  isPlanSelectionAllowed,
};
