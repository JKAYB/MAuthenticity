import { scans } from "@/lib/mock-data";

export type NotificationLink =
  | { type: "scan"; scanId: string }
  | { type: "route"; to: "/scans" | "/settings" | "/dashboard" | "/scan" };

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
  link: NotificationLink;
};

const sampleScanId = scans[0]?.id ?? "scn_8f3a21";

/** In-app notification feed (placeholder until a notifications API exists). */
export const notificationFeed: NotificationItem[] = [
  {
    id: "ntf_scan_done",
    title: "Scan complete",
    description: `${scans[0]?.title ?? "Your file"} finished processing.`,
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    read: false,
    link: { type: "scan", scanId: sampleScanId },
  },
  {
    id: "ntf_flagged",
    title: "Manipulation flagged",
    description: "A recent upload exceeded the authenticity threshold.",
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    read: false,
    link: { type: "scan", scanId: sampleScanId },
  },
  {
    id: "ntf_digest",
    title: "Weekly digest",
    description: "Your workspace summary for last week is ready to view.",
    createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
    read: true,
    link: { type: "route", to: "/dashboard" },
  },
];

export function getRecentNotifications(limit = 5): NotificationItem[] {
  return [...notificationFeed]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function unreadNotificationCount(): number {
  return notificationFeed.filter((n) => !n.read).length;
}
