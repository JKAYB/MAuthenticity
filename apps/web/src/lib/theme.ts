export const THEME_STORAGE_KEY = "mediaauth-theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function getStoredTheme(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Default when nothing valid is stored: system. */
export function resolveTheme(preference: ThemePreference | null): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  // return preference === "system" ? getSystemTheme() : "dark"; // TODO: Uncomment this to set default to dark
  return getSystemTheme();
}

export function applyTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const resolved = resolveTheme(theme);

  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }

  window.dispatchEvent(new Event("mediaauth-theme"));
}