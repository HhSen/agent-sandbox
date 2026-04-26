# opensandbox_components — Go Binaries

> Navigation: [Root](../CLAUDE.md)

## Purpose

Four Go modules that run inside or alongside sandbox containers. Each is a standalone binary with its own `go.mod`. The `internal/` module is a shared library — not a binary.

## Module Map

```
opensandbox_components/
  execd/      In-container HTTP daemon: shell execution, PTY, Jupyter, filesystem ops
  egress/     In-container outbound network policy enforcer + DNS proxy
  ingress/    Sidecar HTTP reverse proxy for routing inbound traffic into containers (K8s)
  internal/   Shared utilities: logger, safego, telemetry attrs, version
```

## Build

Each component has a `build.sh` at its root:

```bash
cd opensandbox_components/execd   && ./build.sh
cd opensandbox_components/egress  && ./build.sh
cd opensandbox_components/ingress && ./build.sh
```

`internal/` is not a binary — it is imported as a module by the others.

## Dependency Direction

```
execd   → internal
egress  → internal
ingress → internal
```

No component imports from another component. `internal/` has no local imports.

## Deployment

- **execd** runs _inside_ every sandbox container, started by `bootstrap.sh`.
- **egress** runs _inside_ every sandbox container when network policy enforcement is needed.
- **ingress** runs _outside_ containers as a Kubernetes sidecar or gateway proxy.
- **internal** is compile-time only — no runtime artifact.

## Local Guides

- [`execd/CLAUDE.md`](execd/CLAUDE.md) — in-container execution daemon: routes, runtime, Jupyter, PTY
- [`egress/CLAUDE.md`](egress/CLAUDE.md) — outbound network control: DNS proxy, nftables, policy API
- [`ingress/CLAUDE.md`](ingress/CLAUDE.md) — inbound HTTP proxy, sandbox provider, renew-intent
- [`internal/CLAUDE.md`](internal/CLAUDE.md) — shared utilities (logger, safego, telemetry, version)

## Scan Snapshot

- Date: 2026-04-26
- Scope: all four module roots, main.go files, build.sh scripts
