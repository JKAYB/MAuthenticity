import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState, useSyncExternalStore } from "react";

const settingsTabIds = ["profile", "security", "notifications"] as const;
type SettingsTabId = (typeof settingsTabIds)[number];

function parseSettingsTab(tab: unknown): SettingsTabId | undefined {
  if (tab === "profile" || tab === "security" || tab === "notifications") return tab;
  return undefined;
}
import { useForm, type UseFormRegister } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Camera, Key, Bell, Trash2, Check, Eye, EyeOff } from "lucide-react";
import { ProfileAccountCard } from "@/components/profile/ProfileSection";
import { useChangePassword, useMe } from "@/features/auth/hooks";
import { getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import { user as demoUser } from "@/lib/mock-data";
import { SectionHeader } from "@/components/ui-ext/SectionHeader";
import { ThemeSegmentedControl } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({
  validateSearch: (raw: Record<string, unknown>): { tab?: SettingsTabId } => {
    const tab = parseSettingsTab(raw.tab);
    return tab ? { tab } : {};
  },
  head: () => ({ meta: [{ title: "Settings — MediaAuth" }] }),
  component: SettingsPage,
});

/** Best-effort label from this browser only (no server session API yet). */
function getBrowserSessionTitle(): string {
  if (typeof navigator === "undefined") return "This browser";
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrom")) browser = "Safari";
  else if (ua.includes("Firefox/")) browser = "Firefox";
  let os = "";
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) os = "macOS";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" · ") : "This browser";
}

function SettingsPage() {
  const { tab: tabSearch } = Route.useSearch();
  const tab: SettingsTabId = tabSearch ?? "profile";
  const navigate = useNavigate({ from: "/_app/settings" });
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  const meQuery = useMe();
  const sessionTitle = useMemo(() => getBrowserSessionTitle(), []);
  const sessionEmail = liveDemo ? demoUser.email : (meQuery.data?.email ?? "");

  const tabs = [
    { id: "profile", label: "Profile", icon: Camera },
    { id: "security", label: "Security", icon: Key },
    { id: "notifications", label: "Notifications", icon: Bell },
  ] as const;

  return (
    <div className="mx-auto min-w-0 max-w-full space-y-6">
      <SectionHeader
        eyebrow="Account"
        title="Settings"
        description={
          liveDemo
            ? "Sample account data for the live demo."
            : "Manage your profile, security, and notification preferences."
        }
        // action={
        //   tab === "profile" ? (
        //     <Link to="/profile" className="text-sm font-medium text-primary hover:underline">
        //       Profile page →
        //     </Link>
        //   ) : undefined
        // }
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <nav className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border/60 bg-card/60 p-1.5 backdrop-blur-xl">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  navigate({
                    to: "/settings",
                    search: t.id === "profile" ? {} : { tab: t.id },
                    replace: true,
                  })
                }
                className={cn(
                  "relative flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition sm:py-2",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="settings-active"
                    className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/15 to-accent/10 ring-1 ring-inset ring-primary/30"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <t.icon className="relative h-4 w-4" />
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="min-w-0 space-y-6"
        >
          {tab === "profile" && (
            <>
              <ProfileAccountCard />
              <Card title="Appearance">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Light and dark themes use the same layout; your choice is saved in this browser.
                  </p>
                  <ThemeSegmentedControl className="shrink-0 self-start sm:self-auto" />
                </div>
              </Card>
            </>
          )}

          {tab === "security" && (
            <>
              <PasswordCard liveDemo={liveDemo} />
              <Card title="Sessions">
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-input/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium break-words">{sessionTitle}</div>
                      <div className="mt-1 break-words text-xs leading-snug text-muted-foreground">
                        {sessionEmail
                          ? `Signed in as ${sessionEmail} · this device`
                          : "This device · current session"}
                      </div>
                    </div>
                    <span className="inline-flex w-fit shrink-0 items-center gap-1 self-start rounded-full bg-success/15 px-2 py-0.5 text-xs text-success ring-1 ring-success/30 sm:self-auto">
                      <Check className="h-3 w-3" /> Active
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The API does not expose other devices or remote sign-out yet. Use{" "}
                    <span className="font-medium text-foreground">Sign out</span> in the sidebar to
                    clear this browser&apos;s token.
                  </p>
                </div>
              </Card>
              <Card title="Danger zone" tone="destructive">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Delete account</div>
                    <div className="text-xs text-muted-foreground">
                      Permanently remove your account and all scan history. This cannot be undone.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-destructive/15 px-3 text-sm font-medium text-destructive ring-1 ring-destructive/30 hover:bg-destructive/25 sm:w-auto sm:justify-start"
                  >
                    <Trash2 className="h-4 w-4" /> Delete account
                  </button>
                </div>
              </Card>
            </>
          )}

          {tab === "notifications" && (
            <Card title="Notifications">
              <div className="space-y-1">
                {[
                  { l: "Scan complete", d: "Email me when a scan finishes.", on: true },
                  { l: "Manipulation detected", d: "Notify me of flagged media.", on: true },
                  { l: "Weekly digest", d: "Summary of activity every Monday.", on: false },
                  { l: "Product updates", d: "New features and changelog.", on: false },
                ].map((row) => (
                  <ToggleRow key={row.l} label={row.l} desc={row.d} defaultOn={row.on} />
                ))}
              </div>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}

const PASSWORD_MIN_LEN = 8;

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LEN, `Use at least ${PASSWORD_MIN_LEN} characters`)
      .max(200, "Password is too long")
      .regex(/[a-z]/, "Include at least one lowercase letter")
      .regex(/[A-Z]/, "Include at least one uppercase letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must be different from your current password",
    path: ["newPassword"],
  });

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

type PasswordFieldRegisterReturn = ReturnType<UseFormRegister<PasswordFormValues>>;

function passwordRequirementChecks(password: string) {
  return {
    minLength: password.length >= PASSWORD_MIN_LEN,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
  };
}

function PasswordRequirements({ password }: { password: string }) {
  const c = passwordRequirementChecks(password);
  const items: { ok: boolean; label: string }[] = [
    { ok: c.minLength, label: `At least ${PASSWORD_MIN_LEN} characters` },
    { ok: c.lowercase, label: "One lowercase letter (a–z)" },
    { ok: c.uppercase, label: "One uppercase letter (A–Z)" },
    { ok: c.digit, label: "One number (0–9)" },
  ];

  return (
    <div className="min-w-0 sm:col-span-2" role="region" aria-label="Password requirements">
      <p className="mb-2 text-xs font-medium text-muted-foreground">New password must include:</p>
      <ul className="space-y-2" aria-live="polite">
        {items.map(({ ok, label }) => (
          <li key={label} className="flex items-center gap-2.5 text-xs">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                ok
                  ? "border-success/45 bg-success/15 text-success"
                  : "border-border bg-input/40 text-muted-foreground/35",
              )}
              aria-hidden
            >
              {ok ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
            </span>
            <span className={cn("min-w-0 break-words", ok ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PasswordCard({ liveDemo }: { liveDemo: boolean }) {
  const changePw = useChangePassword();
  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (liveDemo) return;
    try {
      await changePw.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success("Password updated");
      form.reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update password");
    }
  });

  const newPasswordWatch = form.watch("newPassword");

  return (
    <Card title="Password">
      {liveDemo ? (
        <p className="mb-4 text-xs text-muted-foreground">
          Password changes are disabled in the live demo.
        </p>
      ) : null}
      <form
        onSubmit={onSubmit}
        className={cn(liveDemo && "pointer-events-none opacity-60")}
        noValidate
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <PasswordInput
            label="Current password"
            autoComplete="current-password"
            error={form.formState.errors.currentPassword?.message}
            disabled={liveDemo}
            inputProps={form.register("currentPassword")}
          />
          <span className="hidden sm:block" />
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            error={form.formState.errors.newPassword?.message}
            disabled={liveDemo}
            inputProps={form.register("newPassword")}
          />
          <PasswordInput
            label="Confirm new password"
            autoComplete="new-password"
            error={form.formState.errors.confirmPassword?.message}
            disabled={liveDemo}
            inputProps={form.register("confirmPassword")}
          />
          {!liveDemo ? <PasswordRequirements password={newPasswordWatch} /> : null}
        </div>
        <SaveBar
          label="Update password"
          primaryType="submit"
          primaryDisabled={changePw.isPending || liveDemo}
          onCancel={() => form.reset()}
        />
      </form>
    </Card>
  );
}

function PasswordInput({
  label,
  error,
  disabled,
  autoComplete,
  inputProps,
}: {
  label: string;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
  inputProps: PasswordFieldRegisterReturn;
}) {
  const [visible, setVisible] = useState(false);
  const { ref, ...rest } = inputProps;

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <input
          ref={ref}
          {...rest}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          disabled={disabled}
          className={cn(
            "h-10 w-full rounded-lg border border-border bg-input/60 py-2 pl-3 pr-10 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60",
            error && "border-destructive/60 focus:border-destructive/50 focus:ring-destructive/25",
          )}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

function Card({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "destructive";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border bg-card/60 p-4 backdrop-blur-xl elevated sm:p-6",
        tone === "destructive" ? "border-destructive/30" : "border-border/60",
      )}
    >
      <h3 className="mb-5 font-display text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Input({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        {...props}
        className={cn(
          "h-10 w-full rounded-lg border border-border bg-input/60 px-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60",
          error && "border-destructive/60 focus:border-destructive/50 focus:ring-destructive/25",
          props.className,
        )}
      />
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : null}
    </label>
  );
}

function SaveBar({
  label = "Save changes",
  primaryLabel,
  primaryDisabled,
  primaryType = "button",
  onPrimary,
  onCancel,
}: {
  label?: string;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  primaryType?: "button" | "submit";
  onPrimary?: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  return (
    <div className="mt-6 flex min-w-0 flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
      <button
        type="button"
        onClick={() => onCancel?.()}
        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted sm:w-auto"
      >
        Cancel
      </button>
      <button
        type={primaryType}
        disabled={primaryDisabled}
        onClick={primaryType === "submit" ? undefined : () => void onPrimary?.()}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-4 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
      >
        {primaryLabel ?? label}
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  defaultOn,
}: {
  label: string;
  desc: string;
  defaultOn: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-muted/30">
      <div className="min-w-0 pr-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <button
        onClick={() => setOn((v) => !v)}
        className={cn(
          "relative h-6 w-11 rounded-full transition",
          on
            ? "bg-gradient-to-r from-primary to-accent shadow-[0_0_16px_-4px_var(--primary)]"
            : "bg-muted",
        )}
        aria-pressed={on}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow",
            on ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
