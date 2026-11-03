import { LinkProvider } from "@astryxdesign/core/Link";
import { Theme } from "@astryxdesign/core/theme";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { defaultThemeSlug, themes } from "../astryx-themes.ts";
import { AppLink } from "../components/app-link.tsx";
import { useColorMode } from "../lib/color-mode.ts";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const { queryClient } = Route.useRouteContext();
  const mode = useColorMode();
  return (
    <QueryClientProvider client={queryClient}>
      <Theme theme={themes[defaultThemeSlug]} mode={mode}>
        <LinkProvider component={AppLink}>
          <Outlet />
        </LinkProvider>
      </Theme>
    </QueryClientProvider>
  );
}
