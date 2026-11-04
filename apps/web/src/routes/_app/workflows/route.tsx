import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "../../../components/page-header.tsx";
import { workflowsQuery } from "../../../lib/queries.ts";
import { WorkflowsTable } from "./-components/workflows-table.tsx";

export const Route = createFileRoute("/_app/workflows")({
  loader: ({ context }) => context.queryClient.ensureQueryData(workflowsQuery),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const { data: workflows } = useSuspenseQuery(workflowsQuery);
  return (
    <VStack gap={4}>
      <PageHeader
        title="Workflows"
        description={`${workflows.length} workflows`}
        actions={<Button label="Import" variant="primary" href="/workflows/import" />}
      />
      <WorkflowsTable workflows={workflows} />
      <Outlet />
    </VStack>
  );
}
