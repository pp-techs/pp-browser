import { createFileRoute } from "@tanstack/react-router";
import { proxiesQuery } from "../../../lib/queries.ts";
import { ProfileDialog } from "./-components/profile-dialog.tsx";

export const Route = createFileRoute("/_app/profiles/new")({
  loader: ({ context }) => context.queryClient.ensureQueryData(proxiesQuery),
  component: NewProfileDialog,
});

function NewProfileDialog() {
  const navigate = Route.useNavigate();
  return (
    <ProfileDialog
      profile={null}
      onClose={() => navigate({ to: "/profiles", search: (prev) => prev })}
    />
  );
}
