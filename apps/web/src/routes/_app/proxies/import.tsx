import { createFileRoute } from "@tanstack/react-router";
import { ProxyImportDialog } from "./-components/proxy-import-dialog.tsx";

export const Route = createFileRoute("/_app/proxies/import")({
  component: ImportProxiesDialog,
});

function ImportProxiesDialog() {
  const navigate = Route.useNavigate();
  return <ProxyImportDialog onClose={() => navigate({ to: "/proxies" })} />;
}
