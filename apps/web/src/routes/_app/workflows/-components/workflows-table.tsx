import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import type { WorkflowSummary } from "@ppb/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { getApi } from "../../../../lib/auth.ts";
import { errorText, timeAgo } from "../../../../lib/format.ts";

export function WorkflowsTable({ workflows }: { workflows: WorkflowSummary[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState<WorkflowSummary | null>(null);

  const remove = useMutation({
    mutationFn: (workflow: WorkflowSummary) => getApi().deleteWorkflow(workflow.id),
    onError: (error) => toast({ type: "error", body: errorText(error) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const columns: TableColumn<WorkflowSummary>[] = [
    {
      key: "name",
      header: "Name",
      width: proportional(1.4, { minWidth: 180 }),
      renderCell: (w) => (
        <VStack gap={0.5} style={{ minWidth: 0 }}>
          <Text weight="medium" maxLines={1}>
            {w.name}
          </Text>
          <Text type="supporting" size="sm" maxLines={1}>
            {w.description ?? w.id}
          </Text>
        </VStack>
      ),
    },
    { key: "version", header: "Version", align: "end", width: pixel(84) },
    { key: "stepCount", header: "Steps", align: "end", width: pixel(72) },
    {
      key: "params",
      header: "Parameters",
      width: proportional(1.2, { minWidth: 160 }),
      renderCell: (w) => {
        const entries = Object.entries(w.params);
        if (entries.length === 0) return <Text type="supporting">none</Text>;
        return (
          <HStack gap={1} wrap="wrap">
            {entries.map(([name, param]) => (
              <Badge
                key={name}
                variant={param.type === "secret" ? "warning" : "neutral"}
                label={`${name}${param.required ? "*" : ""}`}
              />
            ))}
          </HStack>
        );
      },
    },
    {
      key: "updatedAt",
      header: "Updated",
      width: pixel(120),
      renderCell: (w) => <Text type="supporting">{timeAgo(w.updatedAt)}</Text>,
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: pixel(140),
      renderCell: (w) => (
        <HStack gap={1} hAlign="end" vAlign="center">
          <Button label="Run" size="sm" href={`/workflows/${encodeURIComponent(w.id)}/run`} />
          <MoreMenu
            label={`More actions for ${w.name}`}
            alignment="end"
            items={[
              {
                label: "View steps",
                onClick: () =>
                  navigate({ to: "/workflows/$workflowId/view", params: { workflowId: w.id } }),
              },
              { type: "divider" },
              { label: "Delete", variant: "destructive", onClick: () => setDeleting(w) },
            ]}
          />
        </HStack>
      ),
    },
  ];

  return (
    <>
      <Table
        data={workflows}
        columns={columns}
        idKey="id"
        hasHover
        emptyState={
          <EmptyState
            isCompact
            title="No workflows yet"
            description="Agents save them with save_workflow or by recording a session. You can also import a JSON file."
          />
        }
      />
      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete workflow ${deleting?.name}?`}
        description="All saved versions are removed. This cannot be undone."
        actionLabel="Delete"
        isActionLoading={remove.isPending}
        onAction={async () => {
          if (deleting) await remove.mutateAsync(deleting).catch(() => undefined);
          setDeleting(null);
        }}
      />
    </>
  );
}
