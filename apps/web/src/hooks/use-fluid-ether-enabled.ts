import { useSyncExternalStore } from "react";

export type FluidEtherLandingMode = "off" | "lite" | "full";

function readDeviceMemoryGb(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof dm === "number" && Number.isFinite(dm) ? dm : undefined;
}

function readHardwareConcurrency(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const n = navigator.hardwareConcurrency;
  return typeof n === "number" && n > 0 ? n : undefined;
}

/**
 * Conservative landing fluid tier for WebGL cost vs. quality.
 * - `off` — reduced motion, touch-first, small viewports, or very weak hardware.
 * - `lite` — mid-size desktop/laptop viewports or downgraded full tier.
 * - `full` — large desktop with fine pointer and adequate cores/memory only.
 */
function computeFluidMode(): FluidEtherLandingMode {
  if (typeof window === "undefined") return "off";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // return "off";
    return "lite";
  }

  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
    // return "off";
    return "lite";
  }

  const w = typeof window.innerWidth === "number" ? window.innerWidth : 0;
  if (w < 768) {
    // return "off";
    return "lite";
  }

  const cores = readHardwareConcurrency();
  const memGb = readDeviceMemoryGb();

  const weakSevere =
    (typeof cores === "number" && cores <= 2) || (typeof memGb === "number" && memGb < 4);

  const weakModerate =
    (typeof cores === "number" && cores <= 4) || (typeof memGb === "number" && memGb < 8);

  if (w < 1280) {
    // return weakSevere ? "off" : "lite";
    return "lite";
  }

  if (weakModerate) {
    return "lite";
  }

  return "full";
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const mqs = [
    window.matchMedia("(prefers-reduced-motion: reduce)"),
    window.matchMedia("(hover: none) and (pointer: coarse)"),
  ];
  mqs.forEach((mq) => mq.addEventListener("change", onStoreChange));

  const onResize = () => onStoreChange();
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize);

  return () => {
    mqs.forEach((mq) => mq.removeEventListener("change", onStoreChange));
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
  };
}

function getSnapshot(): FluidEtherLandingMode {
  return computeFluidMode();
}

function getServerSnapshot(): FluidEtherLandingMode {
  // return "off";
  return "lite";
}

export function useFluidEtherLandingMode(): FluidEtherLandingMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
