import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { timeAgo } from "@/lib/mock-data";
import { notificationFeed, type NotificationItem } from "@/lib/notifications-data";
import { SectionHeader } from "@/components/ui-ext/SectionHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Observyx" }] }),
  component: NotificationsPage,
});

function NotificationLinkRow({ n }: { n: NotificationItem }) {
  const link = n.link;
  const inner = (
    <div
      className={cn(
        "flex gap-3 rounded-xl border border-border/85 bg-muted/35 p-4 shadow-sm transition hover:border-border hover:bg-muted/50",
        !n.read && "border-primary/45 bg-primary/10 ring-1 ring-inset ring-primary/20 hover:border-primary/50 hover:bg-primary/14",
      )}
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/50 bg-background/60 text-foreground/55">
        <Bell className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{n.title}</h2>
          {!n.read ? (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Unread
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/75">{n.description}</p>
        <p className="mt-2 text-xs font-medium tabular-nums text-foreground/50">{timeAgo(n.createdAt)}</p>
      </div>
    </div>
  );

  if (link.type === "scan") {
    return (
      <Link
        to="/scans/$id"
        params={{ id: link.scanId }}
        className="block outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    );
  }
  return (
    <Link
      to={link.to}
      className="block outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    >
      {inner}
    </Link>
  );
}

function NotificationsPage() {
  const ordered = [...notificationFeed].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="mx-auto space-y-6">
      <SectionHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Alerts for completed scans, flags, and account activity. Delivery preferences are in Settings."
        action={
          <Link
            to="/settings"
            search={{ tab: "notifications" }}
            className="text-sm font-medium text-primary hover:underline"
          >
            Notification settings →
          </Link>
        }
      />

      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card/50 p-10 text-center text-sm text-muted-foreground">
          You have no notifications yet.
        </div>
      ) : (
        <ul className="space-y-4">
          {ordered.map((n) => (
            <li key={n.id}>
              <NotificationLinkRow n={n} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
