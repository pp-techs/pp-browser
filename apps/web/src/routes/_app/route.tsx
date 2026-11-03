import { AppShell } from "@astryxdesign/core/AppShell";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getToken } from "../../lib/auth.ts";
import { statusQuery } from "../../lib/queries.ts";
import { AppSideNav } from "./-components/app-side-nav.tsx";
import { AppTopNav } from "./-components/app-top-nav.tsx";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: "/login", replace: true });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(statusQuery),
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell contentPadding={5} topNav={<AppTopNav />} sideNav={<AppSideNav />}>
      <Outlet />
    </AppShell>
  );
}
