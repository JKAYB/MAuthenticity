import { describe, expect, it } from "vitest";
import { resolvePostAuthTarget } from "@/routes/login";

describe("resolvePostAuthTarget", () => {
  it("routes invite signup directly to dashboard", () => {
    const target = resolvePostAuthTarget({
      isLogin: false,
      redirectTo: "/accept-invite?token=abc&action=accept",
      inviteAction: "accept",
      inviteToken: "abc",
    });
    expect(target).toEqual({ to: "/dashboard" });
  });

  it("routes normal signup to onboarding plans", () => {
    const target = resolvePostAuthTarget({
      isLogin: false,
      inviteAction: undefined,
      inviteToken: undefined,
    });
    expect(target).toEqual({ to: "/plans", search: { mode: "onboarding" } });
  });

  it("keeps login redirect behavior", () => {
    const target = resolvePostAuthTarget({
      isLogin: true,
      redirectTo: "/accept-invite?token=abc&action=accept",
    });
    expect(target).toEqual({ to: "/accept-invite?token=abc&action=accept" });
  });
});
