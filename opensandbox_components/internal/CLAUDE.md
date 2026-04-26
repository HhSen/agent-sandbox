# internal — Shared Go Utilities

> Navigation: [Root](../../CLAUDE.md) | [Components](../CLAUDE.md)

## Purpose

Shared library module imported by `execd`, `egress`, and `ingress`. Contains no business logic — only generic infrastructure primitives.

## Directory Map

```
internal/
  logger/
    logger.go    Config struct, MustNew() — builds a named zap.Logger
    zap.go       Zap setup helpers (encoding, sampling)
  safego/
    safe.go      Go() — panic-recovering goroutine launcher; InitPanicLogger()
    safe_test.go
  telemetry/
    attrs.go     OTEL attribute helpers (resource attrs, extra attrs from env)
    attrs_test.go
    init.go      InitOTLP() — shared OTEL SDK bootstrap
  version/
    version.go   GitCommit / BuildDate vars (set at link time); EchoVersion()
```

## Usage

Each component imports this as a Go module dependency. No business logic lives here.

- **`logger`**: call `logger.MustNew(Config{Level: "info"})` to get a `*zap.Logger`; pass `Named("...")` for component-scoped loggers.
- **`safego`**: replace bare `go func()` with `safego.Go(func() {...})` everywhere; panics are recovered, logged, and do not crash the process. Call `safego.InitPanicLogger(ctx, logger)` at startup to wire the logger.
- **`telemetry`**: call `telemetry.Init(ctx)` (component-specific wrappers exist in each component) to start OTEL SDK and return a shutdown function.
- **`version`**: `version.EchoVersion("Component Name")` logs version info at startup.

## Working Notes

- This module has **no local imports** — it must remain a dependency leaf. Adding imports from `execd`, `egress`, or `ingress` here would create a cycle.
- `safego.Go` is not a general-purpose goroutine pool. It recovers panics only; it does not limit concurrency.

## Scan Snapshot

- Date: 2026-04-26
- Scope: all .go files in logger/, safego/, telemetry/, version/
