import { QueryClient } from "@tanstack/react-query";

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  });
}

let boundClient: QueryClient | null = null;

/** Call once from `main.tsx` before router `beforeLoad` runs. */
export function bindRouterQueryClient(client: QueryClient) {
  boundClient = client;
}

export function getRouterQueryClient(): QueryClient {
  if (!boundClient) {
    throw new Error("QueryClient not bound; wrap the app in QueryClientProvider and call bindRouterQueryClient");
  }
  return boundClient;
}
