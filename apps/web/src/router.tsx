import { PpbError } from "@ppb/shared";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { ErrorView, NotFoundView, PendingView } from "./components/boundaries.tsx";
import { clearToken } from "./lib/auth.ts";
import { routeTree } from "./routeTree.gen.ts";

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
  queryCache: new QueryCache({
    onError: (error) => {
      // A rejected token means the daemon was reset or the token rotated: sign out.
      if (error instanceof PpbError && error.code === "UNAUTHORIZED") {
        clearToken();
        queryClient.clear();
        void router.navigate({ to: "/login" });
      }
    },
  }),
});

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPendingComponent: PendingView,
  defaultErrorComponent: ErrorView,
  defaultNotFoundComponent: NotFoundView,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
