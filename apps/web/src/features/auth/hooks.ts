import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { clearToken, getTokenSnapshot, subscribeToken } from "@/lib/auth-storage";
import { getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import {
  changePassword as changePasswordRequest,
  getMe,
  loginRequest,
  signupRequest,
  type MeResponse,
} from "@/lib/api";
import { getRouterQueryClient } from "@/lib/queryClient";
import { meQueryKey } from "./queryKeys";

export { meQueryKey } from "./queryKeys";

export function meQueryOptions() {
  return {
    queryKey: meQueryKey,
    queryFn: () => getMe(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  };
}

/** Ensures `/me` is loaded (e.g. from route `beforeLoad`). */
export async function prefetchMe() {
  return getRouterQueryClient().ensureQueryData(meQueryOptions());
}

/**
 * Current user from `GET /me`. Disabled in live demo or without a token.
 * Auth state for the session: `data` present ⇒ authenticated for API-backed UI.
 */
export function useMe(): UseQueryResult<MeResponse, Error> {
  const hasToken = useSyncExternalStore(subscribeToken, getTokenSnapshot, () => null);
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  return useQuery({
    ...meQueryOptions(),
    enabled: Boolean(hasToken) && !liveDemo,
  });
}

type LoginVars = { email: string; password: string };

export function useLogin(
  options?: Omit<UseMutationOptions<{ token: string }, Error, LoginVars>, "mutationFn">,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: LoginVars) => loginRequest(email, password),
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
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
  return () => {
    clearToken();
    qc.removeQueries({ queryKey: meQueryKey });
    navigate({ to: "/login" });
  };
}
