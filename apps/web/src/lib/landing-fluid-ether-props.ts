import type { FluidEtherLandingMode } from "@/hooks/use-fluid-ether-enabled";

/** Static gradient behind / before WebGL (matches marketing shell). */
export const LANDING_STATIC_FLUID_FALLBACK_CLASS =
  "absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklab,var(--primary)_35%,transparent),transparent_55%),radial-gradient(90%_60%_at_100%_40%,color-mix(in_oklab,var(--accent)_28%,transparent),transparent_50%),radial-gradient(80%_50%_at_0%_60%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_55%)]";

/** Idle delay after last scroll event before easing fluid sim cost again. */
export const LANDING_SCROLL_IDLE_MS = 130;

/** Performance-safe defaults for landing LiquidEther (non-scrolling). */
export const LANDING_FLUID_LITE_BASE = {
  mouseForce: 6,
  cursorSize: 72,
  isViscous: false,
  viscous: 18,
  iterationsViscous: 8,
  iterationsPoisson: 8,
  resolution: 0.16,
  BFECC: false,
  isBounce: false,
  autoDemo: true as const,
  autoSpeed: 0.4,
  autoIntensity: 1.0,
  takeoverDuration: 0.12,
  autoResumeDelay: 4000,
  autoRampDuration: 0.35,
};

export const LANDING_FLUID_FULL_BASE = {
  mouseForce: 10,
  cursorSize: 100,
  isViscous: false,
  viscous: 20,
  iterationsViscous: 10,
  iterationsPoisson: 10,
  resolution: 0.22,
  BFECC: false,
  isBounce: false,
  autoDemo: true as const,
  autoSpeed: 0.45,
  autoIntensity: 1.4,
  takeoverDuration: 0.15,
  autoResumeDelay: 4000,
  autoRampDuration: 0.4,
};

/** Slightly cheaper sim while the user is actively scrolling (same component, no remount). */
export function landingFluidScrollTuning(
  mode: Exclude<FluidEtherLandingMode, "off">,
): Partial<typeof LANDING_FLUID_LITE_BASE> {
  if (mode === "lite") {
    return { resolution: 0.12, autoIntensity: 0.6, mouseForce: 4 };
  }
  return { resolution: 0.16, autoIntensity: 0.8, mouseForce: 8 };
}
