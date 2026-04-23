import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export type MarketingHeaderPage = "home" | "how-it-works";

type MarketingHeaderProps = {
  currentPage: MarketingHeaderPage;
};

const headerCtaClassName =
  "mobile-tap-fix inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition hover:scale-[1.02]";

export function MarketingHeader({ currentPage }: MarketingHeaderProps) {
  const homeCurrent = currentPage === "home";
  const howCurrent = currentPage === "how-it-works";

  return (
    <header className="relative z-50 mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/"
          aria-label="Observyx home"
          className="mobile-tap-fix inline-flex w-fit shrink-0 touch-manipulation rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring [-webkit-tap-highlight-color:transparent]"
        >
          <Logo />
        </Link>

        <nav
          className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
          aria-label="Primary"
        >
          {homeCurrent ? (
            <Link to="/" className="font-medium text-foreground" aria-current="page">
              Home
            </Link>
          ) : (
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
          )}
          {howCurrent ? (
            <span className="font-medium text-foreground whitespace-nowrap" aria-current="page">
              How it works
            </span>
          ) : (
            <Link to="/how-it-works" className="hover:text-foreground whitespace-nowrap">
              How it works
            </Link>
          )}
          <Link to="/login" className="hover:text-foreground whitespace-nowrap">
            Sign in
          </Link>
          <ThemeToggle />
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Link to="/login" className={headerCtaClassName} aria-label="Sign in">
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
