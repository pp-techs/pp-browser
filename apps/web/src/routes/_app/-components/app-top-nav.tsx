import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { TopNav } from "@astryxdesign/core/TopNav";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { clearToken, isDesktopApp } from "../../../lib/auth.ts";
import { statusQuery } from "../../../lib/queries.ts";

export function AppTopNav() {
  const { data: status } = useSuspenseQuery(statusQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const signOut = () => {
    clearToken();
    queryClient.clear();
    void navigate({ to: "/login", replace: true });
  };

  return (
    <TopNav
      label="Toolbar"
      endContent={
        <HStack gap={3} vAlign="center">
          {!status.camoufox.installed && (
            <Badge variant="warning" label="Camoufox downloads on first launch" />
          )}
          <Badge
            variant={status.running > 0 ? "success" : "neutral"}
            label={`${status.running}/${status.maxRunning} running`}
          />
          {!isDesktopApp() && (
            <Button label="Sign out" variant="ghost" size="sm" onClick={signOut} />
          )}
        </HStack>
      }
    />
  );
}
