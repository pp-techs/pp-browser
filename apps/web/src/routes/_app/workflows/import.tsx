import { createFileRoute } from "@tanstack/react-router";
import { WorkflowImportDialog } from "./-components/workflow-import-dialog.tsx";

export const Route = createFileRoute("/_app/workflows/import")({
  component: ImportWorkflowDialog,
});

function ImportWorkflowDialog() {
  const navigate = Route.useNavigate();
  return <WorkflowImportDialog onClose={() => navigate({ to: "/workflows" })} />;
}
