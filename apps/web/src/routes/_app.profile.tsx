import { createFileRoute, Link } from "@tanstack/react-router";
import { ProfileAccountCard } from "@/components/profile/ProfileSection";
import { SectionHeader } from "@/components/ui-ext/SectionHeader";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — MediaAuth" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <div className="mx-auto space-y-6">
      <SectionHeader
        eyebrow="Account"
        title="Your profile"
        description="Update your display name and organization. Security, sessions, and notifications are in Settings."
        action={
          <Link to="/settings" className="text-sm font-medium text-primary hover:underline">
            All settings →
          </Link>
        }
      />
      <ProfileAccountCard />
    </div>
  );
}
