# AGENTS.md

本仓库是 `@gandazhi/opencode-tps` —— 一个**面向 opencode / MiMo-Code 的 TUI 插件**，在侧边栏底部显示 token 生成速度（t/s）。它由 opencode 宿主加载，不能独立运行。完整设计/计划见 `specs/`。

## 命令

```bash
bun test           # 单元测试：src/tps.ts（12 个，照搬宿主 sidebar-tps.test.ts）+ src/index.tsx 契约（2 个，守 sidebar_content 回归）
bun run typecheck  # tsc --noEmit；这是唯一的"构建"检查
```

**没有 lint 步骤，也没有 build 步骤**。完成任何改动后用 `bun test && bun run typecheck` 验证，通过才能算完成。

## 安装到 opencode（别放错配置文件）

TUI 插件配置在 **`~/.config/opencode/tui.json` 的 `plugin` 数组**，不是 `opencode.json`：

```json
{ "plugin": ["file:///Users/gandazhi/code/agent/opencode-tps"] }
```

- `opencode.json` 的 `plugin` 数组是给 **server 插件**用的；写在那里本插件**根本不会被 import**（宿主只把它当 server 插件去找入口，找不到就静默跳过）。这是本插件"在 `/plugins` 里出现但不渲染"的最初根因。
- spec 指向**包根目录**（不是 `src/index.tsx`）；loader 读包的 `package.json` → `exports["./tui"]` → 入口。
- 改配置后**重启 opencode**（配置只在启动时加载一次）。

## 无构建步骤 —— 故意为之

`package.json` 的 `exports["./tui"]` 指向**源码** `./src/index.tsx`，不是 `dist/`。这是刻意设计：opencode 宿主跑在 Bun 上，在加载任何 TUI 插件前会先 `import "@opentui/solid/runtime-plugin-support"`，由它在加载期把 SolidJS JSX 转换成 Solid 运行时调用。如果用 `bun build` 预编译，Bun 打包器会走默认的 React 风格 JSX 转换，静默破坏 Solid 响应式。**不要加构建步骤。** `files: ["src"]` 直接发布 `.tsx`，与上游 `@mimo-ai/plugin` 包一致。

## `@mimo-ai/sdk` 的 paths 变通方案（仅影响 typecheck）

`@mimo-ai/sdk@0.1.1` 是**损坏的发布**：其 `package.json` 声明 `"files": ["dist"]`、`exports["./v2"]` → `./dist/v2/index.d.ts`，但实际没发布 `dist/`。直接 import 会让 typecheck 报 TS2307。

`tsconfig.json` 里的 `paths` 把 `@mimo-ai/sdk/v2` 重定向到 `../MiMo-Code/packages/sdk/js/src/v2/gen/types.gen.ts`。agent 必须知道的几点：

- **`MiMo-Code` 必须作为同级目录存在**（`/Users/gandazhi/code/agent/MiMo-Code`），否则 `bun run typecheck` 不通过。它不属于本仓库。
- 这是 `import type` —— **运行期擦除**，对发布的插件零影响。
- **等 `@mimo-ai/sdk` 发布可用构建后，删掉这个 `paths` 映射。** 不要"修复"它——删了只会让 typecheck 报错。

`@mimo-ai/plugin@0.1.1` 和 `@opentui/solid@0.4.1` 都正常，只有 `@mimo-ai/sdk` 是坏的。

## 依赖角色

- `solid-js`、`@opentui/solid`、`@opentui/core` → `peerDependencies`，**由 opencode 宿主在运行期提供**。永远不要 bundle 或 vendor。
- `@mimo-ai/plugin`、`@mimo-ai/sdk` → `devDependencies`，**仅用于类型**（`import type`，擦除）。存在只是为了 typecheck 能解析。

## 架构

- `src/tps.ts` —— 纯函数（`streamingTPS`、`completedTPS`、`formatTPS`），零 Solid 依赖，完全单测覆盖。token 估算硬编码 `4 chars ≈ 1 token`（够不到宿主的 `@/util/token`）。所有 null 兜底都在这里（空输入、elapsed 低于阈值、零时长）。
- `src/index.tsx` —— UI 层。通过 `api.slots.register` 注册 `sidebar_footer` slot；default export 是 `TuiPluginModule`（`{ id, tui }`）。**不写单测**（Solid 响应式 + 宿主 API）；靠 `specs/` 里的手动验证覆盖。流式 TPS 通过 `createEffect`/`onCleanup` 里的 `setInterval` 每 1s 刷新；完成态 TPS 用真实的 `tokens.output + tokens.reasoning`。
- `test/tps.test.ts` —— 照搬宿主内部的 `sidebar-tps.test.ts`。如果改了 `tps.ts` 的逻辑，保持这些用例与宿主行为一致。
- `test/slot-contract.test.ts` —— 守 `src/index.tsx` 的 slot 契约：default export 是 `{ id, tui }`，且 `tui()` 注册的是 `sidebar_content`（order 9999），**不是** `sidebar_footer`。这条专门防有人把 slot "改回" footer 触发最初的 single_winner bug。
- `specs/` —— 设计 + 计划文档（中文）。历史文档；不要当作当前代码行为的规范，**以代码为准**。

## 入口契约（别破坏）

宿主 loader 读 `package.json` 的 `exports["./tui"]`，然后对那个路径调用 `import()`。default export **必须**是 `TuiPluginModule & { id: string }`。如果插件在 TUI 里不出现，先用 `/plugins` 确认 `gandazhi:tps` 处于 enabled。

**slot 用的是 `sidebar_content`，不是 `sidebar_footer`，且 order 是 9999。** 这不是笔误，别"修正"成 footer：

- 宿主的 `sidebar_footer` slot 是 `mode="single_winner"`（见 `@opentui/solid` 的 `createSlot`：只渲染 `resolvedEntries[0]`，胜出者无输出才回退到 inline children）。它被内部插件 `internal:sidebar-footer`（`feature-plugins/sidebar/footer.tsx`，order 100，最先加载）独占并渲染路径/版本页脚。
- 外部插件注册 `sidebar_footer` 永远不会成为 winner，所以**完全不渲染** —— 这是本插件最初的 bug。
- 用更低 order 去抢 footer 会**整体替换**掉内部页脚（路径/版本/品牌消失），不可接受。
- `sidebar_content` 是 `append` 模式（所有插件都渲染，内部 `context.tsx`/`cwd.tsx`/`mcp.tsx` 等都堆在这里）。`@opentui/core` 的 `getSortedPlugins` 按 `order` 升序渲染，所以 `order: 9999` 把本插件排到 content 栈**最底部**（最接近页脚的位置）。这是架构上能做到的最接近"侧边栏底部"的位置。

注意：内部 `internal:sidebar-context`（`context.tsx`）已经在 `sidebar_content` 里渲染了一个 t/s 行，所以开启本插件后 t/s 会显示两处（Context 框内一行 + 本插件底部一行）。这是 single_winner 约束下的副作用，不是 bug。如果要消重，用 `/plugins` deactivate `internal:sidebar-context`（但会同时移除 token 总数/百分比/花费）。
