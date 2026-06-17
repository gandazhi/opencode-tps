import { test, expect, describe } from "bun:test"

describe("plugin entry contract (sidebar_footer single_winner regression)", () => {
  test("module default export is a TuiPluginModule with id", async () => {
    const mod = await import("../src/index.tsx")
    const plugin = (mod as { default: unknown }).default as {
      id: string
      tui: (api: unknown, options?: unknown, meta?: unknown) => Promise<void>
    }
    expect(typeof plugin).toBe("object")
    expect(plugin.id).toBe("gandazhi:tps")
    expect(typeof plugin.tui).toBe("function")
  })

  test("tui() registers sidebar_content (NOT sidebar_footer) with high order", async () => {
    const mod = await import("../src/index.tsx")
    const plugin = (mod as { default: unknown }).default as {
      tui: (api: unknown) => Promise<void>
    }

    let captured: {
      order?: number
      slots?: Record<string, unknown>
    } = {}

    const api = {
      slots: {
        register(p: { order?: number; slots?: Record<string, unknown> }) {
          captured = p
        },
      },
    }

    await plugin.tui(api)

    expect(captured.order).toBe(9999)
    expect(captured.slots).toBeDefined()
    expect(Object.keys(captured.slots!)).toContain("sidebar_content")
    expect(Object.keys(captured.slots!)).not.toContain("sidebar_footer")
    expect(typeof captured.slots!.sidebar_content).toBe("function")
  })
})
