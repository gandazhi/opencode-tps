# opencode-tps

A [opencode](https://opencode.ai) / [MiMo-Code](https://github.com/mimo-ai) **TUI plugin** that shows the model's token generation speed (**t/s**) at the bottom of the sidebar.

```text
┌─ Context ─────────────────────┐
│ ...                           │
│ 12.3 t/s   4.2k / 128k  $0.01 │   ← internal:sidebar-context (built-in)
└───────────────────────────────┘
  Speed  45.6 t/s                   ← this plugin
```

- **Streaming**: refreshes every 1 s while the assistant is replying.
- **Completed**: uses the real `tokens.output + tokens.reasoning` of the last finished message.
- **Pure**: the TPS math is a dependency-free module, fully unit-tested.

> This package is loaded by the opencode host. It is **not** a standalone app and cannot be run directly.

## Install

This is a **TUI plugin**, so it goes in the TUI config — **not** `opencode.json` (that array is for *server* plugins; a TUI plugin placed there is silently ignored).

Add it to **`~/.config/opencode/tui.json`**:

```json
{ "plugin": ["file:///absolute/path/to/opencode-tps"] }
```

The path points at the **package root** (this directory), not `src/index.tsx`. The loader reads `package.json` → `exports["./tui"]` → entry. Then **restart opencode** (config is only loaded at startup).

Confirm it's enabled with `/plugins` — look for `gandazhi:tps`.

## Why no build step

`exports["./tui"]` points at **source** (`./src/index.tsx`) on purpose. opencode runs on Bun and `import`s `@opentui/solid/runtime-plugin-support` before loading any TUI plugin, which transforms SolidJS JSX into Solid runtime calls at load time. Pre-compiling with `bun build` would apply the default React-style JSX transform and silently break reactivity. `files: ["src"]` ships the `.tsx` directly — same approach as upstream `@mimo-ai/plugin`.

## How it renders (read before filing "it doesn't show up")

The plugin registers the **`sidebar_content`** slot at `order: 9999`, **not** `sidebar_footer`. This is intentional, not a typo:

- `sidebar_footer` is `mode="single_winner"` and is owned by the internal `internal:sidebar-footer` plugin (path / version). An external plugin registering `sidebar_footer` will **never** win and renders nothing.
- Undercutting its `order` would **replace** the whole internal footer (path/version/branding disappear) — unacceptable.
- `sidebar_content` is `append` mode (every plugin renders). `@opentui/core` sorts by ascending `order`, so `9999` places this plugin at the very **bottom** of the content stack — the closest achievable position to "sidebar bottom".

**Side effect:** the internal `internal:sidebar-context` plugin already renders a t/s line inside the Context box, so with this plugin on you'll see t/s **twice** (Context box + bottom row). That's a consequence of the `single_winner` constraint, not a bug. To dedupe, `/plugins` → deactivate `internal:sidebar-context` (note: that also removes token totals / percentage / cost).

## Develop

```bash
bun test           # unit tests for src/tps.ts + slot-contract for src/index.tsx
bun run typecheck  # tsc --noEmit — the only "build" check
```

There is **no lint step and no build step**.

### `@mimo-ai/sdk` typecheck workaround

`@mimo-ai/sdk@0.1.1` shipped broken (`files: ["dist"]` is declared but `dist/` was never published). `tsconfig.json` `paths` redirects `@mimo-ai/sdk/v2` → a local checkout of `MiMo-Code`:

- `MiMo-Code` must exist as a sibling directory for `bun run typecheck` to pass.
- It's `import type` only — erased at runtime, zero impact on the published plugin.
- Delete the mapping once `@mimo-ai/sdk` publishes a usable build.

## Architecture

| File | Role |
| --- | --- |
| `src/tps.ts` | Pure functions (`streamingTPS`, `completedTPS`, `formatTPS`). Zero Solid deps, fully unit-tested. Token estimate hardcoded to `4 chars ≈ 1 token`. All null-bounds here. |
| `src/index.tsx` | UI layer. Registers `sidebar_content` (order 9999). Streaming TPS via `createEffect`/`onCleanup` + `setInterval` (1 s); completed TPS from real token counts. |
| `test/tps.test.ts` | Mirrors the host's internal `sidebar-tps.test.ts`. |
| `test/slot-contract.test.ts` | Guards the slot contract: default export is `{ id, tui }`, and `tui()` registers `sidebar_content` (order 9999) — **not** `sidebar_footer`. Prevents regressions to the original bug. |
| `specs/` | Design + plan docs (Chinese). Historical; **code is the source of truth**, not these. |

## Entry contract

The host loader reads `package.json` → `exports["./tui"]`, then `import()`s that path. The default export **must** be `TuiPluginModule & { id: string }`. If the plugin appears in `/plugins` but doesn't render, first verify `gandazhi:tps` is enabled.
