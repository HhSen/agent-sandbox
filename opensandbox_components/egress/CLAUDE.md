# egress — Outbound Network Policy Enforcer

> Navigation: [Root](../../CLAUDE.md) | [Components](../CLAUDE.md)

## Purpose

In-container daemon that controls outbound network traffic. It intercepts DNS queries to filter by domain, optionally enforces IP-level rules via nftables, and optionally runs mitmproxy for HTTPS inspection. opensandbox_server pushes policy changes to egress at runtime via a small HTTP API (`POST /policy`).

Does **not** own: inbound routing (that's `ingress`), container lifecycle (that's `opensandbox_server`), or code execution (that's `execd`).

## Entry Points

- `main.go` — load policy, start DNS proxy, install iptables redirect, set up nftables, start policy server, optionally start mitmproxy
- `policy_server.go` — HTTP server exposing `GET/POST/PATCH /policy` and `GET /healthz`
- `pkg/dnsproxy/proxy.go` — DNS proxy core; filters queries against the active policy
- `pkg/policy/policy.go` — NetworkPolicy type, parse, merge, default-deny helpers

## Directory Map

```
egress/
  main.go                  Startup: policy load → DNS proxy → iptables → nftables → policy server → mitmproxy
  policy_server.go         HTTP policy API (GET/POST/PUT/PATCH /policy, GET /healthz)
  policy_utils.go          Helpers: modeFromPolicy, patchMergedPolicy, allowIps
  shutdown.go              Graceful shutdown sequence
  mitmproxy_transparent.go Transparent mitmproxy launch helpers
  nft.go                   nftables manager factory + setup helpers
  nameserver.go            Nameserver IP detection + exempt list parsing
  hooks/doc.go             Startup hook registration (side-effect imports)
  pkg/
    constants/
      configuration.go     Env var names (EGRESS_MODE, EGRESS_TOKEN, EGRESS_HTTP_ADDR, …)
      constants.go         Default values (DefaultEgressServerAddr = 127.0.0.1:15555)
      mode.go              ParseEgressMode() — normalizes mode strings
    dnsproxy/
      proxy.go             DNS proxy: intercepts queries, checks policy, forwards or blocks
      proxy_linux.go       Linux-specific DNS listen setup
      upstream.go          Upstream DNS resolver with SO_MARK bypass
      exempt.go            ParseNameserverExemptList() — IPs that skip SO_MARK
    policy/
      policy.go            NetworkPolicy type, ParsePolicy, DefaultDenyPolicy, MergeAlwaysOverlay
      rules_loader.go      AlwaysRuleLoader — periodic reload from files
      always_rules.go      LoadAlwaysRuleFiles() — always-deny / always-allow rule loading
      persist.go           SavePolicyFile / LoadInitialPolicyDetailed
    nftables/
      manager.go           NftablesManager — ApplyStatic, AddResolvedIPs, RemoveEnforcement
      dynamic.go           Dynamic IP set updates (DNS-learned IPs)
      interval.go          IP interval/prefix helpers
    iptables/
      redirect.go          SetupRedirect — iptables rule: UDP 53 → 15353
      transparent.go       Transparent proxy iptables rules
    mitmproxy/
      launch.go            mitmproxy process launcher
      health_gate.go       HealthGate — signals when MITM stack is ready
      cacert_export.go     Export CA cert from mitmproxy
      stop.go              Graceful mitmproxy stop
      wait.go              Wait for mitmproxy readiness
    events/
      broadcaster.go       Fan-out broadcaster for blocked-hostname events
      webhook.go           WebhookSubscriber — POST blocked events to a URL
    startup/
      hook.go              RunPost() — executes registered post-startup hooks
    telemetry/
      init.go              OTEL init
      metrics.go           Egress-specific metrics (blocked count, etc.)
      hostmetrics_linux.go Linux /proc-based host metrics
      procstat_parse.go    /proc/stat parser
      meminfo_parse.go     /proc/meminfo parser
    log/logger.go          Logger singleton
```

## Policy API

The policy HTTP server listens on `OPENSANDBOX_EGRESS_HTTP_ADDR` (default `127.0.0.1:15555`). Auth via `OPENSANDBOX_EGRESS_TOKEN` header when token is configured.

| Method | Path | Description |
|---|---|---|
| GET | `/policy` | Get current policy + enforcement mode |
| POST / PUT | `/policy` | Replace policy (empty body = reset to deny-all) |
| PATCH | `/policy` | Merge new rules into existing policy |
| GET | `/healthz` | Health; 503 if mitmproxy is pending |

Policy shape (matches `opensandbox_server/api/schema.py` `NetworkPolicy`):
```json
{
  "defaultAction": "deny",
  "egress": [
    { "action": "allow", "target": "api.anthropic.com" },
    { "action": "deny",  "target": "*.evil.com" }
  ]
}
```

## Key Flows

### 1. Startup

1. Load initial policy from `OPENSANDBOX_EGRESS_POLICY_FILE` or `OPENSANDBOX_EGRESS_RULES` env
2. Load always-deny / always-allow rule files (merged over every future policy update)
3. Start DNS proxy on `127.0.0.1:15353`
4. Install iptables redirect: `OUTPUT UDP 53 → 15353` (with SO_MARK bypass for upstream traffic)
5. Build nftables manager (mode determines whether IP-level enforcement is active)
6. Start policy HTTP server
7. Optionally start mitmproxy transparent; mark stack ready via `HealthGate`
8. Run post-startup hooks (`startup.RunPost`)

### 2. DNS query filtering

1. Client process resolves a hostname → DNS query hits port 53 → iptables redirects to 15353
2. DNS proxy receives the query, checks `NetworkPolicy.Egress` rules in order
3. Allowed → forward to upstream resolver (with SO_MARK to bypass the redirect)
4. Denied → return NXDOMAIN; optionally publish to blocked broadcaster (webhook)
5. Resolved IPs for allowed domains are fed into `nftables.AddResolvedIPs` (in nftables mode)

### 3. Policy update (runtime)

1. `opensandbox_server` POSTs new policy to `POST /policy`
2. `policyServer.commitPolicy()`: persist to file (if `EGRESS_POLICY_FILE` set) → apply to nftables → update in-memory DNS proxy policy
3. `mu` serializes POST/PATCH to prevent lost updates
4. `alwaysLoader` overlays always-deny/allow rules on top of every committed policy

### 4. Always-rule reload

A background goroutine re-reads always-rule files every minute. If changed, re-merges with current policy and re-applies to nftables.

## Enforcement Modes

| Mode | DNS filtering | nftables | mitmproxy |
|---|---|---|---|
| `dns-only` (default) | yes | no | no |
| `nftables` | yes | yes (IP-level) | no |
| `transparent` | yes | yes | yes (HTTPS inspection) |

Mode is set via `OPENSANDBOX_EGRESS_MODE`. Invalid values fall back to `dns-only` with a warning.

## Interfaces and Dependencies

- **`internal/safego`** — all background goroutines; panics are recovered
- **`internal/logger`** — zap logger base; egress adds fixed fields (`sandbox_id`, extra attrs from `OPENSANDBOX_EGRESS_METRICS_EXTRA_ATTRS`)
- **`k8s.io/apimachinery/util/wait`** — used only for the always-rule reload ticker
- **mitmproxy** — external process (`mitmproxy` binary); egress manages its lifecycle, not its internals

## Tests

```bash
cd opensandbox_components/egress
go test ./...
go test ./pkg/policy/...     # policy parse + merge + always-rules
go test ./pkg/dnsproxy/...   # DNS proxy filtering logic
go test ./pkg/nftables/...   # nftables interval/manager tests
```

Tests that require a live network interface (iptables, real DNS) are build-tag gated or skipped outside Linux.

## Working Notes

- **Route registration order** in `policy_server.go`: `devops_router` and `pool_router` → `proxy_router`. Same discipline applies here: `healthz` is registered before any catch-all.
- **`mu` serializes writes.** GET reads are unlocked (stale-read risk is acceptable). POST and PATCH both acquire `mu` to prevent race between read-merge-apply.
- **SO_MARK bypass**: upstream DNS traffic is marked with `SO_MARK` so iptables does not redirect it back to port 15353. Nameservers in the exempt list skip this to support private DNS resolvers reachable only via default route.
- **`mitmproxy` is optional**: if the binary is absent or `EGRESS_MODE` ≠ `transparent`, the mitmproxy code paths are never reached. `HealthGate.MarkStackReady()` is called immediately in non-mitm modes so `/healthz` does not block.
- **Always-rules have higher priority** than user-supplied policy. `MergeAlwaysOverlay` prepends deny rules and appends allow rules, so they cannot be overridden by `POST /policy`.

## Scan Snapshot

- Date: 2026-04-26
- Scope: main.go, policy_server.go, policy_utils.go, shutdown.go, all pkg/ subdirectories
