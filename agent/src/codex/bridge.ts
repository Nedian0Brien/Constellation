import type { AssistantStreamController } from "assistant-stream";
import { SERVER_NAME, type Relay } from "../relay.ts";
import type { CodexAppServer } from "./app-server.ts";
import type {
  ReasoningEffort,
  ServerNotification,
  ThreadItem,
  TokenUsageBreakdown,
  Turn,
  TurnStartParams,
  TurnStartResponse,
} from "./protocol.ts";

/**
 * NOTE(constellation): agent-chat-framework 의 `src/lib/agent/codex/bridge.ts`
 * 를 옮긴 것이다. 다른 점은 `onToolCall` 콜백 대신 `relay` 를 받아 `ui` MCP
 * 서버(웹뷰 도구) 호출을 중계 도구로 다루는 것이다 — Claude 브리지와 같은
 * 두 규칙: 이름은 서버 접두사를 뗀 클라이언트 이름으로 내고, 결과는 서버가
 * 다시 붙이지 않는다(웹뷰가 이미 실행해 화면에 넣었다).
 *
 * `codex app-server` 의 턴 하나를 assistant-stream 으로 옮긴다.
 *
 * Claude 브리지(`../bridge.ts`)와 같은 화면 프로토콜을 낸다 — 텍스트, 사고
 * 과정, 툴 호출 파트, `data-usage`. 차이는 입력 쪽이다. Claude 는 Messages
 * API 의 스트리밍 이벤트를 그대로 주지만, app-server 는 아이템 단위 알림을
 * 준다.
 *
 * | app-server                                  | assistant-stream          |
 * |---------------------------------------------|---------------------------|
 * | `item/agentMessage/delta`                   | `appendText`              |
 * | `item/reasoning/summaryTextDelta`·`textDelta` | `appendReasoning`       |
 * | `item/started`(webSearch·mcpToolCall·commandExecution) | `addToolCallPart` |
 * | `item/completed`(같은 종류)                  | `setResponse` + `close`   |
 * | `thread/tokenUsage/updated`                 | 기억해 두었다가 usage 에   |
 * | `turn/completed`                            | `data-usage`, 종료         |
 * | `error`                                     | 예외                      |
 *
 * `item/completed(agentMessage)` 는 전체 텍스트를 다시 주지만 델타로 이미
 * 갔으므로 붙이지 않는다. 델타가 하나도 오지 않은 경우만 메운다.
 */
export type CodexTurnOptions = {
  server: CodexAppServer;
  threadId: string;
  prompt: string;
  model?: string;
  effort?: ReasoningEffort;
  /** speed 티어 id. `model/list` 의 `serviceTiers[].id`(이 기계에서 `priority`). */
  speed?: string;
  signal?: AbortSignal;
  /** 웹뷰 도구 중계. `ui` 서버의 mcpToolCall 을 여기에 알린다. */
  relay?: Relay;
};

type ToolSlot = {
  controller: ReturnType<AssistantStreamController["addToolCallPart"]>;
  argsClosed: boolean;
  /** 중계 도구 — 결과는 웹뷰가 이미 들고 있으므로 서버가 붙이지 않는다. */
  relay: boolean;
};

export async function pipeCodexTurnToStream(
  options: CodexTurnOptions,
  controller: AssistantStreamController,
): Promise<void> {
  const { server, threadId, signal } = options;
  const tools = new Map<string, ToolSlot>();
  const textItems = new Set<string>();
  let usage: TokenUsageBreakdown | undefined;
  let turnId: string | undefined;

  let finish!: (turn: Turn) => void;
  let fail!: (error: Error) => void;
  const done = new Promise<Turn>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });

  const onNotification = (n: ServerNotification) => {
    switch (n.method) {
      case "item/agentMessage/delta": {
        const p = n.params as { itemId: string; delta: string; turnId: string };
        if (turnId && p.turnId !== turnId) break;
        textItems.add(p.itemId);
        controller.appendText(p.delta);
        break;
      }
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/textDelta": {
        const p = n.params as { delta: string; turnId: string };
        if (turnId && p.turnId !== turnId) break;
        controller.appendReasoning(p.delta);
        break;
      }
      case "item/started": {
        const p = n.params as { item: ThreadItem; turnId: string };
        if (turnId && p.turnId !== turnId) break;
        openTool(p.item);
        break;
      }
      case "item/completed": {
        const p = n.params as { item: ThreadItem; turnId: string };
        if (turnId && p.turnId !== turnId) break;
        const item = p.item;
        if (item.type === "agentMessage" && !textItems.has(item.id)) {
          controller.appendText((item as { text: string }).text);
          textItems.add(item.id);
          break;
        }
        // webSearch 는 started 없이 completed 만 오기도 한다.
        if (!tools.has(item.id)) openTool(item);
        closeTool(item);
        break;
      }
      case "thread/tokenUsage/updated": {
        const p = n.params as { tokenUsage: { last: TokenUsageBreakdown } };
        usage = p.tokenUsage.last;
        break;
      }
      case "turn/completed": {
        const p = n.params as { turn: Turn };
        if (turnId && p.turn.id !== turnId) break;
        finish(p.turn);
        break;
      }
      case "error": {
        const p = n.params as {
          turnId: string;
          error: { message: string };
          willRetry: boolean;
        };
        if (p.willRetry) break;
        if (turnId && p.turnId && p.turnId !== turnId) break;
        fail(new Error(p.error.message));
        break;
      }
      default:
        break;
    }
  };

  function openTool(item: ThreadItem) {
    const summary = describeTool(item);
    if (!summary) return;
    const slot: ToolSlot = {
      controller: controller.addToolCallPart({
        toolCallId: item.id,
        toolName: summary.name,
      }),
      argsClosed: false,
      relay: summary.relay,
    };
    const argsText = JSON.stringify(summary.args);
    slot.controller.argsText.append(argsText);
    slot.controller.argsText.close();
    slot.argsClosed = true;
    tools.set(item.id, slot);
    if (summary.relay) {
      options.relay?.observeCall({
        toolUseId: item.id,
        toolName: summary.name,
        argsText,
      });
    }
  }

  function closeTool(item: ThreadItem) {
    const slot = tools.get(item.id);
    if (!slot) return;
    if (!slot.relay) slot.controller.setResponse(describeResult(item));
    slot.controller.close();
    tools.delete(item.id);
  }

  const unsubscribe = server.subscribe(threadId, onNotification);
  const onAbort = () => {
    if (turnId) {
      server
        .request("turn/interrupt", { threadId, turnId })
        .catch(() => undefined);
    }
    fail(new Error("중단됨"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const params: TurnStartParams = {
      threadId,
      input: [{ type: "text", text: options.prompt }],
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
      // 생략하면 스레드 티어(기본 표준)를 따른다. 턴마다 고르므로 turn 단위 필드다.
      serviceTierForTurn: options.speed ?? "default",
      summary: "auto",
    };
    const started = await server.request<TurnStartResponse>("turn/start", params);
    turnId = started.turn.id;
    if (signal?.aborted) onAbort();

    const turn = await done;
    for (const [id, slot] of tools) {
      if (!slot.relay)
        slot.controller.setResponse({
          result: "도구 실행 결과를 받지 못한 채 턴이 끝났습니다.",
          isError: true,
        });
      slot.controller.close();
      tools.delete(id);
    }
    if (turn.status === "failed") {
      throw new Error(turn.error?.message ?? "Codex 턴이 실패했습니다.");
    }
    controller.appendData({
      type: "data",
      name: "usage",
      data: {
        subtype: turn.status === "interrupted" ? "interrupted" : "success",
        isError: false,
        numTurns: 1,
        durationMs: turn.durationMs ?? 0,
        ...(usage
          ? {
              inputTokens: usage.inputTokens,
              cachedInputTokens: usage.cachedInputTokens,
              outputTokens: usage.outputTokens,
              reasoningOutputTokens: usage.reasoningOutputTokens,
            }
          : {}),
      },
    });
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsubscribe();
  }
}

/** 툴 카드에 보일 이름과 인자. 카드로 만들지 않는 아이템은 undefined. */
function describeTool(
  item: ThreadItem,
): { name: string; args: Record<string, unknown>; relay: boolean } | undefined {
  switch (item.type) {
    case "webSearch": {
      const i = item as Extract<ThreadItem, { type: "webSearch" }>;
      const action = i.action;
      const args: Record<string, unknown> = { query: i.query };
      if (action?.type === "open_page" && action.url) args.url = action.url;
      if (action?.type === "find_in_page") {
        if (action.url) args.url = action.url;
        if (action.pattern) args.pattern = action.pattern;
      }
      return { name: "WebSearch", args, relay: false };
    }
    case "mcpToolCall": {
      const i = item as Extract<ThreadItem, { type: "mcpToolCall" }>;
      const relay = i.server === SERVER_NAME;
      return {
        name: relay ? i.tool : `${i.server}__${i.tool}`,
        args: (i.arguments ?? {}) as Record<string, unknown>,
        relay,
      };
    }
    case "commandExecution": {
      const i = item as Extract<ThreadItem, { type: "commandExecution" }>;
      return { name: "Bash", args: { command: i.command }, relay: false };
    }
    default:
      return undefined;
  }
}

function describeResult(item: ThreadItem): { result: string; isError: boolean } {
  switch (item.type) {
    case "webSearch": {
      const i = item as Extract<ThreadItem, { type: "webSearch" }>;
      return {
        result: i.results ? JSON.stringify(i.results) : "검색 완료",
        isError: false,
      };
    }
    case "mcpToolCall": {
      const i = item as Extract<ThreadItem, { type: "mcpToolCall" }>;
      if (i.error) return { result: i.error.message, isError: true };
      const content = i.result?.content ?? [];
      const text = content
        .map((c) => {
          const part = c as { type?: string; text?: string };
          return part.type === "text" ? (part.text ?? "") : `[${part.type}]`;
        })
        .join("\n");
      return {
        result:
          text ||
          (i.result?.structuredContent
            ? JSON.stringify(i.result.structuredContent)
            : ""),
        isError: i.status === "failed",
      };
    }
    case "commandExecution": {
      const i = item as Extract<ThreadItem, { type: "commandExecution" }>;
      return {
        result: i.aggregatedOutput ?? "",
        isError: i.exitCode !== null && i.exitCode !== 0,
      };
    }
    default:
      return { result: "", isError: false };
  }
}
