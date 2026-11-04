import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { workflowQuery } from "../../../../lib/queries.ts";
import { WorkflowViewDialog } from "../-components/workflow-view-dialog.tsx";

export const Route = createFileRoute("/_app/workflows/$workflowId/view")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(workflowQuery(params.workflowId)),
  component: ViewWorkflowDialog,
});

function ViewWorkflowDialog() {
  const { workflowId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: workflow } = useSuspenseQuery(workflowQuery(workflowId));
  return <WorkflowViewDialog workflow={workflow} onClose={() => navigate({ to: "/workflows" })} />;
}
