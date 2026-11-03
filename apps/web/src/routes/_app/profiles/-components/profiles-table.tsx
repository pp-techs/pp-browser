import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import {
  pixel,
  proportional,
  Table,
  TableSelectionToolbar,
  useTableSelection,
  useTableSelectionState,
  type TableColumn,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { VStack } from "@astryxdesign/core/VStack";
import type { Profile } from "@ppb/shared";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { timeAgo } from "../../../../lib/format.ts";
import { StatusBadge } from "./status-badge.tsx";
import { useProfileActions } from "./use-profile-actions.ts";

type Row = Profile;

interface ProfilesTableProps {
  profiles: Profile[];
  isFiltered: boolean;
  /** The daemon runs on macOS, where non-macOS fingerprints only render correctly headless. */
  macHost: boolean;
}

export function ProfilesTable({ profiles, isFiltered, macHost }: ProfilesTableProps) {
  const navigate = useNavigate();
  const actions = useProfileActions();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Profile[] | null>(null);

  const rows: Row[] = profiles;
  const { selectionConfig, selectionState } = useTableSelectionState<Row>({
    data: rows,
    idKey: "id",
    selectedKeys,
    setSelectedKeys,
  });
  const selection = useTableSelection<Row>({ ...selectionConfig, getRowLabel: (row) => row.name });

  const selected = profiles.filter((p) => selectedKeys.has(p.id));
  const isBusy = (p: Profile) =>
    p.runtime.status === "starting" ||
    p.runtime.status === "stopping" ||
    (actions.isPending && !!actions.variables?.ids.includes(p.id));

  const columns: TableColumn<Row>[] = [
    {
      key: "name",
      header: "Name",
      width: proportional(1.2, { minWidth: 120 }),
      renderCell: (p) => (
        <VStack gap={0.5} style={{ minWidth: 0 }}>
          <Text weight="medium" maxLines={1}>
            {p.name}
          </Text>
          <HStack gap={1.5} vAlign="center">
            <Tooltip content={`Last opened ${timeAgo(p.lastOpenedAt)}`}>
              <Text type="supporting" size="sm">
                {p.id}
              </Text>
            </Tooltip>
            {p.group && <Badge variant="blue" label={p.group} />}
          </HStack>
        </VStack>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: proportional(1, { minWidth: 90 }),
      renderCell: (p) => (
        <VStack gap={0.5}>
          <HStack gap={1} vAlign="center">
            <StatusBadge status={p.runtime.status} />
            {p.runtime.status === "running" && p.runtime.headless && (
              <Badge variant="neutral" label="headless" />
            )}
          </HStack>
          {p.runtime.lastError ? (
            <Text type="supporting" size="sm" color="accent" maxLines={2}>
              {p.runtime.lastError}
            </Text>
          ) : (
            <Text type="supporting" size="sm">
              {p.runtime.status === "running" ? `${p.runtime.pageCount} pages` : "–"} ·{" "}
              {p.runtime.memoryMb === null ? "–" : `${p.runtime.memoryMb} MB`}
            </Text>
          )}
        </VStack>
      ),
    },
    {
      key: "proxy",
      header: "Proxy / Identity",
      width: proportional(1.3, { minWidth: 130 }),
      renderCell: (p) => (
        <VStack gap={0.5} style={{ minWidth: 0 }}>
          <HStack gap={1.5} vAlign="center" style={{ minWidth: 0 }}>
            <Text maxLines={1} style={{ minWidth: 0 }}>
              {p.proxy?.name ?? "direct"}
            </Text>
            {macHost && p.identity.os !== "macos" && (
              <Badge variant="warning" label="headless only" />
            )}
          </HStack>
          <Tooltip
            content={`${p.identity.screen.width}×${p.identity.screen.height} · ${p.identity.webgl.renderer}`}
          >
            <Text type="supporting" size="sm" maxLines={1}>
              {p.runtime.ip ?? "–"} · {p.identity.os}
            </Text>
          </Tooltip>
        </VStack>
      ),
    },

    {
      key: "actions",
      header: "",
      align: "end",
      width: pixel(220),
      renderCell: (p) => {
        const canDelete = p.runtime.status === "stopped" || p.runtime.status === "error";
        return (
          <HStack gap={1} hAlign="end" vAlign="center">
            {p.runtime.status === "running" ? (
              <Button
                label="Stop"
                size="sm"
                isDisabled={isBusy(p)}
                onClick={() => actions.mutate({ kind: "stop", ids: [p.id] })}
              />
            ) : (
              <>
                <Button
                  label="Open"
                  size="sm"
                  variant="primary"
                  isLoading={isBusy(p)}
                  onClick={() => actions.mutate({ kind: "open", ids: [p.id] })}
                />
                <Button
                  label="Headless"
                  size="sm"
                  tooltip="Start without a window (for agents)"
                  isDisabled={isBusy(p)}
                  onClick={() => actions.mutate({ kind: "headless", ids: [p.id] })}
                />
              </>
            )}
            <MoreMenu
              label={`More actions for ${p.name}`}
              alignment="end"
              items={[
                {
                  label: "Edit",
                  onClick: () =>
                    navigate({
                      to: "/profiles/$profileId/edit",
                      params: { profileId: p.id },
                      search: (prev) => prev,
                    }),
                },
                { type: "divider" },
                {
                  label: "Delete",
                  variant: "destructive",
                  isDisabled: !canDelete,
                  onClick: () => setDeleting([p]),
                },
              ]}
            />
          </HStack>
        );
      },
    },
  ];

  return (
    <>
      <TableSelectionToolbar
        selection={selectionState}
        startContent={
          <>
            <Button
              label="Open"
              variant="ghost"
              onClick={() => actions.mutate({ kind: "open", ids: selected.map((p) => p.id) })}
            />
            <Button
              label="Stop"
              variant="ghost"
              onClick={() => actions.mutate({ kind: "stop", ids: selected.map((p) => p.id) })}
            />
            <Button label="Delete" variant="ghost" onClick={() => setDeleting(selected)} />
          </>
        }
      />
      <Table
        data={rows}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{ selection }}
        emptyState={
          <EmptyState
            isCompact
            title={isFiltered ? "No profiles match the filter" : "No profiles yet"}
            description={
              isFiltered ? undefined : "Create a profile to get a persistent fingerprint and proxy."
            }
          />
        }
      />
      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={
          deleting?.length === 1
            ? `Delete ${deleting[0]?.name}?`
            : `Delete ${deleting?.length ?? 0} profiles?`
        }
        description="Their cookies, logins and browser data are removed. This cannot be undone."
        actionLabel="Delete"
        isActionLoading={actions.isPending && actions.variables?.kind === "delete"}
        onAction={async () => {
          if (!deleting) return;
          await actions
            .mutateAsync({ kind: "delete", ids: deleting.map((p) => p.id) })
            .catch(() => undefined);
          setSelectedKeys(new Set());
          setDeleting(null);
        }}
      />
    </>
  );
}
