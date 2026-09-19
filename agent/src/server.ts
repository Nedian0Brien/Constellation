import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { getSessionInfo, query } from "@anthropic-ai/claude-agent-sdk";
import { createAssistantStreamResponse } from "assistant-stream";
import { pipeAgentToStream } from "./bridge.ts";
import {
  CODEX_THREAD_CONFIG,
  getCodexAppServer,
} from "./codex/app-server.ts";
import { pipeCodexTurnToStream } from "./codex/bridge.ts";
import type { ReasoningEffort, ThreadResponse } from "./codex/protocol.ts";
import { handleMcpRequest, type RelayEntry } from "./mcp-endpoint.ts";
import { listModels, parseModelId } from "./models.ts";
import {
  Relay,
  UnsupportedSchemaError,
  createRelayServer,
  type ToolManifest,
} from "./relay.ts";
import {
  isUuid,
  lastUserText,
  type ChatRequest,
  type ToolResultRequest,
} from "./session.ts";

/**
 * Constellation 에이전트 서버.
 *
 * agent-chat-framework 의 `src/app/api/agent/route.ts` 를 Vite 앱 밖의 Node
 * 프로세스로 옮긴 것이다. 본문 `modelName` 접두사로 백엔드를 고른다.
 *
 * - `claude/…`(또는 없음): Claude Agent SDK. `claude` CLI 를 로컬 프로세스로
 *   띄우므로 기계에 Claude 로그인 또는 `ANTHROPIC_API_KEY` 가 있어야 한다.
 * - `codex/…`: `codex app-server`. 이 기계의 codex 로그인을 읽는다.
 *
 * - `POST /api/agent`             assistant-ui 데이터 스트림
 * - `POST /api/agent/tool-result` 웹뷰가 실행한 도구 결과
 * - `GET  /api/agent/models`      프로바이더별 모델 카탈로그
 * - `GET  /api/agent/health`
 * - `*    /mcp/:sessionId`        Codex 가 붙는 웹뷰 도구 MCP 엔드포인트
 */

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8787);
/** 코퍼스 밖을 볼 때 쓰는 Agent SDK 내장 도구. `claude` 프로세스 안에서 돈다. */
const WEB_TOOLS = ["WebSearch", "WebFetch"];
/**
 * 세션 파일은 `~/.claude/projects/<cwd 해시>/` 아래에 놓인다. 서버를 어느
 * 폴더에서 띄우든 같은 세션을 다시 찾으려면 cwd 가 고정돼야 한다.
 */
const CWD = path.resolve(import.meta.dirname, "..");
/**
 * 브라우저는 Vite 프록시를 거쳐 같은 출처로 오지만, 데스크톱 앱의 웹뷰는
 * `tauri://localhost`(macOS·Linux)·`http://tauri.localhost`(Windows)에서
 * 이 서버를 직접 부른다. `tauri dev` 는 Vite 출처(`http://localhost:5173`)다.
 * 출처: Tauri 2 문서 security/http-headers, migrate/from-tauri-1.
 */
const ALLOWED_ORIGINS = /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

const DEFAULT_SYSTEM =
  "당신은 Constellation 연구 지도 앱의 에이전트다. 한국어로 간결하게 답한다.";

/** 진행 중인 요청의 중계 상태. 세션 하나에 요청 하나만 돈다. */
const relays = new Map<string, RelayEntry>();

type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

const app = new Hono();
app.use(logger());
app.use(
  "/api/agent/*",
  cors({ origin: (origin) => (ALLOWED_ORIGINS.test(origin) ? origin : null) }),
);
app.use(
  "/api/agent",
  cors({ origin: (origin) => (ALLOWED_ORIGINS.test(origin) ? origin : null) }),
);

app.get("/api/agent/health", (c) => c.json({ ok: true, cwd: CWD }));

app.get("/api/agent/models", async (c) => c.json(await listModels()));

// codex 프로세스가 직접 부른다. 브라우저 출처가 아니므로 CORS 가 필요 없다.
app.all("/mcp/:sessionId", (c) =>
  handleMcpRequest(relays.get(c.req.param("sessionId")), c.req.raw),
);

app.post("/api/agent", async (c) => {
  const body = (await c.req.json().catch(() => null)) as ChatRequest | null;
  if (!body) return c.json({ error: "본문이 JSON 이 아닙니다." }, 400);
  const prompt = lastUserText(body.messages);
  if (!prompt.trim()) return c.json({ error: "빈 메시지" }, 400);
  if (!isUuid(body.sessionId))
    return c.json({ error: "sessionId 는 UUID 여야 합니다." }, 400);
  if (body.codexThreadId !== undefined && !isUuid(body.codexThreadId))
    return c.json({ error: "codexThreadId 는 UUID 여야 합니다." }, 400);
  const sessionId = body.sessionId;
  const manifest = (body.tools ?? {}) as ToolManifest;
  const { provider, model } = parseModelId(body.modelName);

  const relay = new Relay();
  let mcp: ReturnType<typeof createRelayServer> | undefined;
  if (provider === "claude") {
    try {
      mcp = createRelayServer(manifest, relay);
    } catch (error) {
      if (error instanceof UnsupportedSchemaError)
        return c.json({ error: error.message }, 400);
      throw error;
    }
  }

  const abort = new AbortController();
  const onClientAbort = () => {
    relay.abort();
    abort.abort();
  };
  c.req.raw.signal.addEventListener("abort", onClientAbort, { once: true });
  relays.get(sessionId)?.relay.abort("같은 세션에 새 요청이 왔습니다.");
  const entry: RelayEntry = { relay, manifest };
  relays.set(sessionId, entry);

  const finish = () => {
    c.req.raw.signal.removeEventListener("abort", onClientAbort);
    relay.abort("턴이 끝났습니다.");
    if (relays.get(sessionId) === entry) relays.delete(sessionId);
  };

  if (provider === "codex") {
    return createAssistantStreamResponse(async (controller) => {
      try {
        await codexTurn(controller, body, prompt, model, relay, abort.signal);
      } catch (error) {
        if (!abort.signal.aborted) {
          controller.appendText(
            `\n\n오류: ${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }
      } finally {
        finish();
      }
    });
  }

  // 사용자 메시지 수로 첫 턴을 판별하면 실패한 첫 턴을 다시 보낼 때
  // 없는 세션을 resume 하게 된다. 세션 파일이 있는지로 가른다.
  const existing = await getSessionInfo(sessionId, { dir: CWD }).catch(
    () => undefined,
  );
  const effort = body.reasoningEffort as ClaudeEffort | undefined;
  // 선택기가 고른 모델이 우선이고, 없으면 환경 변수, 그것도 없으면 SDK 기본값.
  const claudeModel = model ?? process.env.CONSTELLATION_AGENT_MODEL;

  return createAssistantStreamResponse(async (controller) => {
    const stream = query({
      prompt,
      options: {
        cwd: CWD,
        abortController: abort,
        // 토큰이 도착하는 대로 그리려면 부분 메시지가 필요하다.
        includePartialMessages: true,
        // 사고 과정을 화면에 보여준다.
        thinking: { type: "adaptive", display: "summarized" },
        ...(existing ? { resume: sessionId } : { sessionId }),
        systemPrompt: body.system?.trim() || DEFAULT_SYSTEM,
        // 내장 도구는 웹 둘만 연다. 파일·셸 도구는 없고, 나머지 도구는 웹뷰가
        // 준 것뿐이다. permissionMode 가 default 라 allowedTools 에 없으면
        // 승인을 기다리다 멈추므로 두 이름을 같이 넣는다.
        tools: WEB_TOOLS,
        mcpServers: { ui: mcp!.server },
        allowedTools: [...mcp!.allowedTools, ...WEB_TOOLS],
        permissionMode: "default",
        ...(claudeModel ? { model: claudeModel } : {}),
        ...(effort ? { effort } : {}),
        // fast mode 는 settings 로만 켤 수 있다. settingSources 가 비어 있어도
        // 이 객체는 적용된다(system/init.fast_mode_state 로 확인).
        ...(body.speed === "fast" ? { settings: { fastMode: true } } : {}),
        // SDK 격리 모드. 비우지 않으면 이 서버를 돌리는 사람의 ~/.claude
        // 설정과 MCP 서버가 그대로 딸려 들어온다.
        settingSources: [],
        strictMcpConfig: true,
      },
    });

    try {
      await pipeAgentToStream(stream, controller, {
        onRelayCall: (call) => relay.observeCall(call),
      });
    } catch (error) {
      if (!abort.signal.aborted) {
        controller.appendText(
          `\n\n오류: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    } finally {
      finish();
    }
  });
});

/**
 * Codex 턴. 스레드가 없으면 `thread/start`, 있으면 `thread/resume`. 웹뷰 도구는
 * `/mcp/<sessionId>` 로 노출한 `ui` 서버를 스레드 설정에 넣어 붙인다.
 */
async function codexTurn(
  controller: Parameters<Parameters<typeof createAssistantStreamResponse>[0]>[0],
  body: ChatRequest,
  prompt: string,
  model: string | undefined,
  relay: Relay,
  signal: AbortSignal,
) {
  const server = getCodexAppServer();
  const common = {
    ...(model ? { model } : {}),
    approvalPolicy: "never" as const,
    sandbox: "read-only" as const,
    config: {
      ...CODEX_THREAD_CONFIG,
      mcp_servers: {
        // 승인 없이 돌리는 조건은 mcp-endpoint.ts 의 readOnlyHint 다.
        ui: { url: `http://${HOST}:${PORT}/mcp/${body.sessionId}` },
      },
    },
    developerInstructions: body.system?.trim() || DEFAULT_SYSTEM,
  };
  const thread = body.codexThreadId
    ? await server.request<ThreadResponse>("thread/resume", {
        threadId: body.codexThreadId,
        excludeTurns: true,
        ...common,
      })
    : await server.request<ThreadResponse>("thread/start", {
        cwd: CWD,
        ...common,
      });

  controller.appendData({
    type: "data",
    name: "session",
    data: {
      provider: "codex",
      sessionId: body.sessionId ?? null,
      codexThreadId: thread.thread.id,
      model: thread.model,
      cwd: CWD,
      permissionMode: "read-only",
      tools: ["web_search", ...Object.keys(body.tools ?? {})],
    },
  });

  await pipeCodexTurnToStream(
    {
      server,
      threadId: thread.thread.id,
      prompt,
      ...(model ? { model } : {}),
      ...(body.reasoningEffort
        ? { effort: body.reasoningEffort as ReasoningEffort }
        : {}),
      ...(body.speed ? { speed: body.speed } : {}),
      signal,
      relay,
    },
    controller,
  );
}

app.post("/api/agent/tool-result", async (c) => {
  const body = (await c.req.json().catch(() => null)) as ToolResultRequest | null;
  if (!body || !isUuid(body.sessionId) || typeof body.toolCallId !== "string")
    return c.json({ error: "sessionId 와 toolCallId 가 필요합니다." }, 400);
  const entry = relays.get(body.sessionId);
  if (!entry)
    return c.json({ error: "이 세션에 진행 중인 턴이 없습니다." }, 404);
  const delivered = entry.relay.resolve(body.toolCallId, {
    result: body.result ?? null,
    isError: body.isError === true,
  });
  return c.json({ ok: true, delivered });
});

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(
    `constellation-agent  http://${HOST}:${info.port}/api/agent  (cwd ${CWD})`,
  );
});
