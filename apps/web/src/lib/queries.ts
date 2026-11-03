import { queryOptions } from "@tanstack/react-query";
import { getApi } from "./auth.ts";

export const statusQuery = queryOptions({
  queryKey: ["status"],
  queryFn: () => getApi().status(),
  refetchInterval: 5000,
});

export const profilesQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: () => getApi().listProfiles(),
  refetchInterval: 3000,
});

export const proxiesQuery = queryOptions({
  queryKey: ["proxies"],
  queryFn: () => getApi().listProxies(),
});
