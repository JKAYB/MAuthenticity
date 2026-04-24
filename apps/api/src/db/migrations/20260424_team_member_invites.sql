CREATE TABLE IF NOT EXISTS team_member_invites (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'team_member',
  status TEXT NOT NULL DEFAULT 'pending',
  token_hash TEXT,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, email)
);

ALTER TABLE team_member_invites ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'team_member';
ALTER TABLE team_member_invites ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE team_member_invites ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE team_member_invites ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE team_member_invites ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;
ALTER TABLE team_member_invites ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE team_member_invites ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS team_member_invites_team_email_pending_idx
ON team_member_invites (team_id, lower(email))
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS team_member_invites_token_hash_idx
ON team_member_invites (token_hash);
