import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/mock-data";
import {
  getRecentNotifications,
  unreadNotificationCount,
  type NotificationItem,
  type NotificationLink,
} from "@/lib/notifications-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function NotificationTarget({
  link,
  className,
  children,
}: {
  link: NotificationLink;
  className?: string;
  children: React.ReactNode;
}) {
  if (link.type === "scan") {
    return (
      <Link to="/scans/$id" params={{ id: link.scanId }} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to={link.to} className={className}>
      {children}
    </Link>
  );
}

const notificationItemHighlight =
  "cursor-pointer rounded-lg p-0 text-foreground outline-none focus:bg-transparent data-[highlighted]:bg-transparent";

function NotificationRow({ n }: { n: NotificationItem }) {
  return (
    <DropdownMenuItem asChild className={notificationItemHighlight}>
      <NotificationTarget
        link={n.link}
        className={cn(
          "block w-full rounded-lg border px-3 py-2.5 text-left shadow-sm transition-[border-color,background-color,box-shadow]",
          "border-border/90 bg-muted/45 hover:border-primary/40 hover:bg-primary/12",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-0",
          "data-[highlighted]:border-primary/45 data-[highlighted]:bg-primary/14",
          n.read
            ? "hover:bg-muted/70 data-[highlighted]:border-border/90 data-[highlighted]:bg-muted/70"
            : "border-primary/40 bg-primary/10 ring-1 ring-inset ring-primary/20 hover:border-primary/50 hover:bg-primary/16 data-[highlighted]:border-primary/55 data-[highlighted]:bg-primary/18",
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-tight text-foreground">{n.title}</span>
              {!n.read ? (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_color-mix(in_oklab,var(--primary)_65%,transparent)]"
                  aria-hidden
                />
              ) : null}
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-foreground/75">{n.description}</p>
            <p className="text-[11px] font-medium tabular-nums tracking-wide text-foreground/50">
              {timeAgo(n.createdAt)}
            </p>
          </div>
        </div>
      </NotificationTarget>
    </DropdownMenuItem>
  );
}

export function NotificationBell() {
  const recent = getRecentNotifications(5);
  const unread = unreadNotificationCount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(100vw-2rem,22rem)] border-border/80 bg-popover p-0 shadow-xl ring-1 ring-border/50"
        sideOffset={8}
      >
        <div className="border-b border-border/80 bg-muted/40 px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <p className="text-xs leading-snug text-foreground/65">Recent activity in your workspace</p>
        </div>
        <div className="max-h-[min(18rem,70vh)] space-y-2 overflow-y-auto bg-popover/95 p-2">
          {recent.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-foreground/55">No notifications yet</p>
          ) : (
            recent.map((n) => <NotificationRow key={n.id} n={n} />)
          )}
        </div>
        <DropdownMenuSeparator className="my-0 bg-border/80" />
        <DropdownMenuItem asChild className={notificationItemHighlight}>
          <Link
            to="/notifications"
            className="flex w-full justify-center border-t border-border/70 bg-muted/35 py-3 text-sm font-semibold text-primary transition-colors hover:bg-muted/50 hover:text-primary data-[highlighted]:bg-muted/45 data-[highlighted]:text-primary"
          >
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
