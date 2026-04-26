# ingress — Inbound HTTP Reverse Proxy

> Navigation: [Root](../../CLAUDE.md) | [Components](../CLAUDE.md)

## Purpose

Kubernetes-focused sidecar HTTP proxy that routes inbound HTTP and WebSocket requests to the correct sandbox pod. It resolves the target pod endpoint using a Kubernetes informer-backed provider, then reverse-proxies the request. Optionally publishes "renew intent" signals to Redis when a request arrives (so the control plane can extend the sandbox TTL).

Does **not** own: outbound policy (that's `egress`), in-container execution (that's `execd`), or container lifecycle (that's `opensandbox_server`). Designed for Kubernetes deployments only — not used in Docker mode.

## Entry Points

- `main.go` — parse flags, create sandbox provider, start HTTP server on `:<PORT>`
- `pkg/proxy/proxy.go` — `NewProxy()` builds the reverse proxy handler
- `pkg/proxy/http.go` — HTTP request routing and forwarding
- `pkg/proxy/websocket.go` — WebSocket upgrade and bidirectional tunneling
- `pkg/sandbox/factory.go` — `NewProviderFactory` + `CreateProvider()` for agent/batch sandbox types

## Directory Map

```
ingress/
  main.go
  pkg/
    flag/
      flags.go         CLI flags (port, log level, provider type, renew-intent config, mode)
      parser.go        Flag parsing helpers
    proxy/
      proxy.go         Proxy struct, NewProxy(), main ServeHTTP dispatch
      http.go          HTTP reverse proxy logic (header forwarding, response copy)
      websocket.go     WebSocket upgrade, bidirectional tunnel
      header.go        Header manipulation (X-Forwarded-*, hop-by-hop stripping)
      host.go          Host header rewriting
      logger.go        Per-request logger helpers
      healthz.go       GET /status.ok handler
    sandbox/
      provider.go      SandboxProvider interface
      factory.go       NewProviderFactory + CreateProvider(ProviderType)
      agent_sandbox_provider.go   K8s informer-backed provider for agent sandboxes
      batchsandbox_provider.go    K8s informer-backed provider for batch sandboxes
    renewintent/
      publisher.go     Publisher interface
      redis.go         RedisPublisher — publishes renew-intent to Redis stream
      intent.go        Intent message type
      redis_bench_test.go
```

## Key Flows

### 1. Startup

1. `flag.InitFlags()` — parse CLI flags
2. `injection.ParseAndGetRESTConfigOrDie()` — load kubeconfig (in-cluster or `$KUBECONFIG`)
3. `providerFactory.CreateProvider(ProviderType)` — instantiate agent or batch sandbox informer
4. `sandboxProvider.Start(ctx)` — sync K8s informer cache
5. If `RenewIntentEnabled`: connect to Redis, create `RedisPublisher`
6. `proxy.NewProxy(ctx, provider, mode, publisher)` — build reverse proxy handler
7. `http.ListenAndServe` on `:<PORT>`

### 2. Inbound HTTP request

1. `ServeHTTP` receives request
2. Provider resolves sandbox pod endpoint from request context (routing key from host or header)
3. Headers sanitized (hop-by-hop stripped, `X-Forwarded-*` set)
4. If WebSocket upgrade detected: `websocket.go` handles bidirectional tunnel
5. Otherwise: HTTP reverse proxy copies request to pod, streams response back
6. If renew publisher configured: publishes intent to Redis after successful routing

### 3. Sandbox endpoint resolution

- **agent_sandbox_provider**: uses K8s informers watching pods by label; returns pod IP + port
- **batchsandbox_provider**: similar but for batch-style workloads with different labeling strategy
- Both implement `SandboxProvider.GetEndpoint(ctx, key) (string, error)`

## Interfaces and Dependencies

- **`internal/logger`** — zap logger; `proxy.WithLogger(ctx, logger)` stores it in context
- **`internal/version`** — user-agent string for K8s REST client
- **`knative.dev/pkg/injection`** — `ParseAndGetRESTConfigOrDie()` for kubeconfig loading
- **`knative.dev/pkg/signals`** — graceful shutdown via OS signal context
- **Redis** (optional) — `renewintent.RedisPublisher` requires a Redis DSN; disabled if `RenewIntentEnabled` is false

## Proxy Modes

Set via `--mode` flag. Modes control how the target endpoint is resolved from the incoming request (e.g., from Host header vs. a custom header). See `pkg/proxy/proxy.go` for the `Mode` type and dispatch logic.

## Tests

```bash
cd opensandbox_components/ingress
go test ./...
go test ./pkg/proxy/...       # HTTP + WebSocket proxy tests
go test ./pkg/sandbox/...     # Provider unit tests
go test ./pkg/renewintent/... # Redis publisher tests + benchmarks
```

Tests use mock providers — no live K8s cluster needed.

## Working Notes

- **K8s only.** Ingress uses `knative.dev/pkg/injection` and informers. It will not compile meaningfully for Docker-mode deployments. Do not add Docker-mode code paths here.
- **Informer cache sync is blocking** (`sandboxProvider.Start(ctx)` waits for cache). The proxy will not serve traffic until the informer is synced; ensure the K8s API server is reachable at startup.
- **WebSocket**: `websocket.go` handles the `Connection: Upgrade` case before the HTTP proxy runs. Do not add logic that inspects the body before the WebSocket check — the handshake must complete before any body is consumed.
- **Renew intent is best-effort.** Publish failures are logged but do not fail the proxied request. The sandbox will eventually expire if the renew signal is not delivered.

## Scan Snapshot

- Date: 2026-04-26
- Scope: main.go, pkg/proxy (all files), pkg/sandbox (all files), pkg/renewintent (all files), pkg/flag/flags.go
