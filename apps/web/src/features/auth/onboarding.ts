import type { MeResponse } from "@/lib/api";

type MaybeMe = MeResponse | null | undefined;

export function hasOrganizationAccess(me: MaybeMe): boolean {
  if (!me) return false;
  return Boolean(
    me.organizationId ||
      me.teamId ||
      me.organizationPlan ||
      (me.teamRole && me.teamRole !== null) ||
      me.access?.plan_code === "team",
  );
}

export function hasCompletedOnboarding(me: MaybeMe): boolean {
  if (!me) return false;
  if (hasOrganizationAccess(me)) return true;
  return Boolean(me.planSelected ?? me.plan_selected);
}
