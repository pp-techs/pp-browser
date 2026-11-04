import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { profilesQuery, workflowQuery } from "../../../../lib/queries.ts";
import { WorkflowRunDialog } from "../-components/workflow-run-dialog.tsx";

export const Route = createFileRoute("/_app/workflows/$workflowId/run")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(workflowQuery(params.workflowId)),
      context.queryClient.ensureQueryData(profilesQuery),
    ]),
  component: RunWorkflowDialog,
});

function RunWorkflowDialog() {
  const { workflowId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: workflow } = useSuspenseQuery(workflowQuery(workflowId));
  return <WorkflowRunDialog workflow={workflow} onClose={() => navigate({ to: "/workflows" })} />;
}
