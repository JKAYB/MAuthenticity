"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isPlanSelectionAllowed,
  paidPlansEnabled,
} = require("../src/services/planSelectionPolicy.service");

describe("planSelectionPolicy", () => {
  it("allows free plan regardless of paid flag", () => {
    const original = process.env.ENABLE_PAID_PLANS;
    process.env.ENABLE_PAID_PLANS = "false";
    try {
      assert.equal(isPlanSelectionAllowed("free").ok, true);
    } finally {
      process.env.ENABLE_PAID_PLANS = original;
    }
  });

  it("blocks paid plans when flag is disabled", () => {
    const original = process.env.ENABLE_PAID_PLANS;
    process.env.ENABLE_PAID_PLANS = "false";
    try {
      const blocked = isPlanSelectionAllowed("team");
      assert.equal(blocked.ok, false);
      assert.equal(blocked.error, "Paid plans are not available yet.");
      assert.equal(blocked.status, 403);
    } finally {
      process.env.ENABLE_PAID_PLANS = original;
    }
  });

  it("allows paid plans when flag is enabled", () => {
    const original = process.env.ENABLE_PAID_PLANS;
    process.env.ENABLE_PAID_PLANS = "true";
    try {
      assert.equal(paidPlansEnabled(), true);
      assert.equal(isPlanSelectionAllowed("individual_monthly").ok, true);
      assert.equal(isPlanSelectionAllowed("individual_yearly").ok, true);
      assert.equal(isPlanSelectionAllowed("team").ok, true);
    } finally {
      process.env.ENABLE_PAID_PLANS = original;
    }
  });
});
