import { describe, expect, it } from "vitest";
import type { MeResponse } from "@/lib/api";
import { hasCompletedOnboarding, hasOrganizationAccess } from "./onboarding";

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
    plan_selected: false,
    planSelected: false,
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

describe("auth onboarding helpers", () => {
  it("treats team membership as organization access", () => {
    const me = makeMe({
      teamId: "team_123",
      teamRole: "member",
      organizationId: "team_123",
      organizationPlan: "team",
      access: { ...makeMe().access, plan_code: "team" },
    });
    expect(hasOrganizationAccess(me)).toBe(true);
    expect(hasCompletedOnboarding(me)).toBe(true);
  });

  it("keeps normal self-signup pending without a selected plan", () => {
    const me = makeMe({
      plan_selected: false,
      planSelected: false,
      organizationId: null,
      teamId: null,
      teamRole: null,
    });
    expect(hasOrganizationAccess(me)).toBe(false);
    expect(hasCompletedOnboarding(me)).toBe(false);
  });

  it("considers selected plan as completed onboarding", () => {
    const me = makeMe({
      plan_selected: true,
      planSelected: true,
      plan: "individual_monthly",
    });
    expect(hasCompletedOnboarding(me)).toBe(true);
  });
});
