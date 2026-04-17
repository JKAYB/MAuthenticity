import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { bindRouterQueryClient, createAppQueryClient } from "./lib/queryClient";
import "./styles.css";

const queryClient = createAppQueryClient();
bindRouterQueryClient(queryClient);
const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {import.meta.env.DEV ? (
        <ReactQueryDevtools buttonPosition="bottom-left" initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  </StrictMode>,
);
