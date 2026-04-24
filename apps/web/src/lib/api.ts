import { meQueryKey } from "@/features/auth/queryKeys";
import { isLiveDemo } from "@/lib/demo-mode";
import { getRouterQueryClient } from "./queryClient";

/**
 * HTTP helpers: `apiBase()` + `apiFetch` / `apiJson` send credentials (HttpOnly auth cookie),
 * default JSON headers for bodies, and parse responses safely. Use `apiFetch` for multipart uploads.
 * Live demo mode blocks `apiFetch` (no authenticated API traffic); login/signup use raw `fetch` below.
 */
export function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
  return String(raw).replace(/\/+$/, "");
}

export type ApiErrorBody = { error?: string };

export class ApiHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (isLiveDemo()) {
    throw new Error(
      "Live demo is active — API requests are disabled. Exit demo in the top banner to use your workspace.",
    );
  }
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers, credentials: "include" });
  if (res.status === 401 || res.status === 403) {
    try {
      getRouterQueryClient().removeQueries({ queryKey: meQueryKey });
    } catch {
      /* QueryClient not bound yet (e.g. tests) */
    }
  }
  return res;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const data = (await parseJson(res)) as T & ApiErrorBody;
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "error" in data ? String(data.error) : res.statusText;
    throw new ApiHttpError(res.status, msg || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function loginRequest(email: string, password: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${apiBase()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  const data = (await parseJson(res)) as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(data.error || "Login failed");
  return { ok: true };
}

export async function signupRequest(email: string, password: string): Promise<void> {
  const res = await fetch(`${apiBase()}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  const data = (await parseJson(res)) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Signup failed");
}

export async function logoutRequest(): Promise<void> {
  const res = await fetch(`${apiBase()}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok && res.status !== 401) {
    const data = (await parseJson(res)) as { error?: string };
    throw new Error(data.error || "Logout failed");
  }
}

export type MeResponse = {
  id: string;
  email: string;
  name: string | null;
  organization: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationPlan?: string | null;
  plan: string;
  selectedPlan: string;
  plan_selected: boolean;
  planSelected: boolean;
  must_change_password: boolean;
  subscriptionStatus: "active" | "expired" | "none";
  scanLimit: number | null;
  scansUsed: number;
  planExpiresAt: string | null;
  hasEverHadPaidPlan: boolean;
  teamId: string | null;
  teamRole: "owner" | "member" | null;
  isTeamOwner: boolean;
  access: {
    plan_code: string;
    access_state: string;
    scans_used: number;
    scan_limit: number | null;
    has_paid_history: boolean;
    can_manage_team: boolean;
  };
};

export async function getMe(): Promise<MeResponse> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 10_000);
  try {
    return await apiJson<MeResponse>("/me", { signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Auth bootstrap timed out");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function updateProfile(body: {
  name?: string | null;
  organization?: string | null;
}): Promise<MeResponse> {
  return apiJson<MeResponse>("/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function changePassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>("/me/password", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type AccessStateResponse = {
  plan_code: string;
  access_state: string;
  scans_used: number;
  scan_limit: number | null;
  has_paid_history: boolean;
  plan_selected: boolean;
  must_change_password: boolean;
  team_role: "team_owner" | "team_member" | null;
  team_id: string | null;
};

export async function getAccessState(): Promise<AccessStateResponse> {
  return apiJson<AccessStateResponse>("/access/me");
}

export async function selectPlan(planCode: string): Promise<{ ok: boolean; planCode: string; teamId?: string }> {
  return apiJson<{ ok: boolean; planCode: string; teamId?: string }>("/access/select", {
    method: "POST",
    body: JSON.stringify({ planCode }),
  });
}

export type TeamMemberRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  must_change_password: boolean;
};

export type TeamInviteRow = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "declined" | "expired" | "revoked";
  expires_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MyTeamResponse = {
  team: { id: string; owner_user_id: string; name: string | null; created_at: string } | null;
  members: TeamMemberRow[];
  invites: TeamInviteRow[];
  role?: "team_owner" | "team_member" | null;
};

export async function getMyTeam(): Promise<MyTeamResponse> {
  return apiJson<MyTeamResponse>("/access/team");
}

export async function addTeamMember(email: string): Promise<{
  ok: boolean;
  status: "invitation_sent";
  invite: TeamInviteRow | null;
}> {
  return apiJson("/access/team/members", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function acceptTeamInvite(token: string): Promise<{ ok: boolean; status: "accepted" }> {
  return apiJson("/access/team/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function declineTeamInvite(token: string): Promise<{ ok: boolean; status: "declined" }> {
  return apiJson("/access/team/invites/decline", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function resendTeamInvite(
  inviteId: string,
): Promise<{ ok: boolean; status: "invitation_sent"; inviteId: string }> {
  return apiJson(`/access/team/invites/${encodeURIComponent(inviteId)}/resend`, {
    method: "POST",
  });
}

export async function removeTeamMember(userId: string): Promise<void> {
  const res = await apiFetch(`/access/team/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await parseJson(res)) as { error?: string };
    throw new Error(body?.error || "Failed to remove team member");
  }
}

export type ApiScanRow = {
  id: string;
  filename: string;
  mime_type: string;
  media_type?: "image" | "video" | "audio" | "document" | "other";
  file_size_bytes?: number;
  status: string;
  confidence: number | string | null;
  is_ai_generated: boolean | null;
  result_payload?: unknown;
  error_message?: string | null;
  summary?: string | null;
  source_type?: string | null;
  source_url?: string | null;
  storage_key?: string | null;
  storage_provider?: string | null;
  detection_provider?: string | null;
  /** Present when GET /scan/:id stripped expired vendor heatmap URLs from `result_payload`. */
  heatmaps_expired?: boolean;
  /** Aggregation JSON exists server-side; fetch via GET `/scan/:id/artifacts/aggregation`. */
  artifact_aggregation_available?: boolean;
  /** Model metadata JSON exists; fetch via GET `/scan/:id/artifacts/model-metadata`. */
  artifact_model_metadata_available?: boolean;
  scan_group_id?: string | null;
  retry_of_scan_id?: string | null;
  attempt_number?: number;
  retry_count?: number;
  last_error?: string | null;
  provider_execution?: Array<{
    id: string;
    name: string;
    status: "queued" | "processing" | "completed" | "failed";
  }>;
  attempts?: Array<{
    id: string;
    status: string;
    attempt_number?: number;
    created_at?: string;
    completed_at?: string | null;
    retry_of_scan_id?: string | null;
  }>;
  created_at: string;
  completed_at?: string | null;
  updated_at?: string | null;
};

export type ScanHistoryResponse = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  data: ApiScanRow[];
};

export type ScanProvider = {
  id: string;
  name: string;
  enabled: boolean;
  supports?: Partial<Record<"image" | "video" | "audio" | "document" | "other" | "url", boolean>>;
  access?: Partial<Record<"free" | "individual" | "organization", boolean>>;
  sortOrder?: number;
};

export async function getScanProviders(): Promise<ScanProvider[]> {
  const res = await apiJson<{ data?: ScanProvider[] }>("/scan/providers");
  return Array.isArray(res.data) ? res.data : [];
}

/** Matches `GET /scan/history` query `result` (UI scan outcome filter). */
export type ScanHistoryResultFilter =
  | "authentic"
  | "manipulated"
  | "suspicious"
  | "analyzing"
  | "failed";

export async function getScanHistory(
  params: {
    page?: number;
    limit?: number;
    mediaType?: "image" | "video" | "audio" | "document" | "other";
    result?: ScanHistoryResultFilter;
    q?: string;
  } = {},
): Promise<ScanHistoryResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.mediaType) q.set("mediaType", params.mediaType);
  if (params.result) q.set("result", params.result);
  if (params.q && params.q.trim()) q.set("q", params.q.trim());
  const qs = q.toString();
  return apiJson<ScanHistoryResponse>(`/scan/history${qs ? `?${qs}` : ""}`);
}

export async function getScanById(id: string): Promise<ApiScanRow> {
  return apiJson<ApiScanRow>(`/scan/${id}`);
}

export async function retryScanById(id: string): Promise<{
  ok: boolean;
  scan: {
    id: string;
    status: string;
    retryOfScanId: string;
    scanGroupId: string;
    attemptNumber: number;
    retryCount: number;
  };
}> {
  return apiJson(`/scan/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

/** Matches `GET /scan/analytics/activity` query `range`. */
export type ScanAnalyticsRange = "7d" | "14d" | "30d";

export type ScanActivitySummary = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  other: number;
};

export type ScanActivityPoint = {
  date: string;
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  other: number;
};

export type ScanAnalyticsActivityResponse = {
  range: ScanAnalyticsRange;
  groupBy: "day";
  summary: ScanActivitySummary;
  points: ScanActivityPoint[];
};

export type DetectionMixItem = {
  key: "authentic" | "suspicious" | "manipulated";
  label: string;
  count: number;
  percentage: number;
};

export type ScanAnalyticsDetectionMixResponse = {
  range: ScanAnalyticsRange;
  total: number;
  items: DetectionMixItem[];
};

export async function getScanAnalyticsActivity(
  range: ScanAnalyticsRange = "14d",
): Promise<ScanAnalyticsActivityResponse> {
  const q = new URLSearchParams({ range, groupBy: "day" });
  return apiJson<ScanAnalyticsActivityResponse>(`/scan/analytics/activity?${q.toString()}`);
}

export async function getScanAnalyticsDetectionMix(
  range: ScanAnalyticsRange = "14d",
): Promise<ScanAnalyticsDetectionMixResponse> {
  const q = new URLSearchParams({ range });
  return apiJson<ScanAnalyticsDetectionMixResponse>(
    `/scan/analytics/detection-mix?${q.toString()}`,
  );
}

const SCAN_UPLOAD_MS = 120_000;

export async function submitScanFile(
  file: File,
  providers: string[] = [],
): Promise<{ id: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);
  if (providers.length > 0) {
    formData.append("providers", JSON.stringify(providers));
  }
  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), SCAN_UPLOAD_MS);
  try {
    const res = await apiFetch("/scan", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    const data = (await parseJson(res)) as {
      id?: string;
      status?: string;
      error?: string;
      scan?: { id?: string; status?: string };
    };
    if (!res.ok) throw new Error(data.error || "Scan upload failed");
    const scanId = data.scan?.id || data.id;
    if (!scanId) throw new Error("Invalid scan response");
    return { id: scanId, status: data.scan?.status || data.status || "pending" };
  } finally {
    window.clearTimeout(t);
  }
}

const SCAN_URL_MS = 60_000;

export async function submitScanUrl(
  url: string,
  providers: string[] = [],
): Promise<{ id: string; status: string }> {
  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), SCAN_URL_MS);
  try {
    const res = await apiFetch("/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim(), providers }),
      signal: controller.signal,
    });
    const data = (await parseJson(res)) as {
      id?: string;
      status?: string;
      error?: string;
      scan?: { id?: string; status?: string };
    };
    if (!res.ok) throw new Error(data.error || "Scan request failed");
    const scanId = data.scan?.id || data.id;
    if (!scanId) throw new Error("Invalid scan response");
    return { id: scanId, status: data.scan?.status || data.status || "pending" };
  } finally {
    window.clearTimeout(t);
  }
}
