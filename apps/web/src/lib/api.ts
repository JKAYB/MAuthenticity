import { meQueryKey } from "@/features/auth/queryKeys";
import { isLiveDemo } from "@/lib/demo-mode";
import { clearToken, getToken, setToken } from "./auth-storage";
import { getRouterQueryClient } from "./queryClient";

/**
 * HTTP helpers: `apiBase()` + `apiFetch` / `apiJson` attach `Authorization` when a token exists,
 * default JSON headers for bodies, and parse responses safely. Use `apiFetch` for multipart uploads.
 * Live demo mode blocks `apiFetch` (no authenticated API traffic); login/signup use raw `fetch` below.
 */
export function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
  return String(raw).replace(/\/+$/, "");
}

export type ApiErrorBody = { error?: string };

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
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearToken();
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
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function loginRequest(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${apiBase()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await parseJson(res)) as { token?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "Login failed");
  if (!data.token) throw new Error("No token in response");
  setToken(data.token);
  return { token: data.token };
}

export async function signupRequest(email: string, password: string): Promise<void> {
  const res = await fetch(`${apiBase()}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await parseJson(res)) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Signup failed");
}

export type MeResponse = {
  id: string;
  email: string;
  name: string | null;
  organization: string | null;
  plan: string;
};

export async function getMe(): Promise<MeResponse> {
  return apiJson<MeResponse>("/me");
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

export type ApiScanRow = {
  id: string;
  filename: string;
  mime_type: string;
  file_size_bytes?: number;
  status: string;
  confidence: number | string | null;
  is_ai_generated: boolean | null;
  result_payload?: unknown;
  error_message?: string | null;
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

export async function getScanHistory(
  params: { page?: number; limit?: number } = {},
): Promise<ScanHistoryResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiJson<ScanHistoryResponse>(`/scan/history${qs ? `?${qs}` : ""}`);
}

export async function getScanById(id: string): Promise<ApiScanRow> {
  return apiJson<ApiScanRow>(`/scan/${id}`);
}

const SCAN_UPLOAD_MS = 120_000;

export async function submitScanFile(file: File): Promise<{ id: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), SCAN_UPLOAD_MS);
  try {
    const res = await apiFetch("/scan", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    const data = (await parseJson(res)) as { id?: string; status?: string; error?: string };
    if (!res.ok) throw new Error(data.error || "Scan upload failed");
    if (!data.id) throw new Error("Invalid scan response");
    return { id: data.id, status: data.status || "pending" };
  } finally {
    window.clearTimeout(t);
  }
}
