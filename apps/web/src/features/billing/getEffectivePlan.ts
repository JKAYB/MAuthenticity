import type { MeResponse } from "@/lib/api";

type MaybeMe = MeResponse | null | undefined;

export function getEffectivePlan(me: MaybeMe): string {
  if (me?.organizationId && me?.organizationPlan) {
    return me.organizationPlan;
  }
  return me?.plan || "free";
}
