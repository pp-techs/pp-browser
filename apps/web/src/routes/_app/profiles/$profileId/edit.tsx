import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { profilesQuery, proxiesQuery } from "../../../../lib/queries.ts";
import { ProfileDialog } from "../-components/profile-dialog.tsx";

export const Route = createFileRoute("/_app/profiles/$profileId/edit")({
  loader: async ({ context, params }) => {
    const [profiles] = await Promise.all([
      context.queryClient.ensureQueryData(profilesQuery),
      context.queryClient.ensureQueryData(proxiesQuery),
    ]);
    if (!profiles.some((p) => p.id === params.profileId)) throw notFound();
  },
  component: EditProfileDialog,
});

function EditProfileDialog() {
  const { profileId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: profiles } = useSuspenseQuery(profilesQuery);
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return null;
  return (
    <ProfileDialog
      profile={profile}
      onClose={() => navigate({ to: "/profiles", search: (prev) => prev })}
    />
  );
}
