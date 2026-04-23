import {
  createFileRoute,
  isRedirect,
  Link,
  redirect,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Github, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { prefetchMe, useLogin, useSignup } from "@/features/auth/hooks";
import LiquidEther from "./LiquidEtherWithRef";
import BorderGlow from "@/components/BorderGlow";
import { useTheme } from "@/hooks/use-theme";
import { useFluidEtherLandingMode } from "@/hooks/use-fluid-ether-enabled";
import {
  LANDING_FLUID_FULL_BASE,
  LANDING_FLUID_LITE_BASE,
  LANDING_STATIC_FLUID_FALLBACK_CLASS,
} from "@/lib/landing-fluid-ether-props";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      await prefetchMe();
      throw redirect({ to: "/dashboard" });
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in — Observyx" },
      { name: "description", content: "Sign in to your Observyx workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return <AuthShell mode="login" />;
}

const loginFluidColors = ["#7FD4F5", "#70E0F8", "#B05CFF"] as const;

function StaticFluidBackdrop() {
  return <div className={LANDING_STATIC_FLUID_FALLBACK_CLASS} aria-hidden />;
}

export function AuthShell({ mode }: { mode: "login" | "signup" }) {
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const fluidMode = useFluidEtherLandingMode();
  const [showFluid, setShowFluid] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const loginMutation = useLogin();
  const signupMutation = useSignup();
  const isLogin = mode === "login";
  const liquidEtherProps = useMemo(() => {
    if (fluidMode === "off") return null;
    return {
      ...(fluidMode === "lite" ? LANDING_FLUID_LITE_BASE : LANDING_FLUID_FULL_BASE),
      colors: [...loginFluidColors],
    };
  }, [fluidMode]);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (fluidMode === "off") {
      setShowFluid(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShowFluid(true));
    return () => cancelAnimationFrame(raf);
  }, [fluidMode]);

  const redirectTo = useRouterState({
    select: (s) => {
      const q = s.location.search as { redirect?: string };
      return typeof q?.redirect === "string" ? q.redirect : undefined;
    },
  });

  const busy = loginMutation.isPending || signupMutation.isPending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLogin) {
        await loginMutation.mutateAsync({ email, password });
        toast.success("Signed in");
      } else {
        await signupMutation.mutateAsync({ email, password });
        await loginMutation.mutateAsync({ email, password });
        toast.success("Account created");
      }
      await router.invalidate();
      const target = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/dashboard";
      navigate({ to: target });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden lg:grid lg:grid-cols-2">
      <div
        className={
          fluidMode === "lite"
            ? "pointer-events-none absolute inset-0 z-0 opacity-[0.46]"
            : "pointer-events-none absolute inset-0 z-0 opacity-[0.54]"
        }
      >
        {fluidMode === "off" || !showFluid || !liquidEtherProps ? (
          <StaticFluidBackdrop />
        ) : (
          <LiquidEther {...liquidEtherProps} className="pointer-events-none !absolute inset-0" />
        )}
      </div>

      <div className="login-brand-panel relative hidden overflow-hidden lg:block">
        <div className="grid-bg absolute inset-0 opacity-40" />
        <div className="float absolute -left-20 top-32 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
        <div
          className="float absolute -right-10 bottom-20 h-80 w-80 rounded-full bg-accent/30 blur-3xl"
          style={{ animationDelay: "-2s" }}
        />
        <div className="relative z-10 flex h-full flex-col p-10">
          <Link
            to="/"
            aria-label="Observyx home"
            className="inline-flex w-fit touch-manipulation rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring [-webkit-tap-highlight-color:transparent] cursor-pointer"
          >
            <Logo />
          </Link>
          <div className="mt-auto max-w-md">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs backdrop-blur"
            >
              <Sparkles className="h-3 w-3 text-primary" /> Built for newsrooms & trust teams
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-4 font-display text-4xl font-semibold leading-tight"
            >
              Catch synthetic media <span className="gradient-text">before</span> it spreads.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-3 text-muted-foreground"
            >
              Run authenticity scans across images, video, audio, and URLs — powered by your
              Observyx backend.
            </motion.p>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <div className="absolute right-6 top-6 z-10">
          <ThemeToggle />
        </div>
        <div className="lg:hidden">
          <div className="absolute left-6 top-6">
            <Link
              to="/"
              aria-label="Observyx home"
              className="inline-flex w-fit touch-manipulation rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring [-webkit-tap-highlight-color:transparent]"
            >
              <Logo />
            </Link>
          </div>
        </div>
        <div className="auth-glow w-full max-w-sm">

          <BorderGlow
            edgeSensitivity={30}
            glowColor="40 80 80"
            backgroundColor={isDark ? "#120F17" : "#f9fafc"}
            borderRadius={28}
            glowRadius={40}
            glowIntensity={0.8}
            coneSpread={25}
            animated={true}
            colors={isDark ? ['#c084fc', '#f472b6', '#38bdf8'] : ['#a78bfa', '#f9a8d4', '#7dd3fc']}
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-sm p-5 sm:p-6"
            >
              <div className="mb-7">
                <h1 className="font-display text-3xl font-semibold tracking-tight">
                  {isLogin ? "Welcome back" : "Create your account"}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {isLogin
                    ? "Sign in to continue to your workspace."
                    : "Start verifying media in under a minute."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card/60 text-sm font-medium backdrop-blur transition hover:bg-card"
                  onClick={() => toast.message("OAuth is not wired to the API yet.")}
                >
                  <Github className="h-4 w-4" /> GitHub
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card/60 text-sm font-medium backdrop-blur transition hover:bg-card"
                  onClick={() => toast.message("OAuth is not wired to the API yet.")}
                >
                  <Mail className="h-4 w-4" /> Google
                </button>
              </div>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or with email
                <span className="h-px flex-1 bg-border" />
              </div>

              <form className="space-y-4" onSubmit={onSubmit}>
                {!isLogin && (
                  <Field label="Full name (optional)">
                    <input
                      type="text"
                      placeholder="Jane Reporter"
                      className="auth-input"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                )}
                <Field label="Email">
                  <input
                    required
                    type="email"
                    placeholder="you@company.com"
                    className="auth-input"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field
                  label="Password"
                  hint={
                    isLogin ? null : (
                      <span className="max-w-[14rem] text-right text-muted-foreground">
                        8+ chars, upper, lower, number
                      </span>
                    )
                  }
                >
                  <div className="relative">
                    <input
                      required
                      minLength={isLogin ? undefined : 8}
                      maxLength={isLogin ? undefined : 200}
                      type={showPw ? "text" : "password"}
                      placeholder=""
                      className="auth-input pr-10"
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                <button
                  type="submit"
                  disabled={busy}
                  className="group relative mt-1 inline-flex h-10 w-full items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-br from-primary to-accent text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                >
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary-foreground/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <ShieldCheck className="h-4 w-4" />
                  {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {isLogin ? "New to Observyx?" : "Already have an account?"}{" "}
                <Link
                  to={isLogin ? "/signup" : "/login"}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {isLogin ? "Create an account" : "Sign in"}
                </Link>
              </p>
            </motion.div>
          </BorderGlow>
        </div>
      </div>

      <style>{`
        .auth-glow .border-glow-inner {
          overflow: hidden !important;
        }
        .auth-input {
          width: 100%;
          height: 2.5rem;
          border-radius: 0.5rem;
          border: 1px solid var(--color-border);
          background: var(--input);
          padding: 0 0.75rem;
          font-size: 0.875rem;
          transition: border-color .2s, box-shadow .2s, background .2s;
        }
        .auth-input::placeholder { color: var(--color-muted-foreground); }
        .auth-input:focus {
          outline: none;
          border-color: color-mix(in oklab, var(--primary) 60%, transparent);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--primary) 20%, transparent);
          background: var(--input);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {hint && <span className="text-xs">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
