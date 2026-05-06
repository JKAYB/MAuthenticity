type GuardedConsoleMethod = "log" | "info" | "debug";

const GUARDED_METHODS: GuardedConsoleMethod[] = ["log", "info", "debug"];
const INSTALLED_FLAG = "__mediaAuthConsoleGuardInstalled__";

declare global {
  interface Window {
    __mediaAuthConsoleGuardInstalled__?: boolean;
  }
}

/**
 * In production, silence noisy console methods while preserving warn/error.
 * This runs once and is safe to call multiple times.
 */
export function installProductionConsoleGuard(): void {
  if (!import.meta.env.PROD) return;

  const root = globalThis as typeof globalThis & {
    [INSTALLED_FLAG]?: boolean;
  };
  if (root[INSTALLED_FLAG]) return;

  for (const method of GUARDED_METHODS) {
    console[method] = () => {};
  }

  root[INSTALLED_FLAG] = true;
}

