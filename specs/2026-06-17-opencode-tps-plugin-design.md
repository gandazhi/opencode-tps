# opencode TPS 插件设计

- **日期**: 2026-06-17
- **包名**: `@gandazhi/opencode-tps`
- **形式**: 外部 npm 包（TUI 插件）
- **目标**: 在 opencode TUI 侧边栏底部显示当前会话的 token 生成速度（t/s），行为与内置 `feature-plugins/sidebar/context.tsx` 中的 TPS 行一致，但作为独立可分发的插件。

## 背景与动机

opencode 已有内置的 token 速度展示，位于 `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx`，它是 `INTERNAL_TUI_PLUGINS` 的一员（注册在 `internal.ts:21`），与 token 总数/百分比/花费混在一个 `sidebar_content` 面板里。

本插件把「token 速度」这一项单独抽出来，做成可独立安装、可分发的 npm 包，注册到 `sidebar_footer` slot，与内置 context 面板不冲突、不重复。

## 选定方案

**方案 B：分文件 + 纯函数可测。**

- `src/tps.ts`：纯函数（流式/完成 TPS 计算 + token 估算），无 Solid 依赖，可单测。
- `src/index.tsx`：`TuiPluginModule` + `sidebar_footer` 渲染。
- `test/tps.test.ts`：测纯函数。

理由：内置代码本就把纯数学（`tps.ts`）与 UI（`context.tsx`）拆开，并有专门的测试文件（`sidebar-tps.test.ts`）。复制这个已验证的结构几乎不比单文件多花时间，却保留了可测的核心数学。可配置选项（刷新间隔/阈值）当前无需求，按 YAGNI 不做。

## 包结构与 manifest

```
opencode-tps/
├── package.json
├── tsconfig.json
├── src/
│   ├── tps.ts        # 纯函数，无 Solid 依赖
│   └── index.tsx     # TuiPluginModule + sidebar_footer 渲染
└── test/
    └── tps.test.ts
```

（无 `dist/`、无构建产物——见下方「为什么发布源码」。）

`package.json` 关键字段（manifest 格式由 `packages/opencode/src/plugin/install.ts:128-166` 的 `exportTarget`/`packageTargets` 定义：opencode 读取 `exports["./tui"]`，取其 `import`/`default` 字符串作为入口）：

```json
{
  "name": "@gandazhi/opencode-tps",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    "./tui": "./src/index.tsx"
  },
  "files": ["src"],
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "solid-js": "*",
    "@opentui/solid": "*",
    "@opentui/core": "*"
  }
}
```

入口 `src/index.tsx` 的 **default export** 是 `TuiPluginModule`（`{ id, tui }`）。

**为什么发布源码而非编译产物**：opencode 在 Bun 上运行，loader 用 `import(row.entry)` 直接导入入口（`packages/opencode/src/plugin/loader.ts:122`），且在加载任何 TUI 插件前先 `import "@opentui/solid/runtime-plugin-support"`（`packages/opencode/src/cli/cmd/tui/plugin/runtime.ts:1`），由它在加载期把 SolidJS JSX 转换成 Solid 运行时调用。如果改用 `bun build` 预编译，Bun 打包器会用默认的 React 风格 JSX 转换，破坏 Solid 响应式。因此本插件与内置 `@mimo-ai/plugin` 包（`"./tui": "./src/tui.ts"`）保持一致，**直接发布 `.tsx` 源码**，`files` 只列 `src`，无 `dist`、无 build 步骤。

## 组件

### `src/tps.ts` — 纯函数核心

复刻内置 `feature-plugins/sidebar/tps.ts` 的逻辑（已被 `sidebar-tps.test.ts` 验证）。因插件无法 `import "@/util/token"`，把 4 字符≈1 token 的估算内联：

```ts
const CHARS_PER_TOKEN = 4
const MIN_STREAMING_ELAPSED_SEC = 0.5
const MIN_COMPLETED_ELAPSED_SEC = 0.001

function estimateTokens(input: string): number {
  return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
}

export function streamingTPS(combinedText: string, startedAt: number, now: number): number | null
export function completedTPS(outputTokens: number, reasoningTokens: number, startedAt: number, completedAt: number): number | null
export function formatTPS(tps: number | null): string | null
```

**职责**：
- `streamingTPS`：`estimateTokens(combinedText)` 除以 `(now - startedAt)/1000`；token=0 或 elapsed<0.5s 返回 `null`。
- `completedTPS`：`(outputTokens + reasoningTokens)` 除以 `(completedAt - startedAt)/1000`；总和=0 或 elapsed<0.001s 返回 `null`。
- `formatTPS`：`null`→`null`；`tps < 1`→`"<1 t/s"`；否则 `Math.round`→`"N t/s"`。

**依赖**：无（纯函数，零外部依赖）。

### `src/index.tsx` — UI 渲染

注册到 `sidebar_footer` slot，只渲染 TPS 一行：

```tsx
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@mimo-ai/plugin/tui"
import type { AssistantMessage } from "@mimo-ai/sdk/v2"
import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { completedTPS, formatTPS, streamingTPS } from "./tps"

const id = "gandazhi:tps"
const REFRESH_MS = 1000

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const lastAssistant = createMemo(() =>
    msg().findLast((item): item is AssistantMessage => item.role === "assistant"),
  )
  const isStreaming = createMemo(() => lastAssistant() !== undefined && !lastAssistant()!.time.completed)

  const [tick, setTick] = createSignal(Date.now())
  createEffect(() => {
    if (!isStreaming()) return
    const handle = setInterval(() => setTick(Date.now()), REFRESH_MS)
    onCleanup(() => clearInterval(handle))
  })

  const tps = createMemo<number | null>(() => {
    const m = lastAssistant()
    if (!m) return null
    if (isStreaming()) {
      tick() // 响应式依赖，使读数在 delta 之间刷新
      const combined = props.api.state
        .part(m.id)
        .filter((p) => p.type === "text" || p.type === "reasoning")
        .map((p) => p.text)
        .join("")
      return streamingTPS(combined, m.time.created, Date.now())
    }
    const idle = msg().findLast(
      (item): item is AssistantMessage =>
        item.role === "assistant" &&
        item.time.completed !== undefined &&
        item.tokens.output + item.tokens.reasoning > 0,
    )
    if (!idle?.time.completed) return null
    return completedTPS(idle.tokens.output, idle.tokens.reasoning, idle.time.created, idle.time.completed)
  })

  return (
    <Show when={formatTPS(tps())}>{(label) => <text fg={theme().textMuted}>{label()}</text>}</Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_footer: (_ctx, props) => <View api={api} session_id={props.session_id} />,
    },
  })
}

const plugin: TuiPluginModule & { id: string } = { id, tui }
export default plugin
```

**职责**：监听当前 session 的消息流，流式时每秒刷新估算 t/s，完成后切到精确 t/s，渲染成一行 `text`。

**依赖**：`@mimo-ai/plugin/tui`（类型）、`@mimo-ai/sdk/v2`（类型）、`solid-js`（宿主提供）、本包 `./tps`。

## 数据流

```
session 消息流 (api.state.session.messages / api.state.part)
        │
        ▼
 lastAssistant memo ──► isStreaming?
        │                    │
        │   是 ──► tick(1s) 驱动 ──► streamingTPS(拼接文本估算)
        │   否 ──► 找最后一条已完成 ──► completedTPS(真实 tokens)
        ▼
   formatTPS ──► <Show> 渲染 sidebar_footer 一行
```

## 构建、分发与安装

**构建**
- **无需构建**——直接发布 `.tsx` 源码（理由见「为什么发布源码而非编译产物」）。
- `tsconfig.json` 仅用于 `bun run typecheck`（`tsc --noEmit`），不产出任何文件。
- `solid-js`、`@opentui/solid`、`@opentui/core` 声明为 `peerDependencies`，由 opencode 宿主提供（均已发布到 npm，版本见下）。
- `@mimo-ai/plugin`、`@mimo-ai/sdk` 仅作 **类型** 引用（`import type`，编译期擦除），放在 `devDependencies` 供 typecheck 解析。

**分发与安装（两条路径）**

1. **npm 发布**：`npm publish` 后，用户在 TUI 内 `/plugins install @gandazhi/opencode-tps`。install 流程读 `exports["./tui"]`、把 spec 写进 `.mimocode/tui.json` 的 `plugin` 数组（`install.ts:421` `patchPluginConfig`）。
2. **本地试用**（开发期）：在 `opencode.json` 写 `"plugin": ["file:///Users/gandazhi/code/agent/opencode-tps"]`（指向包根目录，loader 会读其 `exports["./tui"]` → `src/index.tsx`），或 `/plugins install file://<包根目录绝对路径>`。

**依赖版本**（均已在 npm）：`@mimo-ai/plugin@0.1.1`、`@mimo-ai/sdk@0.1.1`、`@opentui/solid@0.4.1`、`@opentui/core`、`solid-js`。

## 测试

**`test/tps.test.ts`**（纯函数，无 mock，照搬内置 `sidebar-tps.test.ts` 用例）：

- `streamingTPS`：空文本→`null`；elapsed<0.5s→`null`；elapsed=0→`null`；800 字符/2s→`100`；4 字符/1s→`1`。
- `completedTPS`：output+reasoning=0→`null`；elapsed<0.001s→`null`；(200+100)/3s→`100`；纯 reasoning (0+50)/2s→`25`。
- `formatTPS`：`null`→`null`；0.4→`"<1 t/s"`；42.6→`"43 t/s"`；42.4→`"42 t/s"`；1→`"1 t/s"`。

UI 层（`index.tsx`）不写单测：Solid 响应式 + 宿主 API 集成，单测收益低、mock 成本高，靠下方手动验证覆盖。

## 验证步骤

1. `bun run typecheck` 类型检查无误。
2. 本地 `file://` 装上插件（指向包根目录），开 session 发消息：
   - 流式中：footer 每秒刷新一行 `N t/s`（>0.5s 后才出现）。
   - 完成后：切到精确值，停留显示最后一条的 t/s。
   - 无消息时：footer 不渲染该行（`<Show>` 控制）。
3. `/plugins deactivate gandazhi:tps`：行消失。

## 边界处理

全部已在纯函数里兜底：

- 无 assistant 消息 / 首条还在 TTFT → `null` → 不渲染。
- `tokens` 字段缺失或为 0 → `null`。
- 极短耗时（<1ms）→ `null`，避免除零。
- reasoning-only 回合（output=0, reasoning>0）→ 正常计算。
- session 切换：`session_id` props 变化时 Solid 自动重算 `msg()` memo；`onCleanup` 在 `createEffect` 重跑时清理旧定时器，无需手动管理。

## 不做的事（YAGNI）

- 不加配置选项（刷新间隔 / 最小 elapsed 阈值 / 自定义标签）。
- 不显示 token 总数 / 百分比 / 花费（内置 `context.tsx` 的职责）。
- 不做峰值 / 平均 / 历史统计（单一当前值已够）。
