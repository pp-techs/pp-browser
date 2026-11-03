import { Tab, TabList } from "@astryxdesign/core/TabList";
import { VStack } from "@astryxdesign/core/VStack";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "../../../components/page-header.tsx";

export const Route = createFileRoute("/_app/connect")({
  component: ConnectLayout,
});

const TABS = [
  { to: "/connect", label: "Setup" },
  { to: "/connect/tools", label: "Tools" },
] as const;

function ConnectLayout() {
  const navigate = Route.useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active =
    TABS.find((tab) => tab.to !== "/connect" && pathname.startsWith(tab.to)) ?? TABS[0];

  return (
    <VStack gap={4}>
      <PageHeader
        title="MCP / API"
        description="Connect agents to the same profiles you manage here."
      />
      <TabList
        value={active.to}
        onChange={(value) => {
          const next = TABS.find((tab) => tab.to === value);
          if (next) void navigate({ to: next.to });
        }}
      >
        {TABS.map((tab) => (
          <Tab key={tab.to} value={tab.to} label={tab.label} />
        ))}
      </TabList>
      <Outlet />
    </VStack>
  );
}
