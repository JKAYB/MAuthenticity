import { describe, it, expect } from "vitest";
import { getEffectivePlan } from "./getEffectivePlan";
import type { MeResponse } from "@/lib/api";

function makeMe(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: "user_1",
    email: "user@example.com",
    name: null,
    organization: null,
    organizationId: null,
    organizationName: null,
    organizationPlan: null,
    plan: "free",
    selectedPlan: "free",
    plan_selected: true,
    planSelected: true,
    must_change_password: false,
    subscriptionStatus: "none",
    scanLimit: 2,
    scansUsed: 0,
    planExpiresAt: null,
    hasEverHadPaidPlan: false,
    teamId: null,
    teamRole: null,
    isTeamOwner: false,
    access: {
      plan_code: "free",
      access_state: "free",
      scans_used: 0,
      scan_limit: 2,
      has_paid_history: false,
      can_manage_team: false,
    },
    ...overrides,
  };
}

describe("getEffectivePlan", () => {
  it("returns organizationPlan when organizationId and organizationPlan exist", () => {
    const me = makeMe({
      plan: "individual_monthly",
      organizationId: "org_123",
      organizationPlan: "team",
    });
    expect(getEffectivePlan(me)).toBe("team");
  });

  it("returns user plan when organizationPlan exists but organizationId is missing", () => {
    const me = makeMe({
      plan: "individual_yearly",
      organizationPlan: "team",
    });
    expect(getEffectivePlan(me)).toBe("individual_yearly");
  });

  it("returns user plan when organizationId exists but organizationPlan is missing", () => {
    const me = makeMe({
      plan: "individual_monthly",
      organizationId: "org_123",
    });
    expect(getEffectivePlan(me)).toBe("individual_monthly");
  });

  it("returns user plan when no organization fields exist", () => {
    const me = makeMe({
      plan: "free",
    });
    expect(getEffectivePlan(me)).toBe("free");
  });

  it('returns "free" when no plan exists', () => {
    expect(getEffectivePlan(undefined)).toBe("free");
    expect(getEffectivePlan(null)).toBe("free");
    expect(getEffectivePlan({} as MeResponse)).toBe("free");
  });
});