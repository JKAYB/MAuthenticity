import { Laptop, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className={cn("shrink-0 touch-manipulation", className)}
      aria-label={
        theme === "system"
          ? `System theme active, currently ${resolvedTheme}`
          : isDark
            ? "Switch to light theme"
            : "Switch to dark theme"
      }
      title={
        theme === "system"
          ? `System theme active, currently ${resolvedTheme}`
          : isDark
            ? "Switch to light theme"
            : "Switch to dark theme"
      }
    >
      {theme === "system" ? (
        <Laptop className="h-4 w-4" aria-hidden />
      ) : isDark ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );
}

export function ThemeSegmentedControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn("inline-flex rounded-lg border border-border bg-input/40 p-0.5", className)}
      role="group"
      aria-label="Appearance"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition [-webkit-tap-highlight-color:transparent]",
          theme === "light"
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={theme === "light"}
      >
        Light
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition [-webkit-tap-highlight-color:transparent]",
          theme === "dark"
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={theme === "dark"}
      >
        Dark
      </button>

      <button
        type="button"
        onClick={() => setTheme("system")}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition [-webkit-tap-highlight-color:transparent]",
          theme === "system"
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={theme === "system"}
      >
        System
      </button>
    </div>
  );
}