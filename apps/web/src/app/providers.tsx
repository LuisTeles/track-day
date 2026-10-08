"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RepositoriesProvider } from "@/data/provider";
import { ConfirmProvider } from "@/shared/ui/confirm";
import { ToastProvider } from "@/shared/ui/toast";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Local data never goes stale behind our back; mutations invalidate.
        defaultOptions: { queries: { staleTime: Infinity, retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RepositoriesProvider>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </RepositoriesProvider>
    </QueryClientProvider>
  );
}
