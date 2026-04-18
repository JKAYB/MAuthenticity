import { useSyncExternalStore } from "react";

/**
 * Fluid WebGL (LiquidEther) is heavy on mobile GPUs. Disable when the user
 * prefers reduced motion or is on a touch-primary device (coarse pointer).
 */
function subscribe(onStoreChange: () => void) {
  const mqs = [
    window.matchMedia("(prefers-reduced-motion: reduce)"),
    window.matchMedia("(hover: none) and (pointer: coarse)"),
  ];
  mqs.forEach((mq) => mq.addEventListener("change", onStoreChange));
  return () => mqs.forEach((mq) => mq.removeEventListener("change", onStoreChange));
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return false;
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useFluidEtherEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
