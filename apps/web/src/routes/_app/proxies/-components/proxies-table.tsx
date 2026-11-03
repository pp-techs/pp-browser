import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Code } from "@astryxdesign/core/Code";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import type { Proxy } from "@ppb/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getApi } from "../../../../lib/auth.ts";
import { errorText, timeAgo } from "../../../../lib/format.ts";

type Row = Proxy;

interface ProxiesTableProps {
  proxies: Proxy[];
  /** Ids currently being checked; owned by the page so "Check all" and row buttons share it. */
  checking: ReadonlySet<string>;
  onCheck: (ids: string[]) => void;
}

export function ProxiesTable({ proxies, checking, onCheck }: ProxiesTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState<Proxy | null>(null);

  const remove = useMutation({
    mutationFn: (proxy: Proxy) => getApi().deleteProxy(proxy.id),
    onError: (error) => toast({ type: "error", body: errorText(error) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["proxies"] }),
  });

  const rows: Row[] = proxies;
  const columns: TableColumn<Row>[] = [
    {
      key: "name",
      header: "Name",
      width: proportional(1, { minWidth: 140 }),
      renderCell: (p) => (
        <VStack gap={0.5}>
          <Text weight="medium">{p.name}</Text>
          <Text type="supporting" size="sm">
            {p.id}
          </Text>
        </VStack>
      ),
    },
    {
      key: "url",
      header: "Endpoint",
      width: proportional(1.6, { minWidth: 220 }),
      renderCell: (p) => <Code>{p.url}</Code>,
    },
    { key: "profileCount", header: "Profiles", align: "end", width: pixel(88) },
    {
      key: "lastCheck",
      header: "Last check",
      width: proportional(1.6, { minWidth: 240 }),
      renderCell: (p) => {
        if (checking.has(p.id)) return <Badge variant="warning" label="checking…" />;
        const check = p.lastCheck;
        if (!check) return <Text type="supporting">never</Text>;
        if (!check.ok) {
          return (
            <VStack gap={0.5}>
              <Badge variant="error" label="failed" />
              <Text type="supporting" size="sm" maxLines={2}>
                {check.error}
              </Text>
            </VStack>
          );
        }
        return (
          <VStack gap={0.5}>
            <HStack gap={1.5} vAlign="center">
              <Badge variant="success" label="ok" />
              <Text size="sm">
                {check.ip} · {check.country} · {check.timezone} · {check.latencyMs} ms
              </Text>
            </HStack>
            <Text type="supporting" size="sm">
              {timeAgo(check.checkedAt)}
            </Text>
          </VStack>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: pixel(170),
      renderCell: (p) => (
        <HStack gap={1} hAlign="end" vAlign="center">
          <Button
            label="Check"
            size="sm"
            isDisabled={checking.has(p.id)}
            onClick={() => onCheck([p.id])}
          />
          <Button
            label="Delete"
            size="sm"
            variant="ghost"
            isDisabled={p.profileCount > 0}
            tooltip={p.profileCount > 0 ? "Detach it from its profiles first" : undefined}
            onClick={() => setDeleting(p)}
          />
        </HStack>
      ),
    },
  ];

  return (
    <>
      <Table
        data={rows}
        columns={columns}
        idKey="id"
        hasHover
        emptyState={
          <EmptyState
            isCompact
            title="No proxies yet"
            description="Profiles without a proxy use this machine's connection."
          />
        }
      />
      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete proxy ${deleting?.name}?`}
        description="Profiles can no longer be bound to it. Credentials stored for it are removed."
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
