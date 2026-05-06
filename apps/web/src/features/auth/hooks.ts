import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { disableLiveDemo, getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import {
  ApiHttpError,
  changePassword as changePasswordRequest,
  getMe,
  loginRequest,
  logoutRequest,
  signupRequest,
  type MeResponse,
} from "@/lib/api";
import { getRouterQueryClient } from "@/lib/queryClient";
import { meQueryKey } from "./queryKeys";

export { meQueryKey } from "./queryKeys";

export function meQueryOptions() {
  return {
    queryKey: meQueryKey,
    queryFn: getMe,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 1,
  };
}

/** Ensures `/me` is loaded (e.g. from route `beforeLoad`). */
export async function prefetchMe() {
  const qc = getRouterQueryClient();
  console.info("[auth] loading started");
  try {
    const data = await qc.ensureQueryData(meQueryOptions());
    console.info("[auth] /me success");
    return data;
  } catch (error) {
    const status = error instanceof ApiHttpError ? error.status : "unknown";
    console.warn("[auth] /me failed with status", status);
    if (status === 401 || status === 403) {
      qc.removeQueries({ queryKey: meQueryKey });
      qc.setQueryData(meQueryKey, undefined);
    }
    throw error;
  } finally {
    console.info("[auth] loading finished");
  }
}

/**
 * Current user from `GET /me`. Disabled in live demo.
 * Auth state for the session: `data` present ⇒ authenticated for API-backed UI.
 */
export function useMe(): UseQueryResult<MeResponse, Error> {
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  return useQuery({
    ...meQueryOptions(),
    enabled: !liveDemo,
  });
}
export function useMeWithEnabled(enabled: boolean): UseQueryResult<MeResponse, Error> {
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  return useQuery({
    ...meQueryOptions(),
    enabled: !liveDemo && enabled,
  });
}

export async function fetchFreshMe(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: meQueryKey,
    queryFn: getMe,
    staleTime: 0,
  });
}

type LoginVars = { email: string; password: string };

export function useLogin(
  options?: Omit<UseMutationOptions<{ ok: boolean }, Error, LoginVars>, "mutationFn">,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: LoginVars) => loginRequest(email, password),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      // Marketing "live demo" must not carry into a real session — otherwise /me and scans stay on mock data.
      disableLiveDemo();
      await qc.invalidateQueries({ queryKey: meQueryKey });
      await options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}

type SignupVars = { email: string; password: string };

export function useSignup(
  options?: Omit<UseMutationOptions<void, Error, SignupVars>, "mutationFn">,
) {
  return useMutation({
    mutationFn: ({ email, password }: SignupVars) => signupRequest(email, password),
    ...options,
  });
}

type ChangePasswordVars = { currentPassword: string; newPassword: string };

export function useChangePassword(
  options?: Omit<UseMutationOptions<{ ok: boolean }, Error, ChangePasswordVars>, "mutationFn">,
) {
  return useMutation({
    mutationFn: (vars: ChangePasswordVars) => changePasswordRequest(vars),
    ...options,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    try {
      await logoutRequest();
    } finally {
      qc.removeQueries({ queryKey: meQueryKey });
      navigate({ to: "/login" });
    }
  };
}
