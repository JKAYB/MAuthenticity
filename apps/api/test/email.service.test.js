"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { sendPasswordResetEmail } = require("../src/services/email.service");

describe("email.service password reset fallback logging", () => {
  it("does not log raw reset URLs or tokens when resend is not configured", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalApiKey = process.env.RESEND_API_KEY;
    const originalFrom = process.env.PASSWORD_RESET_EMAIL_FROM;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    const warnLogs = [];
    const infoLogs = [];

    process.env.NODE_ENV = "test";
    process.env.RESEND_API_KEY = "";
    process.env.PASSWORD_RESET_EMAIL_FROM = "";

    console.warn = (...args) => {
      warnLogs.push(args.map((v) => String(v)).join(" "));
    };
    console.info = (...args) => {
      infoLogs.push(args.map((v) => String(v)).join(" "));
    };

    try {
      const resetUrl = "https://app.example.com/reset-password?token=raw-secret-token-value";
      const result = await sendPasswordResetEmail({
        to: "user@example.com",
        resetUrl,
      });
      assert.deepEqual(result, { delivered: false, provider: "log-only" });
      assert.ok(
        warnLogs.some((msg) => msg.includes("[email] password reset delivery not configured; reset email skipped"))
      );
      assert.equal(
        warnLogs.some((msg) => msg.includes(resetUrl) || msg.includes("raw-secret-token-value")),
        false
      );
      assert.equal(
        infoLogs.some((msg) => msg.includes("password_reset_url") || msg.includes(resetUrl) || msg.includes("token=")),
        false
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.RESEND_API_KEY = originalApiKey;
      process.env.PASSWORD_RESET_EMAIL_FROM = originalFrom;
      console.warn = originalWarn;
      console.info = originalInfo;
    }
  });
});
