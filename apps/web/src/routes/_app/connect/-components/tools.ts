export type ToolDoc = {
  name: string;
  purpose: string;
};

/** Mirrors the tools registered in `packages/mcp`; grouped where they share a purpose. */
export const TOOLS: ToolDoc[] = [
  { name: "list_profiles / get_profile", purpose: "Inventory, status, proxy and exit IP" },
  { name: "create_profile", purpose: "New profile with a persistent fingerprint" },
  { name: "start_profile / stop_profile", purpose: "Launch or close a profile's browser" },
  { name: "list_proxies / check_proxy", purpose: "Proxy inventory and health" },
  { name: "list_pages / new_page / close_page", purpose: "Tabs of a running profile" },
  {
    name: "navigate / click / type / press / wait_for",
    purpose: "Page actions; each returns a fresh snapshot",
  },
  { name: "snapshot", purpose: "Accessibility tree with [ref=eN] element refs" },
  { name: "screenshot / evaluate", purpose: "PNG capture, JavaScript evaluation" },
];
