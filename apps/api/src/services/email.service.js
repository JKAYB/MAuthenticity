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

async function sendTeamInviteEmail({ to, inviteUrl, teamName, invitedByEmail }) {
  const recipient = String(to || "").trim();
  if (!recipient) {
    throw new Error("Invite email recipient is required");
  }

  const from = inviteFromAddress();
  const apiKey = resendApiKey();
  const subject = "You're invited to join a team on MediaAuth";
  const safeTeamName = String(teamName || "MediaAuth Team").trim() || "MediaAuth Team";
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
          <strong>${safeTeamName}</strong> on MediaAuth.
        </p>
  
        <div style="margin:20px 0;text-align:center;">
          <a href="${inviteUrl}"
            style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            Accept Invitation
          </a>
        </div>
  
        <div style="margin:10px 0;text-align:center;">
          <a href="${inviteUrl}&action=decline"
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
      "You're invited to join a team on MediaAuth",
      "",
      `Team: ${safeTeamName}`,
      `Invited by: ${safeInviter}`,
      "",
      `Accept invitation: ${inviteUrl}`,
      "",
      "This invitation expires in 7 days.",
    ].join("\n"),
  });
  return { delivered: true, provider: "resend" };
}

module.exports = { sendTeamInviteEmail };
