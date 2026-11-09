---
"@ppb/desktop": patch
---

Adding several proxies that share a gateway host:port but differ in credentials (rotating pools, per-session or per-country logins) no longer fails with "name is already taken": each line now gets the next free default name (`host-port`, `host-port-2`, …) when importing or adding without a name.
