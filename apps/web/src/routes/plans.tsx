import { createFileRoute, isRedirect, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { fetchFreshMe, prefetchMe, useMe } from "@/features/auth/hooks";
import { meQueryKey } from "@/features/auth/queryKeys";
import { selectPlan } from "@/lib/api";
import { Sparkles, Check } from "lucide-react";
import { getPlanCardState } from "@/features/billing/planAccess";
import SoftAurora from "@/components/SoftAurora";
import { useTheme } from "@/hooks/use-theme";

type PlansMode = "onboarding" | "change";

function parseMode(v: unknown): PlansMode {
  return v === "change" ? "change" : "onboarding";
}

const plans = [
  { code: "free", title: "Free", subtitle: "2 scans total, no report downloads" },
  { code: "individual_monthly", title: "Individual Monthly", subtitle: "50 scans, report downloads" },
  { code: "individual_yearly", title: "Individual Yearly", subtitle: "600 scans, report downloads" },
  { code: "team", title: "Team", subtitle: "Unlimited team scans while active" },
] as const;

type PlanCode = (typeof plans)[number]["code"];

export const Route = createFileRoute("/plans")({
  validateSearch: (search: Record<string, unknown>): { mode?: PlansMode } => ({
    mode: parseMode(search.mode),
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      const me = await prefetchMe();
      if (me.must_change_password) {
        console.info("[auth] redirect target", "/change-password");
        throw redirect({ to: "/change-password" });
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
      console.info("[auth] redirect target", "/login");
      throw redirect({ to: "/login" });
    }
  },
  component: PlansPage,
});

function PlansPage() {
  const qc = useQueryClient();
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [onboardingPick, setOnboardingPick] = useState<PlanCode | null>(null);
  const [continuing, setContinuing] = useState(false);
  const { mode = "onboarding" } = Route.useSearch();
  const navigate = useNavigate();
  const meQuery = useMe();
  const me = meQuery.data;
  const isOnboarding = mode === "onboarding";

  const onSelectChangeMode = async (planCode: PlanCode) => {
    const cardState = getPlanCardState(me, planCode, mode);
    if (cardState.disabled) return;
    setBusyCode(planCode);
    try {
      await selectPlan(planCode);
      const freshMe = await fetchFreshMe(qc);
      console.info("[plans] fresh me after select", freshMe);
      const planSelected = Boolean(freshMe.planSelected ?? freshMe.plan_selected);
      if (!planSelected) {
        toast.error("Plan was selected, but profile did not update. Please refresh.");
        return;
      }
      toast.success("Plan selected");
      navigate({ to: "/settings", search: { tab: "billing" }, replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not select plan");
    } finally {
      setBusyCode(null);
    }
  };

  const onOnboardingCardClick = (planCode: PlanCode) => {
    const cardState = getPlanCardState(me, planCode, mode);
    if (cardState.disabled || continuing) return;
    setOnboardingPick(planCode);
  };

  const onContinueOnboarding = async () => {
    if (!onboardingPick) return;
    setContinuing(true);
    try {
      await selectPlan(onboardingPick);
      await qc.invalidateQueries({ queryKey: meQueryKey });
      const freshMe = await fetchFreshMe(qc);
      const planSelected = Boolean(freshMe.planSelected ?? freshMe.plan_selected);
      if (!planSelected) {
        toast.error("Plan was selected, but profile did not update. Please refresh.");
        return;
      }
      toast.success("Plan selected");
      navigate({ to: "/dashboard", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not select plan");
    } finally {
      setContinuing(false);
    }
  };

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <div className="relative min-h-screen overflow-hidden">
      <SoftAurora
        speed={0.6}
        scale={1.5}
        brightness={1}
        color1={isDark ? "#f7f7f7" : "#000000"}
        color2={isDark ? "#e100ff" : "#ffffff"}
        noiseFrequency={2.5}
        noiseAmplitude={1}
        bandHeight={0.5}
        bandSpread={1}
        octaveDecay={0.1}
        layerOffset={0}
        colorSpeed={1}
        enableMouseInteraction
        mouseInfluence={0.25}
      />
      <div
        className={[
          "relative mx-auto min-h-screen max-w-7xl px-6 py-16 sm:py-24",
          isOnboarding ? "pb-28 sm:pb-24" : "",
        ].join(" ")}
      >
        {/* Ambient background */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-accent/20 blur-3xl" />
        </div>
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3" />
            Pricing
          </div>
          <h1 className="font-display text-balance bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl">
            {mode === "change" ? "Change your plan" : "Choose your plan"}
          </h1>
          <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
            {mode === "change"
              ? "Pick a new plan for your workspace."
              : "Pick a plan to continue to your workspace."}{" "}
            <span className="text-foreground/80">Payment is mocked for now.</span>
          </p>
          {isOnboarding ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Select a plan, then tap <span className="font-medium text-foreground">Continue</span> below.
            </p>
          ) : null}
        </div>

        {/* Plans grid */}
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const state = getPlanCardState(me, plan.code, mode);
            const isBusy = busyCode === plan.code;
            const isDisabled = isOnboarding
              ? state.disabled || continuing
              : busyCode !== null || state.disabled;
            const highlighted = isOnboarding
              ? onboardingPick === plan.code ||
                (onboardingPick === null && plan.code === "individual_yearly" && !me)
              : state.highlighted || (plan.code === "individual_yearly" && !me);

            return (
              <div
                key={plan.code}
                className={[
                  "group relative flex flex-col rounded-2xl border bg-card/40 p-6 backdrop-blur transition-all duration-300",
                  "hover:-translate-y-1 hover:border-primary/40 hover:bg-card/70 hover:shadow-2xl hover:shadow-primary/10",
                  highlighted
                    ? "border-primary/60 bg-card/70 shadow-xl shadow-primary/10 ring-1 ring-primary/30"
                    : "border-border",
                ].join(" ")}
              >
                {state.badge ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background shadow-lg">
                    {state.badge}
                  </div>
                ) : highlighted ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
                    {onboardingPick === plan.code ? "Your pick" : "Most popular"}
                  </div>
                ) : null}

                <div
                  className={[
                    "mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg",
                    highlighted ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  <Sparkles className="h-5 w-5" />
                </div>

                <h2 className="text-xl font-semibold text-foreground">{plan.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{plan.subtitle}</p>

                <div className="my-5 h-px bg-border/60" />

                <ul className="space-y-2.5">
                  {[plan.subtitle].map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground/80">
                      <Check
                        className={[
                          "mt-0.5 h-4 w-4 shrink-0",
                          highlighted ? "text-primary" : "text-muted-foreground",
                        ].join(" ")}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => {
                    if (isOnboarding) onOnboardingCardClick(plan.code);
                    else void onSelectChangeMode(plan.code);
                  }}
                  disabled={isDisabled}
                  className={[
                    "mt-8 inline-flex h-10 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold transition-all",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    highlighted
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90"
                      : "bg-foreground text-background hover:bg-foreground/90",
                  ].join(" ")}
                >
                  {!isOnboarding && isBusy ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Selecting...
                    </span>
                  ) : isOnboarding && onboardingPick === plan.code ? (
                    "Selected"
                  ) : (
                    state.buttonLabel
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {isOnboarding ? (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:relative sm:z-0 sm:mt-12 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:pb-0 sm:backdrop-blur-none">
            <div className="mx-auto flex max-w-7xl justify-center">
              <button
                type="button"
                disabled={!onboardingPick || continuing}
                onClick={() => void onContinueOnboarding()}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {continuing ? "Continuing..." : "Continue"}
              </button>
            </div>
          </div>
        ) : null}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Cancel anytime. No hidden fees.
        </p>
      </div>
    </div>
  );
}
