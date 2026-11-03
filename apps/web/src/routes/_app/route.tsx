import { AppShell } from "@astryxdesign/core/AppShell";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { getToken } from "../../lib/auth.ts";
import { statusQuery } from "../../lib/queries.ts";
import { AppSideNav } from "./-components/app-side-nav.tsx";
import { AppTopNav } from "./-components/app-top-nav.tsx";
import { SettingsDialog } from "./-components/settings-dialog.tsx";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: "/login", replace: true });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(statusQuery),
  component: AppLayout,
});

function AppLayout() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <AppShell
      contentPadding={5}
      topNav={<AppTopNav />}
      sideNav={<AppSideNav onOpenSettings={() => setIsSettingsOpen(true)} />}
    >
      <Outlet />
      <SettingsDialog isOpen={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </AppShell>
  );
}
