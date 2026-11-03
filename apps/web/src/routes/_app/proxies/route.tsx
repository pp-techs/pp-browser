import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "../../../components/page-header.tsx";
import { getApi } from "../../../lib/auth.ts";
import { errorText } from "../../../lib/format.ts";
import { proxiesQuery } from "../../../lib/queries.ts";
import { ProxiesTable } from "./-components/proxies-table.tsx";

export const Route = createFileRoute("/_app/proxies")({
  loader: ({ context }) => context.queryClient.ensureQueryData(proxiesQuery),
  component: ProxiesPage,
});

function ProxiesPage() {
  const { data: proxies } = useSuspenseQuery(proxiesQuery);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [checking, setChecking] = useState<ReadonlySet<string>>(new Set());

  const check = useMutation({
    mutationFn: async (ids: string[]) => {
      setChecking((prev) => new Set([...prev, ...ids]));
      const api = getApi();
      await Promise.allSettled(
        ids.map((id) =>
          api.checkProxy(id).finally(() =>
            setChecking((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            }),
          ),
        ),
      );
    },
    onError: (error) => toast({ type: "error", body: errorText(error) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["proxies"] }),
  });

  return (
    <VStack gap={4}>
      <PageHeader
        title="Proxies"
        description={`${proxies.length} proxies`}
        actions={
          <>
            <Button
              label="Check all"
              isDisabled={proxies.length === 0}
              onClick={() => check.mutate(proxies.map((p) => p.id))}
            />
            <Button label="Add proxies" variant="primary" href="/proxies/import" />
          </>
        }
      />
      <ProxiesTable proxies={proxies} checking={checking} onCheck={check.mutate} />
      <Outlet />
    </VStack>
  );
}
