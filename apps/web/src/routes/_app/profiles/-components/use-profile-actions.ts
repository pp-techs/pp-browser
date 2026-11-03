import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getApi } from "../../../../lib/auth.ts";
import { errorText } from "../../../../lib/format.ts";

export type ProfileActionKind = "open" | "headless" | "stop" | "delete";

export interface ProfileActionInput {
  kind: ProfileActionKind;
  ids: string[];
}

/** Runs one action over one or more profiles; every id is attempted and the first failure is reported. */
export function useProfileActions() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ kind, ids }: ProfileActionInput) => {
      const api = getApi();
      const run = (id: string) => {
        if (kind === "stop") return api.stopProfile(id);
        if (kind === "delete") return api.deleteProfile(id);
        return api.startProfile(id, { headless: kind === "headless" });
      };
      const results = await Promise.allSettled(ids.map(run));
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) throw failed.reason;
    },
    onError: (error) => {
      toast({ type: "error", body: errorText(error) });
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["status"] }),
      ]),
  });
}
