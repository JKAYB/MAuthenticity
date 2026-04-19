import { useCallback, useSyncExternalStore } from "react";
import {
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeSnapshot = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
};

let lastSnapshot: ThemeSnapshot | null = null;

function subscribe(onStoreChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY || e.key === null) onStoreChange();
  };

  const onCustom = () => onStoreChange();
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => onStoreChange();

  window.addEventListener("storage", onStorage);
  window.addEventListener("mediaauth-theme", onCustom);
  media.addEventListener("change", onSystemChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("mediaauth-theme", onCustom);
    media.removeEventListener("change", onSystemChange);
  };
}

function buildSnapshot(): ThemeSnapshot {
  const theme = getStoredTheme() ?? "system";
  const systemTheme = getSystemTheme();
  const resolvedTheme = resolveTheme(theme);

  if (
    lastSnapshot &&
    lastSnapshot.theme === theme &&
    lastSnapshot.systemTheme === systemTheme &&
    lastSnapshot.resolvedTheme === resolvedTheme
  ) {
    return lastSnapshot;
  }

  lastSnapshot = {
    theme,
    resolvedTheme,
    systemTheme,
  };

  return lastSnapshot;
}

function getSnapshot(): ThemeSnapshot {
  return buildSnapshot();
}

function getServerSnapshot(): ThemeSnapshot {
  return {
    theme: "system",
    resolvedTheme: "dark",
    systemTheme: "dark",
  };
}

export function useTheme() {
  const { theme, resolvedTheme, systemTheme } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setTheme = useCallback((next: ThemePreference) => {
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  return { theme, resolvedTheme, systemTheme, setTheme, toggleTheme };
}