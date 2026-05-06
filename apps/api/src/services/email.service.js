"use strict";

const { Resend } = require("resend");

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function inviteFromAddress() {
  return String(process.env.INVITE_EMAIL_FROM || "").trim();
}

function resendApiKey() {
  return String(process.env.RESEND_API_KEY || "").trim();
}

function passwordResetFromAddress() {
  return String(process.env.PASSWORD_RESET_EMAIL_FROM || process.env.INVITE_EMAIL_FROM || "noreply@mauthenticity.com").trim();
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  const recipient = String(to || "").trim();
  const safeResetUrl = String(resetUrl || "").trim();
  if (!recipient || !safeResetUrl) {
    throw new Error("Password reset recipient and url are required");
  }
  const from = passwordResetFromAddress();
  const apiKey = resendApiKey();
  const subject = "Reset your MAuthenticity password";
  if (!apiKey || !from) {
    if (isProduction()) {
      throw new Error("Password reset email delivery is not configured");
    }
    console.warn("[email] password reset delivery not configured; reset email skipped");
    return { delivered: false, provider: "log-only" };
  }
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to: recipient,
    subject,
    html: `
      <div style="background:#f6f7f9;padding:24px 0;font-family:Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 12px;color:#111;font-size:20px;">Reset your password</h2>
          <p style="margin:0 0 16px;color:#444;">
            We received a request to reset your MAuthenticity password.
          </p>
          <div style="margin:20px 0;text-align:center;">
            <a href="${safeResetUrl}"
              style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
              Reset Password
            </a>
          </div>
          <p style="margin:20px 0 0;color:#666;font-size:13px;text-align:center;">
            This link expires in 1 hour.
          </p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />
          <p style="margin:0;color:#888;font-size:12px;text-align:center;">
            If the button doesn’t work, copy and paste this link:
          </p>
          <p style="word-break:break-all;color:#555;font-size:12px;text-align:center;margin-top:8px;">
            ${safeResetUrl}
          </p>
        </div>
      </div>
    `,
    text: [
      "Reset your MAuthenticity password",
      "",
      "We received a request to reset your password.",
      `Reset link: ${safeResetUrl}`,
      "",
      "This link expires in 1 hour.",
    ].join("\n"),
  });
  return { delivered: true, provider: "resend" };
}

async function sendTeamInviteEmail({
  to,
  inviteUrl,
  inviteDeclineUrl,
  teamName,
  invitedByEmail,
  inviteTokenPreview,
}) {
  const recipient = String(to || "").trim();
  if (!recipient) {
    throw new Error("Invite email recipient is required");
  }

  const from = inviteFromAddress();
  const apiKey = resendApiKey();
  const subject = "You're invited to join a team on MAuthenticity";
  const safeTeamName = String(teamName || "MAuthenticity Team").trim() || "MAuthenticity Team";
  const safeInviter = String(invitedByEmail || "a team owner").trim() || "a team owner";

  if (!apiKey || !from) {
    if (isProduction()) {
      throw new Error("Invite email delivery is not configured (missing RESEND_API_KEY or INVITE_EMAIL_FROM)");
    }
    console.warn("[email] invite delivery not configured; set RESEND_API_KEY and INVITE_EMAIL_FROM");
    console.info("[email] invite_url", inviteUrl);
    return { delivered: false, provider: "log-only" };
  }

  const resend = new Resend(apiKey);
  console.info("EMAIL CONFIG CHECK", {
    hasKey: !!process.env.RESEND_API_KEY,
    from: process.env.INVITE_EMAIL_FROM,
  });
  const declineUrl = String(inviteDeclineUrl || `${inviteUrl}&action=decline`);
  console.info("[invite.email] sending", {
    to: recipient,
    inviteUrl,
    token: String(inviteTokenPreview || "(unknown)"),
  });
  await resend.emails.send({
    from,
    to: recipient,
    subject,
    html: `
    <div style="background:#f6f7f9;padding:24px 0;font-family:Arial,sans-serif;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:24px;border:1px solid #e5e7eb;">
        
        <h2 style="margin:0 0 12px;color:#111;font-size:20px;">
          You're invited to join a team
        </h2>
  
        <p style="margin:0 0 16px;color:#444;">
          <strong>${safeInviter}</strong> invited you to join
          <strong>${safeTeamName}</strong> on MAuthenticity.
        </p>
  
        <div style="margin:20px 0;text-align:center;">
          <a href="${inviteUrl}"
            style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            Accept Invitation
          </a>
        </div>
  
        <div style="margin:10px 0;text-align:center;">
          <a href="${declineUrl}"
            style="display:inline-block;padding:10px 16px;background:#f3f4f6;color:#111;text-decoration:none;border-radius:6px;font-weight:500;">
            Decline
          </a>
        </div>
  
        <p style="margin:20px 0 0;color:#666;font-size:13px;text-align:center;">
          This invitation expires in 7 days.
        </p>
  
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />
  
        <p style="margin:0;color:#888;font-size:12px;text-align:center;">
          If the buttons don’t work, copy and paste this link:
        </p>
  
        <p style="word-break:break-all;color:#555;font-size:12px;text-align:center;margin-top:8px;">
          ${inviteUrl}
        </p>
  
      </div>
    </div>
  `,
    text: [
      "You're invited to join a team on MAuthenticity",
      "",
      `Team: ${safeTeamName}`,
      `Invited by: ${safeInviter}`,
      "",
      `Accept invitation: ${inviteUrl}`,
      `Decline invitation: ${declineUrl}`,
      "",
      "This invitation expires in 7 days.",
    ].join("\n"),
  });
  return { delivered: true, provider: "resend" };
}

module.exports = { sendTeamInviteEmail, sendPasswordResetEmail };
