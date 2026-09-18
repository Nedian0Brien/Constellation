import type { AssistantStreamController } from "assistant-stream";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * NOTE(constellation): agent-chat-framework 의 `src/lib/agent/bridge.ts` 를
 * 옮긴 것이다. 원본과 다른 점은 두 가지다.
 *
 * 1. 중계 도구(`mcp__ui__*`)는 접두사를 떼어 클라이언트 도구 이름으로
 *    `addToolCallPart` 한다. 클라이언트의 `useAssistantTool` 이 같은 이름으로
 *    등록돼 있어야 결과 없는 tool call 이 도착했을 때 웹뷰가 실행한다.
 * 2. 중계 도구는 서버가 결과를 다시 보내지 않는다. 클라이언트가 이미
 *    실행해 화면에 넣었고, 같은 id 로 결과를 두 번 받으면 리더가 두 번
 *    응답을 받는다. 대신 `content_block_start` 에서 본 `tool_use.id` 와
 *    최종 인자를 `relay` 에 넘겨 MCP 핸들러가 짝을 찾게 한다.
 *
 * ## 왜 stream_event 를 쓰나
 *
 * `query()` 는 기본적으로 완성된 메시지(`type: "assistant"`)만 내보낸다.
 * 채팅 UI 는 토큰이 도착하는 대로 그려야 하므로 `includePartialMessages: true`
 * 를 켜고 `type: "stream_event"` 를 받는다. 그 안의 `event` 는 Anthropic
 * Messages API 의 스트리밍 이벤트 그대로다.
 *
 * 부분 메시지를 켜면 같은 내용이 두 번 온다 — 델타로 한 번, 턴이 끝날 때
 * 완성 메시지로 또 한 번. 텍스트와 사고 과정은 델타만 반영하고, 완성
 * 메시지는 툴 호출의 최종 인자를 확정하는 데만 쓴다.
 *
 * ## 대응 관계
 *
 * | SDK                                   | assistant-stream            |
 * |---------------------------------------|-----------------------------|
 * | `text_delta`                          | `appendText`                |
 * | `thinking_delta`                      | `appendReasoning`           |
 * | `tool_use` 블록 + `input_json_delta`   | `addToolCallPart` + argsText|
 * | `user` 메시지의 `tool_result`          | `setResponse` (중계 도구 제외)|
 * | `system/init`                         | `data-session` 데이터 파트    |
 * | `result`                              | `data-usage` 데이터 파트      |
 */

export const RELAY_PREFIX = "mcp__ui__";

/** 브리지가 툴 호출을 관찰할 때 알려 주는 대상 */
export type BridgeObserver = {
  onSessionId?: (sessionId: string) => void;
  /** 중계 도구의 인자가 확정됐다. 이름은 접두사를 뗀 클라이언트 이름이다. */
  onRelayCall?: (call: {
    toolUseId: string;
    toolName: string;
    argsText: string;
  }) => void;
};

type ToolSlot = {
  toolCallId: string;
  toolName: string;
  relay: boolean;
  argsText: string;
  controller: ReturnType<AssistantStreamController["addToolCallPart"]>;
  argsClosed: boolean;
};

export async function pipeAgentToStream(
  messages: AsyncIterable<SDKMessage>,
  controller: AssistantStreamController,
  observer: BridgeObserver = {},
): Promise<void> {
  /** content block index -> 열린 툴 호출 */
  const openTools = new Map<number, ToolSlot>();
  /** tool_use_id -> 툴 호출. tool_result 가 도착할 때 짝을 찾는다 */
  const toolsById = new Map<string, ToolSlot>();

  for await (const msg of messages) {
    switch (msg.type) {
      case "system": {
        if (msg.subtype !== "init") break;
        observer.onSessionId?.(msg.session_id);
        controller.appendData({
          type: "data",
          name: "session",
          data: {
            sessionId: msg.session_id,
            model: msg.model,
            cwd: msg.cwd,
            permissionMode: msg.permissionMode,
            tools: msg.tools,
          },
        });
        break;
      }

      case "stream_event": {
        handleStreamEvent(msg.event, controller, openTools, toolsById, observer);
        break;
      }

      case "assistant": {
        // 부분 메시지를 켜 두었으므로 텍스트와 사고 과정은 이미 델타로 갔다.
        // 여기서는 툴 호출의 최종 인자만 확정한다. input_json_delta 가
        // 애초에 오지 않은 경우만 메운다.
        //
        // NOTE(constellation): SDK 0.3.274 는 블록이 완성될 때마다 assistant
        // 메시지를 내므로 `content_block_stop` 보다 먼저 올 수 있다. 델타를
        // 받은 뒤에 완성 인자를 또 붙이면 `{"n": 42}{"n":42}` 가 된다. 델타가
        // 하나라도 왔으면 붙이지 않고 닫기만 한다.
        for (const block of msg.message.content) {
          if (block.type !== "tool_use") continue;
          const slot = toolsById.get(block.id);
          if (!slot || slot.argsClosed) continue;
          if (slot.argsText === "") {
            const text = JSON.stringify(block.input ?? {});
            slot.controller.argsText.append(text);
            slot.argsText = text;
          }
          closeArgs(slot, observer);
        }
        break;
      }

      case "user": {
        // 툴 실행 결과. Agent SDK 가 툴을 직접 돌리고 결과를 이 형태로 준다.
        const content = msg.message.content;
        if (typeof content === "string") break;
        for (const block of content) {
          if (block.type !== "tool_result") continue;
          const slot = toolsById.get(block.tool_use_id);
          if (!slot) continue;
          closeArgs(slot, observer);
          if (!slot.relay) {
            slot.controller.setResponse({
              result: toolResultText(block.content),
              isError: block.is_error === true,
            });
          }
          slot.controller.close();
          toolsById.delete(block.tool_use_id);
        }
        break;
      }

      case "result": {
        controller.appendData({
          type: "data",
          name: "usage",
          data: {
            subtype: msg.subtype,
            isError: msg.is_error,
            numTurns: msg.num_turns,
            durationMs: msg.duration_ms,
            ...("total_cost_usd" in msg
              ? { totalCostUsd: msg.total_cost_usd }
              : {}),
          },
        });
        break;
      }

      default:
        // 나머지 40여 종(훅 이벤트, 작업 알림, 압축 경계 등)은 이 화면이
        // 쓰지 않는다. 필요해지면 여기에 갈래를 더한다.
        break;
    }
  }

  // 결과를 받지 못한 채 스트림이 끝난 툴 호출을 정리한다. 중계 도구는
  // 클라이언트가 결과를 들고 있으므로 닫기만 한다.
  for (const slot of toolsById.values()) {
    closeArgs(slot, observer);
    if (!slot.relay) {
      slot.controller.setResponse({
        result: "도구 실행 결과를 받지 못한 채 스트림이 끝났습니다.",
        isError: true,
      });
    }
    slot.controller.close();
  }
  openTools.clear();
  toolsById.clear();
}

function closeArgs(slot: ToolSlot, observer: BridgeObserver) {
  if (slot.argsClosed) return;
  slot.controller.argsText.close();
  slot.argsClosed = true;
  if (slot.relay) {
    observer.onRelayCall?.({
      toolUseId: slot.toolCallId,
      toolName: slot.toolName,
      argsText: slot.argsText || "{}",
    });
  }
}

function handleStreamEvent(
  event: unknown,
  controller: AssistantStreamController,
  openTools: Map<number, ToolSlot>,
  toolsById: Map<string, ToolSlot>,
  observer: BridgeObserver,
) {
  const e = event as {
    type?: string;
    index?: number;
    content_block?: { type?: string; id?: string; name?: string };
    delta?: {
      type?: string;
      text?: string;
      thinking?: string;
      partial_json?: string;
    };
  };

  switch (e.type) {
    case "content_block_start": {
      const block = e.content_block;
      if (block?.type !== "tool_use" || e.index === undefined) break;
      const toolCallId = block.id ?? crypto.randomUUID();
      const rawName = block.name ?? "unknown";
      const relay = rawName.startsWith(RELAY_PREFIX);
      const toolName = relay ? rawName.slice(RELAY_PREFIX.length) : rawName;
      const slot: ToolSlot = {
        toolCallId,
        toolName,
        relay,
        argsText: "",
        controller: controller.addToolCallPart({ toolCallId, toolName }),
        argsClosed: false,
      };
      openTools.set(e.index, slot);
      toolsById.set(toolCallId, slot);
      break;
    }

    case "content_block_delta": {
      const d = e.delta;
      if (d?.type === "text_delta" && d.text) {
        controller.appendText(d.text);
      } else if (d?.type === "thinking_delta" && d.thinking) {
        controller.appendReasoning(d.thinking);
      } else if (d?.type === "input_json_delta" && d.partial_json) {
        const slot = e.index !== undefined ? openTools.get(e.index) : undefined;
        if (slot && !slot.argsClosed) {
          slot.controller.argsText.append(d.partial_json);
          slot.argsText += d.partial_json;
        }
      }
      break;
    }

    case "content_block_stop": {
      if (e.index === undefined) break;
      const slot = openTools.get(e.index);
      if (slot) {
        closeArgs(slot, observer);
        openTools.delete(e.index);
      }
      break;
    }

    default:
      break;
  }
}

/** tool_result 의 content 를 사람이 읽을 수 있는 한 덩어리로 만든다. */
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      const p = part as { type?: string; text?: string };
      if (p.type === "text") return p.text ?? "";
      return `[${p.type ?? "unknown"}]`;
    })
    .join("\n");
}
