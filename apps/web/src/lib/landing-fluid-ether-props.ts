// import type { FluidEtherLandingMode } from "@/hooks/use-fluid-ether-enabled";

// /** Static gradient behind / before WebGL (matches marketing shell). */
// export const LANDING_STATIC_FLUID_FALLBACK_CLASS =
//   "absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklab,var(--primary)_35%,transparent),transparent_55%),radial-gradient(90%_60%_at_100%_40%,color-mix(in_oklab,var(--accent)_28%,transparent),transparent_50%),radial-gradient(80%_50%_at_0%_60%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_55%)]";

// /** Idle delay after last scroll event before easing fluid sim cost again. */
// export const LANDING_SCROLL_IDLE_MS = 130;

// /** Performance-safe defaults for landing LiquidEther (non-scrolling). */
// export const LANDING_FLUID_LITE_BASE = {
//   mouseForce: 6,
//   cursorSize: 72,
//   isViscous: false,
//   viscous: 18,
//   iterationsViscous: 8,
//   iterationsPoisson: 8,
//   resolution: 0.16,
//   BFECC: false,
//   isBounce: false,
//   autoDemo: true as const,
//   autoSpeed: 0.4,
//   autoIntensity: 1.0,
//   takeoverDuration: 0.12,
//   autoResumeDelay: 4000,
//   autoRampDuration: 0.35,
// };

// export const LANDING_FLUID_FULL_BASE = {
//   mouseForce: 10,
//   cursorSize: 100,
//   isViscous: false,
//   viscous: 20,
//   iterationsViscous: 10,
//   iterationsPoisson: 10,
//   resolution: 0.22,
//   BFECC: false,
//   isBounce: false,
//   autoDemo: true as const,
//   autoSpeed: 0.45,
//   autoIntensity: 1.4,
//   takeoverDuration: 0.15,
//   autoResumeDelay: 4000,
//   autoRampDuration: 0.4,
// };

// /** Slightly cheaper sim while the user is actively scrolling (same component, no remount). */
// export function landingFluidScrollTuning(
//   mode: Exclude<FluidEtherLandingMode, "off">,
// ): Partial<typeof LANDING_FLUID_LITE_BASE> {
//   if (mode === "lite") {
//     return { resolution: 0.12, autoIntensity: 0.6, mouseForce: 4 };
//   }
//   return { resolution: 0.16, autoIntensity: 0.8, mouseForce: 8 };
// }
/**
 * landing-fluid-ether-props.ts
 *
 * Single source of truth for LiquidEther configuration across all landing pages.
 *
 * Key tuning decisions:
 *   resolution 0.3      — renders at 30% of canvas size; plenty sharp for a background, halves GPU cost vs 0.5
 *   iterationsPoisson 16 — 16 pressure iterations is indistinguishable from 32 at background scale
 *   iterationsViscous 16 — same; only matters if isViscous: true
 *   isViscous false     — skip the viscosity solve entirely; not needed for a decorative background
 *   BFECC false         — error-compensated advection adds cost with no visible benefit at this resolution
 *   autoDemo true       — keep the idle animation alive without user interaction
 *
 * Lite mode (low-end devices / reduced-motion hint) drops resolution further
 * and halves iteration counts again.
 */

export const LANDING_FLUID_FULL_BASE = {
  resolution: 0.4,
  iterationsPoisson: 16,
  iterationsViscous: 16,
  isViscous: false,
  BFECC: false,
  dt: 0.016,
  autoDemo: true,
  autoSpeed: 0.4,
  autoIntensity: 2.0,
  autoResumeDelay: 1000,
  autoRampDuration: 0.6,
  takeoverDuration: 0.25,
  mouseForce: 20,
  cursorSize: 100,
  isBounce: false,
} as const;

export const LANDING_FLUID_LITE_BASE = {
  ...LANDING_FLUID_FULL_BASE,
  mouseForce: 7,
  cursorSize: 100,
  resolution: 0.3,
  iterationsPoisson: 8,
  iterationsViscous: 8,
  autoIntensity: 1.6,
} as const;

/** Tailwind class for the CSS-only static fallback shown before WebGL initializes
 *  or when fluidMode === "off". Should approximate the look of the fluid at rest. */
export const LANDING_STATIC_FLUID_FALLBACK_CLASS =
  "absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent";