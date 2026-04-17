import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { updateProfile, type MeResponse } from "@/lib/api";
import { meQueryKey } from "@/features/auth/queryKeys";
import { useMe } from "@/features/auth/hooks";
import { getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import { user as demoUser } from "@/lib/mock-data";
import { displayNameFromEmail, initialsFromDisplayName } from "@/lib/user-display";
import { cn } from "@/lib/utils";

export type ProfileFields = {
  email: string;
  storedDisplayName: string;
  org: string;
  plan: string;
  initials: string;
};

function formatPlanLabel(plan: string) {
  const p = (plan || "free").trim().toLowerCase();
  if (!p) return "Free";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export function profileFromMe(me: MeResponse): ProfileFields {
  return {
    email: me.email,
    storedDisplayName: me.name ?? "",
    org: me.organization ?? "",
    plan: formatPlanLabel(me.plan),
    initials: initialsFromDisplayName(me.name, me.email),
  };
}

function ProfileEditor({ liveDemo, profile }: { liveDemo: boolean; profile: ProfileFields }) {
  const qc = useQueryClient();
  const [storedDisplayName, setStoredDisplayName] = useState(profile.storedDisplayName);
  const [org, setOrg] = useState(profile.org);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStoredDisplayName(profile.storedDisplayName);
    setOrg(profile.org);
  }, [profile.storedDisplayName, profile.org, profile.email]);

  const draftInitials = initialsFromDisplayName(
    storedDisplayName.trim() || null,
    profile.email,
  );

  const save = async () => {
    if (liveDemo) return;
    setSaving(true);
    try {
      await updateProfile({
        name: storedDisplayName.trim() || null,
        organization: org.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: meQueryKey });
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-xl font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]">
          {draftInitials}
        </div>
        <div>
          <button
            type="button"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Upload photo
          </button>
          <p className="mt-1 text-xs text-muted-foreground">PNG or JPG, up to 4 MB.</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ProfileInput
          label="Full name"
          value={storedDisplayName}
          onChange={(e) => setStoredDisplayName(e.target.value)}
          readOnly={liveDemo}
          placeholder={displayNameFromEmail(profile.email)}
        />
        <ProfileInput label="Email" value={profile.email} type="email" readOnly />
        <ProfileInput
          label="Organization"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          readOnly={liveDemo}
          placeholder="Optional"
        />
        <ProfileInput label="Plan" value={profile.plan} readOnly disabled />
      </div>
      <ProfileSaveBar
        primaryDisabled={liveDemo || saving}
        primaryLabel={saving ? "Saving…" : "Save changes"}
        onPrimary={liveDemo ? undefined : save}
      />
    </>
  );
}

function ProfileInput({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        {...props}
        className={cn(
          "h-10 w-full rounded-lg border border-border bg-input/60 px-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60",
          props.className,
        )}
      />
    </label>
  );
}

function ProfileSaveBar({
  primaryLabel,
  primaryDisabled,
  onPrimary,
}: {
  primaryLabel?: string;
  primaryDisabled?: boolean;
  onPrimary?: () => void | Promise<void>;
}) {
  return (
    <div className="mt-6 flex items-center justify-end gap-2 border-t border-border/60 pt-4">
      <button
        type="button"
        className="h-9 rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={primaryDisabled}
        onClick={() => void onPrimary?.()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-4 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {primaryLabel ?? "Save changes"}
      </button>
    </div>
  );
}

/** Same profile card + form as Settings → Profile, for reuse on `/profile` and Settings. */
export function ProfileAccountCard() {
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  const meQuery = useMe();

  const profile = useMemo(() => {
    if (liveDemo) {
      return {
        email: demoUser.email,
        storedDisplayName: demoUser.name,
        org: demoUser.org,
        plan: demoUser.plan,
        initials: demoUser.initials,
      };
    }
    if (meQuery.isSuccess && meQuery.data) return profileFromMe(meQuery.data);
    return null;
  }, [liveDemo, meQuery.isSuccess, meQuery.data]);

  const profileLoading = liveDemo ? false : meQuery.isPending;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl elevated">
      <h3 className="mb-5 font-display text-base font-semibold">Profile</h3>
      {profileLoading ? (
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      ) : profile ? (
        <ProfileEditor
          key={`${liveDemo}-${profile.email}-${meQuery.dataUpdatedAt}`}
          liveDemo={liveDemo}
          profile={profile}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Profile unavailable.</p>
      )}
    </div>
  );
}
