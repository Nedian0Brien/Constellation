import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  SERVER_NAME,
  schemaToShape,
  type Relay,
  type ToolManifest,
  type ToolResult,
} from "./relay.ts";

/**
 * Codex 용 웹뷰 도구 중계 — streamable HTTP MCP 엔드포인트.
 *
 * Claude 는 SDK 가 프로세스 안에서 MCP 서버(`createSdkMcpServer`)를 띄워 주지만,
 * `codex app-server` 는 별도 프로세스라 URL 로 붙어야 한다. 세션마다
 * `/mcp/<sessionId>` 를 열고 `thread/start` 의 `config.mcp_servers.ui.url` 로
 * 넘긴다. 도구 정의는 그 세션의 manifest 로 만들고, 핸들러는 Claude 와 같은
 * `Relay.waitFor` 를 부른다 — 실행은 전부 웹뷰에서 일어난다.
 *
 * 요청마다 서버·전송을 새로 만든다(stateless). codex 는 스레드를 열 때 도구
 * 목록을 읽고 호출마다 POST 하므로 세션 상태를 여기 둘 필요가 없다.
 */

export type RelayEntry = { relay: Relay; manifest: ToolManifest };

function toCallToolResult(r: ToolResult) {
  const text =
    typeof r.result === "string" ? r.result : JSON.stringify(r.result ?? null);
  return {
    content: [{ type: "text" as const, text }],
    ...(r.isError ? { isError: true } : {}),
  };
}

export function createUiMcpServer(entry: RelayEntry): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: "0.1.0" });
  for (const [name, def] of Object.entries(entry.manifest)) {
    server.registerTool(
      name,
      {
        description: def.description ?? name,
        inputSchema: schemaToShape(def.parameters, name),
        // codex 는 approvalPolicy never 에서 readOnlyHint 없는 MCP 도구를 승인
        // 대상으로 보고 그냥 거부한다. 웹뷰 도구는 읽기·화면 조작뿐이다.
        annotations: { readOnlyHint: true },
      },
      async (args) => toCallToolResult(await entry.relay.waitFor(name, args)),
    );
  }
  return server;
}

/** Hono 핸들러가 부른다. 세션에 진행 중인 턴이 없으면 404 다. */
export async function handleMcpRequest(
  entry: RelayEntry | undefined,
  req: Request,
): Promise<Response> {
  if (!entry) {
    return Response.json(
      { error: "이 세션에 진행 중인 턴이 없습니다." },
      { status: 404 },
    );
  }
  const server = createUiMcpServer(entry);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // 응답을 다 쓴 뒤 닫는다. JSON 응답 모드라 스트림이 남지 않는다.
    void transport.close().catch(() => undefined);
  }
}
