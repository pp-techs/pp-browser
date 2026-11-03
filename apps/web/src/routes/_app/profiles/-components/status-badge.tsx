import { Badge } from "@astryxdesign/core/Badge";
import type { ProfileStatus } from "@ppb/shared";

type BadgeVariant = "success" | "warning" | "error" | "neutral";

const VARIANTS: Record<ProfileStatus, BadgeVariant> = {
  running: "success",
  starting: "warning",
  stopping: "warning",
  stopped: "neutral",
  error: "error",
};

export function StatusBadge({ status }: { status: ProfileStatus }) {
  return <Badge variant={VARIANTS[status]} label={status} />;
}
