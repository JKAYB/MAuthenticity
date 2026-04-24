import { createFileRoute } from "@tanstack/react-router";
import { InternalScansPage } from "@/features/internal-ops/InternalScansPage";

export const Route = createFileRoute("/internal/scans")({
  head: () => ({
    meta: [
      { title: "Internal scan ops — MAuthenticity" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  /** Isolated from `_app`: uses `X-Internal-Token` only (see `internal-ops-api`). */
  component: InternalScansPage,
});
