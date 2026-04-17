import { Link, Outlet, useLocation, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  ScanSearch,
  History,
  Settings,
  Search,
  Menu,
  X,
  LogOut,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { getToken } from "@/lib/auth-storage";
import { useLogout, useMe } from "@/features/auth/hooks";
import { disableLiveDemo, getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import { user as demoUser } from "@/lib/mock-data";
import { displayNameFromMe, initialsFromDisplayName } from "@/lib/user-display";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "New scan", icon: ScanSearch },
  { to: "/scans", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function SidebarContent({
  pathname,
  onMobileNavClick,
  onLogout,
  profile,
}: {
  pathname: string;
  onMobileNavClick?: () => void;
  onLogout: () => void;
  profile: { name: string; email: string; initials: string } | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        <div className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Workspace
        </div>
        {nav.map((item) => {
          // Exact match or nested route; `/scans` must not match prefix `/scan`.
          const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onMobileNavClick}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-accent/10 ring-1 ring-inset ring-primary/30"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="relative h-4 w-4 shrink-0" />
              <span className="relative">{item.label}</span>
              {active && (
                <span className="relative ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl border border-border/60 bg-gradient-to-br from-primary/10 via-accent/10 to-transparent p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Upgrade to Enterprise
        </div>
        <p className="text-xs text-muted-foreground">
          Unlimited scans, team workspaces, and audit-grade reports.
        </p>
        <button className="mt-3 w-full rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90">
          See plans
        </button>
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-center gap-1">
          <Link
            to="/profile"
            onClick={onMobileNavClick}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent",
              pathname === "/profile" && "bg-sidebar-accent ring-1 ring-inset ring-primary/25",
            )}
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-semibold text-primary-foreground">
              {profile?.initials ?? "—"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{profile?.name ?? "…"}</div>
              <div className="truncate text-xs text-muted-foreground">{profile?.email ?? ""}</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  const meQuery = useMe();
  const logout = useLogout();

  const profile = useMemo(() => {
    if (liveDemo) {
      return {
        email: demoUser.email,
        name: demoUser.name,
        initials: demoUser.initials,
      };
    }
    if (meQuery.isSuccess && meQuery.data) {
      const me = meQuery.data;
      return {
        email: me.email,
        name: displayNameFromMe(me),
        initials: initialsFromDisplayName(me.name, me.email),
      };
    }
    return null;
  }, [liveDemo, meQuery.isSuccess, meQuery.data]);

  const exitLiveDemo = () => {
    disableLiveDemo();
    setMobileOpen(false);
    if (!getToken()) {
      navigate({ to: "/" });
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const onLogout = () => {
    disableLiveDemo();
    logout();
  };

  return (
    <div className="relative min-h-screen">
      {/* Top progress bar */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-primary via-accent to-primary"
          />
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar/70 backdrop-blur-xl lg:block">
        <SidebarContent pathname={location.pathname} profile={profile} onLogout={onLogout} />
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-sidebar-border bg-sidebar lg:hidden"
            >
              <SidebarContent
                pathname={location.pathname}
                profile={profile}
                onMobileNavClick={() => setMobileOpen(false)}
                onLogout={() => {
                  setMobileOpen(false);
                  onLogout();
                }}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        {liveDemo && (
          <div className="sticky top-0 z-30 border-b border-primary/30 bg-gradient-to-r from-primary/15 to-accent/10 px-4 py-2 text-center text-xs sm:text-sm">
            <span className="text-muted-foreground">You’re viewing a </span>
            <span className="font-semibold text-foreground">live demo</span>
            <span className="text-muted-foreground"> with sample data — not your account. </span>
            <button
              type="button"
              onClick={exitLiveDemo}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Exit demo
            </button>
          </div>
        )}
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              className="rounded-md p-2 hover:bg-muted lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative hidden flex-1 max-w-md md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search scans, reports, media…"
                className="h-9 w-full rounded-lg border border-border bg-input/60 pl-9 pr-16 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
                ⌘K
              </kbd>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </header>

        <main className="relative px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile menu close */}
      {mobileOpen && (
        <button
          className="fixed right-4 top-3 z-[60] rounded-md bg-card p-2 text-foreground shadow lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
