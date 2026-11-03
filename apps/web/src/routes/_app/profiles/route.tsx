import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import * as z from "zod";
import { PageHeader } from "../../../components/page-header.tsx";
import { profilesQuery, statusQuery } from "../../../lib/queries.ts";
import { ProfilesTable } from "./-components/profiles-table.tsx";

const searchSchema = z.object({
  q: z.string().optional(),
  group: z.string().optional(),
});

export const Route = createFileRoute("/_app/profiles")({
  validateSearch: searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(profilesQuery),
  component: ProfilesPage,
});

function ProfilesPage() {
  const { q, group } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: profiles } = useSuspenseQuery(profilesQuery);
  const { data: status } = useSuspenseQuery(statusQuery);

  const groups = [...new Set(profiles.map((p) => p.group).filter((g): g is string => !!g))].sort();
  const needle = q?.trim().toLowerCase();
  const visible = profiles.filter(
    (p) =>
      (!group || p.group === group) &&
      (!needle ||
        [p.name, p.id, p.proxy?.name, p.runtime.ip].some((v) => v?.toLowerCase().includes(needle))),
  );
  const running = profiles.filter((p) => p.runtime.status === "running");
  const memoryMb = running.reduce((sum, p) => sum + (p.runtime.memoryMb ?? 0), 0);

  return (
    <VStack gap={4}>
      <PageHeader
        title="Profiles"
        description={`${profiles.length} profiles · ${running.length} running · ${memoryMb} MB`}
        actions={<Button label="New profile" variant="primary" href="/profiles/new" />}
      />
      <HStack gap={2} vAlign="end" wrap="wrap">
        <TextInput
          label="Search profiles"
          isLabelHidden
          type="search"
          startIcon="search"
          placeholder="Search name, proxy, IP…"
          hasClear
          width={280}
          value={q ?? ""}
          onChange={(value) => {
            void navigate({
              search: (prev) => ({ ...prev, q: value || undefined }),
              replace: true,
            });
          }}
        />
        <Selector
          label="Group"
          isLabelHidden
          width={200}
          placeholder="All groups"
          hasClear
          value={group ?? null}
          options={groups}
          onChange={(value) => {
            void navigate({
              search: (prev) => ({ ...prev, group: value || undefined }),
              replace: true,
            });
          }}
        />
      </HStack>
      <ProfilesTable
        profiles={visible}
        isFiltered={profiles.length > 0}
        macHost={status.hostPlatform === "darwin"}
      />
      <Outlet />
    </VStack>
  );
}
