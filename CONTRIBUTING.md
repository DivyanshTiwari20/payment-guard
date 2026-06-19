# Contributing to PaymentGuard

Thanks for your interest! PaymentGuard is a security-focused project, so the bar
for changes to the decision engine is deliberately high. This guide covers the
common contribution paths.

## Dev environment

Requires Node.js >= 20.

```bash
git clone https://github.com/DivyanshTiwari20/payment-guard.git
cd payment-guard
npm install

npm start          # run the MCP server over stdio
npm run dev        # run with auto-reload (tsx watch)
npm run typecheck  # tsc --noEmit (must pass — strict mode, no `any`)
npm test           # run the Vitest suite
npm run coverage   # run tests with engine coverage (thresholds enforced)
npm run build      # emit dist/
```

Runtime data lives in `data/` (gitignored, created on first run). Delete it to
reset to defaults. Set `PAYMENT_GUARD_DATA_DIR` to store it elsewhere (used by
the test suite to run against isolated temp directories).

## Project principles (please respect these)

- **The engine is pure.** Everything in `src/engine/` must be synchronous and
  side-effect free: no I/O, no network, no AI, no `Date.now()` baked in where a
  `now` parameter can be threaded through. Data in, decision out. This purity is
  the security guarantee.
- **Fail closed.** When in doubt, **block**. Unparseable, corrupt, or ambiguous
  input must never result in an `allowed` decision.
- **No `console.log` in server code.** stdout is reserved for the MCP protocol —
  use `console.error` for all logging.
- **Validate every tool input with zod.**
- **Strict TypeScript.** No `any`, proper null checks. `npm run typecheck` must
  pass.
- **Conventional commits** (`feat:`, `fix:`, `refactor:`, `docs:`).

## How to add a new rule to the engine

1. Implement the check as a pure function (or extend `evaluatePayment` /
   `evaluateMandate`) in `src/engine/`. Return a `Decision` with a clear,
   specific `reason`.
2. Order matters — place hard, cheap, fail-closed checks early.
3. Keep the rule deterministic and thread a `now: Date` parameter rather than
   reading the clock internally, so it stays testable.
4. **Add tests** under `test/engine/` covering the allow path, every block path,
   and the boundary (e.g. exactly-at-the-limit). Engine coverage thresholds are
   enforced in CI — `npm run coverage` must pass.
5. Make sure the rule is reflected in the relevant tool description so the agent
   understands the constraint.
6. Document the threat it addresses in `THREAT_MODEL.md` if applicable.

## How to add a new MCP tool

1. Create or extend a file under `src/mcp/tools/` (one file per tool group).
2. Define the input schema with zod and a clear `description` (the agent reads
   it).
3. Do orchestration/persistence in the tool or a service module — **not** in the
   pure engine.
4. Return via the `textResult(summary, data)` / `errorResult(message)` helpers
   so every response has a human-readable summary plus JSON.
5. Register the tool group in `src/mcp/server.ts`.
6. Wrap the handler body in try/catch and fail closed.

## Code style

- Self-documenting names; brief comments only on non-obvious logic.
- JSDoc on exported functions.
- Match the surrounding code's idiom and comment density.

## Submitting changes

1. Branch from `main`.
2. Ensure `npm run typecheck` and `npm test` pass (and `npm run coverage` for
   engine changes).
3. Open a PR describing the change and, for engine changes, the threat/behavior
   it affects.
