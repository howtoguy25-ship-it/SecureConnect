import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getApiUrl, getStoredToken } from "./api-utils";

export { getApiUrl, apiRequest, fetchWithTimeout } from "./api-utils";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);
    const token = await getStoredToken();

    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Guard every query against a hung server/connection: abort after 10s so
    // a stalled request surfaces a friendly error instead of an infinite
    // spinner (App Store 5.6 — no indefinitely-loading UI).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers,
        credentials: "include",
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          "The request timed out. Please check your connection and try again.",
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      // Optimized for faster perceived performance
      staleTime: 1000 * 60, // Data stays fresh for 1 minute
      gcTime: 1000 * 60 * 10, // Cache for 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: true, // Refresh when app comes to foreground
      refetchOnReconnect: true, // Refresh when network reconnects
      refetchInterval: false, // No automatic polling
      retry: 1, // One retry on failure
      retryDelay: 1000, // Wait 1 second before retry
    },
    mutations: {
      retry: false,
    },
  },
});

// Set specific cache times for different query types
queryClient.setQueryDefaults(["/api/conversations"], {
  staleTime: 1000 * 30, // Conversations fresh for 30 seconds
});

queryClient.setQueryDefaults(["/api/statuses"], {
  staleTime: 1000 * 60 * 2, // Statuses fresh for 2 minutes
});

queryClient.setQueryDefaults(["/api/messages"], {
  staleTime: 1000 * 10, // Messages fresh for 10 seconds (real-time updates via socket)
});
