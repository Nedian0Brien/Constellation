import { test } from "node:test";
import assert from "node:assert/strict";
import type { AssistantStreamController } from "assistant-stream";
import { pipeCodexTurnToStream } from "./codex/bridge.ts";
import type { CodexAppServer } from "./codex/app-server.ts";
import type { ServerNotification } from "./codex/protocol.ts";
import { parseModelId } from "./models.ts";
import { Relay } from "./relay.ts";

test("parseModelId: 접두사로 프로바이더를 가르고, 없으면 Claude 다", () => {
  assert.deepEqual(parseModelId("codex/gpt-5.5"), { provider: "codex", model: "gpt-5.5" });
  assert.deepEqual(parseModelId("claude/opus[1m]"), { provider: "claude", model: "opus[1m]" });
  assert.deepEqual(parseModelId("sonnet"), { provider: "claude", model: "sonnet" });
  assert.deepEqual(parseModelId(undefined), { provider: "claude", model: undefined });
  assert.deepEqual(parseModelId("codex/"), { provider: "codex", model: undefined });
});

/** app-server 흉내. turn/start 를 받으면 미리 정한 알림을 순서대로 흘린다. */
function fakeServer(script: (threadId: string, turnId: string) => ServerNotification[]) {
  const listeners = new Map<string, Set<(n: ServerNotification) => void>>();
  const requests: { method: string; params: unknown }[] = [];
  const server = {
    subscribe(threadId: string, handler: (n: ServerNotification) => void) {
      let set = listeners.get(threadId);
      if (!set) listeners.set(threadId, (set = new Set()));
      set.add(handler);
      return () => void set.delete(handler);
    },
    async request(method: string, params: unknown) {
      requests.push({ method, params });
      if (method !== "turn/start") return {};
      const { threadId } = params as { threadId: string };
      const turnId = "turn-1";
      queueMicrotask(() => {
        for (const n of script(threadId, turnId))
          for (const h of listeners.get(threadId) ?? []) h(n);
      });
      return { turn: { id: turnId, status: "inProgress", error: null, durationMs: null } };
    },
  };
  return { server: server as unknown as CodexAppServer, requests };
}

/** assistant-stream 컨트롤러 흉내. 호출을 기록만 한다. */
function fakeController() {
  const log: string[] = [];
  const tools = new Map<string, { args: string; response?: unknown; closed: boolean }>();
  const controller = {
    appendText: (t: string) => void log.push(`text:${t}`),
    appendReasoning: (t: string) => void log.push(`reasoning:${t}`),
    appendData: (d: { name: string; data: unknown }) => void log.push(`data:${d.name}`),
    addToolCallPart: ({ toolCallId, toolName }: { toolCallId: string; toolName: string }) => {
      const slot = { args: "", closed: false } as { args: string; response?: unknown; closed: boolean };
      tools.set(toolCallId, slot);
      log.push(`tool:${toolName}`);
      return {
        argsText: { append: (s: string) => void (slot.args += s), close: () => undefined },
        setResponse: (r: unknown) => void (slot.response = r),
        close: () => void (slot.closed = true),
      };
    },
  };
  return { controller: controller as unknown as AssistantStreamController, log, tools };
}

test("Codex 브리지: 델타는 텍스트·사고 과정으로, ui 도구는 중계하고 결과를 붙이지 않는다", async () => {
  const { server, requests } = fakeServer((threadId, turnId) => [
    { method: "item/reasoning/summaryTextDelta", params: { threadId, turnId, itemId: "r1", delta: "생각" } },
    {
      method: "item/started",
      params: {
        threadId,
        turnId,
        item: { type: "mcpToolCall", id: "call_1", server: "ui", tool: "zoom", status: "inProgress", arguments: { steps: 2 }, result: null, error: null, durationMs: null },
      },
    },
    {
      method: "item/completed",
      params: {
        threadId,
        turnId,
        item: { type: "mcpToolCall", id: "call_1", server: "ui", tool: "zoom", status: "completed", arguments: { steps: 2 }, result: { content: [{ type: "text", text: "ok" }], structuredContent: null }, error: null, durationMs: 5 },
      },
    },
    {
      method: "item/started",
      params: { threadId, turnId, item: { type: "webSearch", id: "ws1", query: "RAG", action: null, results: null } },
    },
    {
      method: "item/completed",
      params: { threadId, turnId, item: { type: "webSearch", id: "ws1", query: "RAG", action: null, results: [{ title: "x" }] } },
    },
    { method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "m1", delta: "확대" } },
    { method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "m1", delta: "했다" } },
    { method: "item/completed", params: { threadId, turnId, item: { type: "agentMessage", id: "m1", text: "확대했다" } } },
    {
      method: "thread/tokenUsage/updated",
      params: { threadId, turnId, tokenUsage: { total: { totalTokens: 1, inputTokens: 1, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 }, last: { totalTokens: 10, inputTokens: 8, cachedInputTokens: 0, outputTokens: 2, reasoningOutputTokens: 0 } } },
    },
    { method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed", error: null, durationMs: 42 } } },
  ]);
  const relay = new Relay();
  const observed: string[] = [];
  const original = relay.observeCall.bind(relay);
  relay.observeCall = (call) => {
    observed.push(`${call.toolName}:${call.argsText}`);
    original(call);
  };
  const { controller, log, tools } = fakeController();

  await pipeCodexTurnToStream(
    { server, threadId: "t1", prompt: "확대", effort: "low", speed: "priority", relay },
    controller,
  );

  const start = requests.find((r) => r.method === "turn/start")!.params as Record<string, unknown>;
  assert.equal(start.effort, "low");
  assert.equal(start.serviceTierForTurn, "priority");
  assert.deepEqual(observed, ['zoom:{"steps":2}']);
  // 중계 도구: 이름은 서버 접두사 없이, 결과는 서버가 붙이지 않는다.
  assert.equal(tools.get("call_1")!.response, undefined);
  assert.equal(tools.get("call_1")!.closed, true);
  // 내장 웹 검색: 결과를 붙인다.
  assert.deepEqual(tools.get("ws1")!.response, { result: '[{"title":"x"}]', isError: false });
  // 텍스트는 델타만 반영한다(item/completed 의 전체 텍스트를 다시 붙이지 않는다).
  assert.deepEqual(
    log.filter((l) => !l.startsWith("data:")),
    ["reasoning:생각", "tool:zoom", "tool:WebSearch", "text:확대", "text:했다"],
  );
  assert.deepEqual(log.filter((l) => l.startsWith("data:")), ["data:usage"]);
});

test("Codex 브리지: 실패한 턴은 예외로, 중단은 turn/interrupt 로", async () => {
  const failing = fakeServer((threadId, turnId) => [
    { method: "turn/completed", params: { threadId, turn: { id: turnId, status: "failed", error: { message: "quota", additionalDetails: null }, durationMs: 1 } } },
  ]);
  await assert.rejects(
    pipeCodexTurnToStream({ server: failing.server, threadId: "t1", prompt: "x" }, fakeController().controller),
    /quota/,
  );

  const hanging = fakeServer(() => []);
  const abort = new AbortController();
  const run = pipeCodexTurnToStream(
    { server: hanging.server, threadId: "t2", prompt: "x", signal: abort.signal },
    fakeController().controller,
  );
  await new Promise((r) => setTimeout(r, 10));
  abort.abort();
  await assert.rejects(run, /중단/);
  assert.ok(hanging.requests.some((r) => r.method === "turn/interrupt"));
});
