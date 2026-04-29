import type { MeResponse } from "@/lib/api";
import { getEffectivePlan } from "./getEffectivePlan";

type MaybeMe = MeResponse | null | undefined;
type PlansMode = "onboarding" | "change";
type PlanCode = "free" | "individual_monthly" | "individual_yearly" | "team";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  individual_monthly: "Individual Monthly",
  individual_yearly: "Individual Yearly",
  team: "Team",
};

export function getPlanLabel(plan?: string | null) {
  if (!plan) return "";
  return (
    PLAN_LABELS[plan] ??
    plan
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

function selectedPlan(me: MaybeMe): string | null {
  if (!me) return null;
  return String(getEffectivePlan(me) || "").toLowerCase() || null;
}

export function isFreePlan(me: MaybeMe): boolean {
  return selectedPlan(me) === "free";
}

export function isPaidPlan(me: MaybeMe): boolean {
  const p = selectedPlan(me);
  return p === "individual_monthly" || p === "individual_yearly" || p === "team";
}

export function isExpiredPlan(me: MaybeMe): boolean {
  return (me?.subscriptionStatus || "none") === "expired";
}

export function shouldShowUpgradeCard(me: MaybeMe): boolean {
  const planSelected = Boolean(me?.planSelected ?? me?.plan_selected);
  if (!planSelected) return true;
  if (isFreePlan(me)) return true;
  return isExpiredPlan(me);
}

export function canManageTeam(me: MaybeMe): boolean {
  return Boolean(
    selectedPlan(me) === "team" &&
      me?.subscriptionStatus === "active" &&
      (me?.isTeamOwner || me?.teamRole === "owner"),
  );
}

export function canDownloadReports(me: MaybeMe): boolean {
  return Boolean(me?.hasEverHadPaidPlan);
}

export function canStartScan(me: MaybeMe): boolean {
  if (!me) return false;
  if (isExpiredPlan(me)) return false;
  const limit = me.scanLimit;
  if (limit == null) return true;
  return me.scansUsed < limit;
}

/** True until the user has completed plan selection (onboarding gate). */
function planOnboardingIncomplete(me: MaybeMe): boolean {
  return !Boolean(me?.planSelected ?? me?.plan_selected);
}

export function getPlanCardState(me: MaybeMe, planCode: PlanCode, mode: PlansMode) {
  const currentPlan = selectedPlan(me);
  const current = currentPlan === planCode;
  const teamMemberManaged = me?.teamRole === "member";
  const selectingFreeNotAllowed = planCode === "free" && Boolean(me?.hasEverHadPaidPlan);
  const skipCurrentLock =
    mode === "onboarding" && planOnboardingIncomplete(me);

  if (teamMemberManaged) {
    return {
      current,
      highlighted: current,
      disabled: true,
      badge: current ? "Current plan" : null,
      buttonLabel: "Managed by owner",
      reason: "team_member_managed" as const,
    };
  }
  if (current && !skipCurrentLock) {
    return {
      current: true,
      highlighted: true,
      disabled: true,
      badge: "Current plan",
      buttonLabel: "Current plan",
      reason: "current_plan" as const,
    };
  }
  if (selectingFreeNotAllowed) {
    return {
      current: false,
      highlighted: false,
      disabled: true,
      badge: null,
      buttonLabel: "Not available",
      reason: "free_not_available" as const,
    };
  }
  const buttonLabel =
    mode === "onboarding"
      ? "Choose plan"
      : isFreePlan(me) && planCode !== "free"
        ? "Upgrade"
        : "Change plan";
  return {
    current: false,
    highlighted: false,
    disabled: false,
    badge: null,
    buttonLabel,
    reason: "available" as const,
  };
}
