import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TopNav } from "@astryxdesign/core/TopNav";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { clearToken, isDesktopApp } from "../../../lib/auth.ts";
import { setColorMode, useColorMode, type ColorMode } from "../../../lib/color-mode.ts";
import { statusQuery } from "../../../lib/queries.ts";

const MODES: ColorMode[] = ["system", "light", "dark"];
const MODE_LABELS: Record<ColorMode, string> = { system: "Auto", light: "Light", dark: "Dark" };

export function AppTopNav() {
  const { data: status } = useSuspenseQuery(statusQuery);
  const mode = useColorMode();
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
          <SegmentedControl
            label="Color mode"
            size="sm"
            value={mode}
            onChange={(next) => setColorMode(MODES.find((m) => m === next) ?? "system")}
          >
            {MODES.map((m) => (
              <SegmentedControlItem key={m} value={m} label={MODE_LABELS[m]} />
            ))}
          </SegmentedControl>
          {!isDesktopApp() && (
            <Button label="Sign out" variant="ghost" size="sm" onClick={signOut} />
          )}
        </HStack>
      }
    />
  );
}
