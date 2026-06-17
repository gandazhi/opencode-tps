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
    <Show when={formatTPS(tps())}>
      {(label) => (
        <box>
          <text fg={theme().text}>
            <b>Speed</b>
          </text>
          <text fg={theme().textMuted}>{label()}</text>
        </box>
      )}
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 9999,
    slots: {
      sidebar_content: (_ctx, props) => <View api={api} session_id={props.session_id} />,
    },
  })
}

const plugin: TuiPluginModule & { id: string } = { id, tui }
export default plugin
