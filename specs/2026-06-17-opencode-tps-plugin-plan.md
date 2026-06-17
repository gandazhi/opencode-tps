# opencode TPS 插件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建独立 npm 包 `@gandazhi/opencode-tps`，在 opencode TUI 侧边栏底部显示当前会话的 token 生成速度（t/s）。

**Architecture:** 纯函数核心（`src/tps.ts`，无 Solid 依赖、可单测）+ UI 渲染层（`src/index.tsx`，注册 `sidebar_footer` slot）。直接发布 `.tsx` 源码（无构建步骤），由 opencode 宿主的 `@opentui/solid/runtime-plugin-support` 在加载期处理 Solid JSX。

**Tech Stack:** TypeScript + Bun（运行/测试）、SolidJS（`solid-js` + `@opentui/solid`，宿主提供）、`@mimo-ai/plugin/tui`（插件 SDK 类型）。

**工作目录**: `/Users/gandazhi/code/agent/opencode-tps`（已是空项目，仅含 `specs/`）。

**关键参考（来自 MiMo-Code，不要修改）**:
- 内置 TPS 纯函数: `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/tps.ts`
- 内置 TPS 测试: `packages/opencode/test/cli/tui/sidebar-tps.test.ts`
- 内置 TPS UI（参考结构）: `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx`
- 插件 SDK 类型: `packages/plugin/src/tui.ts`（发布为 `@mimo-ai/plugin`，`exports["./tui"]`）
- loader 入口导入逻辑: `packages/opencode/src/plugin/loader.ts:122`（`import(row.entry)`）
- manifest 解析: `packages/opencode/src/plugin/install.ts:128-166`

---

### Task 1: 项目脚手架

**Files:**
- Create: `/Users/gandazhi/code/agent/opencode-tps/package.json`
- Create: `/Users/gandazhi/code/agent/opencode-tps/tsconfig.json`
- Create: `/Users/gandazhi/code/agent/opencode-tps/.gitignore`

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "@gandazhi/opencode-tps",
  "version": "0.1.0",
  "description": "opencode TUI plugin — show token generation speed (t/s) in the sidebar footer",
  "type": "module",
  "exports": {
    "./tui": "./src/index.tsx"
  },
  "files": ["src"],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "peerDependencies": {
    "solid-js": "*",
    "@opentui/solid": "*",
    "@opentui/core": "*"
  },
  "devDependencies": {
    "@mimo-ai/plugin": "*",
    "@mimo-ai/sdk": "*",
    "solid-js": "*",
    "@opentui/solid": "*",
    "@opentui/core": "*",
    "typescript": "*",
    "@types/bun": "*"
  }
}
```

注意：`exports["./tui"]` 指向源码 `./src/index.tsx`（不构建，见计划头说明）。`@mimo-ai/plugin`、`@mimo-ai/sdk` 仅作类型引用，放 devDependencies。

- [ ] **Step 2: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "types": ["bun-types"]
  },
  "include": ["src", "test"]
}
```

`jsx: "preserve"` + `jsxImportSource: "@opentui/solid"` 与 MiMo-Code 的 TUI tsconfig 一致（`packages/opencode/tsconfig.json`），保证类型检查时 JSX 走 Solid 命名空间。

- [ ] **Step 3: 写 `.gitignore`**

```
node_modules/
bun.lockb
```

- [ ] **Step 4: 初始化 git 并首次提交**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
git init
git add package.json tsconfig.json .gitignore specs/
git commit -m "chore: scaffold @gandazhi/opencode-tps plugin project"
```

预期：提交成功，仓库包含 `package.json`、`tsconfig.json`、`.gitignore`、`specs/`。

---

### Task 2: 安装依赖

**Files:**
- Modify: `/Users/gandazhi/code/agent/opencode-tps/package.json`（bun 会写入 resolved 版本 + `bun.lockb`）

- [ ] **Step 1: 安装全部依赖**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
bun install
```

预期：`@mimo-ai/plugin@0.1.1`、`@mimo-ai/sdk@0.1.1`、`@opentui/solid@0.4.1`、`@opentui/core`、`solid-js`、`typescript`、`@types/bun` 安装成功，生成 `node_modules/` 和 `bun.lockb`。

若 `@mimo-ai/*` 安装失败（不在 registry），改用 `bun add -d @mimo-ai/plugin @mimo-ai/sdk` 单独重试；仍失败则从 MiMo-Code 打包：`cd /Users/gandazhi/code/agent/MiMo-Code && bun pm pack packages/plugin packages/sdk` 然后用 tarball 安装。

- [ ] **Step 2: 验证类型解析**

```bash
bun run typecheck 2>&1 | head -20
```

预期：当前还没有 `src/`，可能报 "No inputs were found"（include 匹配为空）或无错误。这是正常的，下一个 Task 创建 `src/` 后再验证。若报找不到 `@mimo-ai/plugin` 等模块，说明依赖未装好，回到 Step 1。

- [ ] **Step 3: 提交 lockfile**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
git add package.json bun.lockb
git commit -m "chore: install dependencies"
```

---

### Task 3: TDD 实现 `src/tps.ts`（纯函数核心）

**Files:**
- Create: `/Users/gandazhi/code/agent/opencode-tps/test/tps.test.ts`
- Create: `/Users/gandazhi/code/agent/opencode-tps/src/tps.ts`

照搬内置 `sidebar-tps.test.ts`（`packages/opencode/test/cli/tui/sidebar-tps.test.ts`）的全部用例。

- [ ] **Step 1: 写失败测试 `test/tps.test.ts`**

```typescript
import { test, expect, describe } from "bun:test"
import { streamingTPS, completedTPS, formatTPS } from "../src/tps"

describe("streamingTPS", () => {
  test("returns null when combined text is empty", () => {
    expect(streamingTPS("", 1000, 5000)).toBeNull()
  })

  test("returns null when elapsed < 0.5s", () => {
    expect(streamingTPS("a".repeat(800), 1000, 1400)).toBeNull()
  })

  test("returns null when elapsed exactly 0", () => {
    expect(streamingTPS("a".repeat(800), 1000, 1000)).toBeNull()
  })

  test("computes tokens / elapsedSec when valid", () => {
    expect(streamingTPS("a".repeat(800), 1000, 3000)).toBe(100)
  })

  test("very small token count above the elapsed threshold still returns positive", () => {
    expect(streamingTPS("abcd", 0, 1000)).toBe(1)
  })
})

describe("completedTPS", () => {
  test("returns null when output + reasoning is 0", () => {
    expect(completedTPS(0, 0, 1000, 5000)).toBeNull()
  })

  test("returns null when elapsedSec < 0.001 (zero-duration message)", () => {
    expect(completedTPS(100, 0, 1000, 1000)).toBeNull()
  })

  test("sums output and reasoning, divides by elapsed seconds", () => {
    expect(completedTPS(200, 100, 1000, 4000)).toBe(100)
  })

  test("reasoning-only turn (output == 0, reasoning > 0) still computes", () => {
    expect(completedTPS(0, 50, 1000, 3000)).toBe(25)
  })
})

describe("formatTPS", () => {
  test("returns null when input is null", () => {
    expect(formatTPS(null)).toBeNull()
  })

  test("renders <1 t/s when 0 < tps < 1", () => {
    expect(formatTPS(0.4)).toBe("<1 t/s")
  })

  test("rounds positive values to integer", () => {
    expect(formatTPS(42.6)).toBe("43 t/s")
    expect(formatTPS(42.4)).toBe("42 t/s")
    expect(formatTPS(1)).toBe("1 t/s")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
bun test
```

预期：FAIL，错误信息类似 "Cannot find module '../src/tps'" 或 "streamingTPS is not defined"。

- [ ] **Step 3: 写实现 `src/tps.ts`**

```typescript
const CHARS_PER_TOKEN = 4
const MIN_STREAMING_ELAPSED_SEC = 0.5
const MIN_COMPLETED_ELAPSED_SEC = 0.001

function estimateTokens(input: string): number {
  return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
}

export function streamingTPS(combinedText: string, startedAt: number, now: number): number | null {
  const tokens = estimateTokens(combinedText)
  if (tokens === 0) return null
  const elapsedSec = (now - startedAt) / 1000
  if (elapsedSec < MIN_STREAMING_ELAPSED_SEC) return null
  return tokens / elapsedSec
}

export function completedTPS(
  outputTokens: number,
  reasoningTokens: number,
  startedAt: number,
  completedAt: number,
): number | null {
  const tokens = outputTokens + reasoningTokens
  if (tokens === 0) return null
  const elapsedSec = (completedAt - startedAt) / 1000
  if (elapsedSec < MIN_COMPLETED_ELAPSED_SEC) return null
  return tokens / elapsedSec
}

export function formatTPS(tps: number | null): string | null {
  if (tps === null) return null
  if (tps < 1) return "<1 t/s"
  return `${Math.round(tps)} t/s`
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
bun test
```

预期：PASS，全部 12 个用例通过（`streamingTPS` 5 个 + `completedTPS` 4 个 + `formatTPS` 3 个）。

- [ ] **Step 5: 类型检查**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
bun run typecheck
```

预期：无错误。

- [ ] **Step 6: 提交**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
git add src/tps.ts test/tps.test.ts
git commit -m "feat: add pure TPS calculation functions with tests"
```

---

### Task 4: 实现 UI 渲染 `src/index.tsx`

**Files:**
- Create: `/Users/gandazhi/code/agent/opencode-tps/src/index.tsx`

UI 层不写单测（Solid 响应式 + 宿主 API 集成，单测收益低），靠 Task 5 的手动验证覆盖。

- [ ] **Step 1: 写 `src/index.tsx`**

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
  const isStreaming = createMemo(
    () => lastAssistant() !== undefined && !lastAssistant()!.time.completed,
  )

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
      tick()
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

注意点：
- `sidebar_footer` slot 的 props 形状是 `{ session_id: string }`（见 MiMo-Code `packages/plugin/src/tui.ts` 的 `TuiHostSlotMap.sidebar_footer`）。
- `props.api.state.part(m.id)` 返回 `ReadonlyArray<Part>`，`Part` 的 `type` 含 `"text" | "reasoning"`，对应字段是 `.text`。
- `lastAssistant()!.time.completed` 的非空断言：`isStreaming` 已保证 `lastAssistant()` 非 undefined。
- `tick()` 故意读一下以建立响应式依赖（让流式读数每秒刷新）。

- [ ] **Step 2: 类型检查**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
bun run typecheck
```

预期：无错误。若报 `Part` 类型上没有 `.text` 或 `.type` 不匹配，参考 MiMo-Code `packages/sdk/js/src/v2/gen/types.gen.ts` 里 `Part` 的判别字段；若 `sidebar_footer` props 报错，确认 `TuiHostSlotMap` 的形状（`tui.ts` 中 `sidebar_footer: { session_id: string }`）。

- [ ] **Step 3: 全量测试仍通过**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
bun test
```

预期：PASS（index.tsx 无测试，但确保没破坏 tps.ts 的测试）。

- [ ] **Step 4: 提交**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
git add src/index.tsx
git commit -m "feat: add sidebar_footer TUI view rendering t/s"
```

---

### Task 5: 本地安装与手动验证

**Files:**
- Modify: 某个测试用 opencode 项目的 `opencode.json`（不在本包内，见下）

本 Task 在一个临时 opencode 项目里通过 `file://` 加载本插件并人工验证行为。

- [ ] **Step 1: 选定测试目录并写插件配置**

用一个干净的目录作为测试 opencode 项目（例如 `/Users/gandazhi/code/agent/opencode-tps/dev-test`），在其中创建 `opencode.json`：

```bash
mkdir -p /Users/gandazhi/code/agent/opencode-tps/dev-test
```

`/Users/gandazhi/code/agent/opencode-tps/dev-test/opencode.json`：

```json
{
  "plugin": ["file:///Users/gandazhi/code/agent/opencode-tps"]
}
```

注意：spec 指向**包根目录**（不是 `src/index.tsx`），loader 会读包的 `package.json` → `exports["./tui"]` → `src/index.tsx`（见 MiMo-Code `packages/opencode/src/plugin/shared.ts:103-114` `resolvePackageEntrypoint`）。

- [ ] **Step 2: 启动 opencode 并发消息**

```bash
cd /Users/gandazhi/code/agent/opencode-tps/dev-test
opencode
```

（若 `opencode` 命令名不同，用实际的 MiMo-Code 构建产物入口。）

在 TUI 里随便问个需要生成一段文字的问题（例如 "写一首关于秋天的四行诗"），让模型流式输出。

- [ ] **Step 3: 验证流式行为**

观察侧边栏底部（footer 区，路径/版本行附近）：
- 模型开始流式输出 0.5s 后，应出现一行 `N t/s`（N 是估算速度）。
- 该行每秒刷新一次数值。
- 若无任何 assistant 消息或还在首 token 延迟（<0.5s），该行不出现（不留空行）。

预期结果符合上述。若 footer 完全不出现该行，排查：插件是否加载成功（`/plugins` 命令应列出 `gandazhi:tps` 且 enabled）；若报错，看启动日志 `[tui.plugin]` 相关行。

- [ ] **Step 4: 验证完成行为**

模型输出结束后：
- footer 行切到一个数值（基于真实 `tokens.output + tokens.reasoning` / 总耗时）。
- 该数值停留，不再刷新（直到下一条消息开始流式）。

- [ ] **Step 5: 验证停用**

在 TUI 执行 `/plugins`，找到 `gandazhi:tps`，deactivate。预期 footer 的 t/s 行消失。再 activate 应恢复。

- [ ] **Step 6: 清理 dev-test，提交验证记录**

```bash
rm -rf /Users/gandazhi/code/agent/opencode-tps/dev-test
```

（dev-test 是临时目录，不入 git。无需提交；若想留记录，可在 `specs/` 下加一段验证笔记。）

---

### Task 6（可选）: npm 发布准备

仅当准备公开发布时执行。当前可跳过。

**Files:**
- Create: `/Users/gandazhi/code/agent/opencode-tps/README.md`

- [ ] **Step 1: 写 `README.md`**

包含：一行简介、安装命令（`/plugins install @gandazhi/opencode-tps`）、显示效果说明（footer 一行 `N t/s`）、可选项（无）。

- [ ] **Step 2: 确认发布字段**

确保 `package.json` 有 `"license"`、`"author"`、`"repository"` 字段，且 `"publishConfig": { "access": "public" }`（scoped 包默认 private）。

- [ ] **Step 3: dry-run 发布**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
npm publish --dry-run
```

预期：列出将发布的文件（应只有 `src/`、`package.json`、`README.md`，**不含** `node_modules`、`specs`、`test`）。确认 `files: ["src"]` 生效。

- [ ] **Step 4: 真实发布（人工确认后）**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
npm publish --access public
```

- [ ] **Step 5: 提交 README**

```bash
cd /Users/gandazhi/code/agent/opencode-tps
git add README.md package.json
git commit -m "docs: add README and publish metadata"
```

---

## Self-Review 结论

- **Spec 覆盖**：包结构(Task 1)、纯函数核心(Task 3)、UI 渲染(Task 4)、构建/分发/安装(Task 2 装依赖 + Task 6 发布)、测试(Task 3)、验证步骤(Task 5)、边界处理（Task 3 的 null 分支 + Task 4 的 `<Show>`）全部有对应 Task。
- **占位符扫描**：无 TBD/TODO，每个代码步都给了完整代码。
- **类型一致性**：`streamingTPS`/`completedTPS`/`formatTPS` 在 Task 3 定义、Task 4 引用，签名一致；`AssistantMessage`、`TuiPluginApi`、`TuiPluginModule` 来自已发布的 `@mimo-ai/*` 类型包。
- **与 spec 的偏差**：spec 原写 `bun build` → `dist/index.js`，本计划改为直接发布源码 `./src/index.tsx`（理由已写入 spec「为什么发布源码而非编译产物」并同步更新了 spec 的构建/安装/验证章节）。这是计划阶段发现的技术修正，spec 已同步更新，两者一致。
