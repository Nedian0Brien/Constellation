import { z, type ZodType } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

/**
 * 도구 중계.
 *
 * 서버는 지도도 데이터도 모른다. 클라이언트(assistant-ui)가 요청마다 보내는
 * 도구 목록(JSON 스키마)으로 SDK MCP 서버 `ui` 를 만들고, 모델이 도구를
 * 부르면 핸들러는 웹뷰가 `POST /api/agent/tool-result` 로 돌려주는 결과를
 * 기다렸다가 모델에 넘긴다. 실행은 전부 웹뷰에서 일어난다.
 *
 * 짝짓기: MCP 핸들러는 `tool_use.id` 를 받지 못한다. 브리지가 스트림에서 본
 * `tool_use.id`·이름·최종 인자를 `observeCall` 로 넘기고, 핸들러는 이름과
 * 정규화한 인자가 같은 호출을 찾는다. 같은 이름·같은 인자가 여럿이면
 * 먼저 관찰된 것부터 쓴다(FIFO).
 */

export const SERVER_NAME = "ui";

/** 이 서버가 받아들이는 JSON 스키마 부분집합 */
export type JsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: unknown;
};

export type ToolManifest = Record<
  string,
  { description?: string; parameters: JsonSchema }
>;

export class UnsupportedSchemaError extends Error {
  constructor(path: string, reason: string) {
    super(`지원하지 않는 도구 스키마 (${path}): ${reason}`);
    this.name = "UnsupportedSchemaError";
  }
}

/** JSON 스키마 한 노드를 zod 타입으로. 부분집합 밖이면 던진다. */
export function schemaToZod(schema: JsonSchema, path = "$"): ZodType {
  const type = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== "null")
    : schema.type;
  let out: ZodType;
  if (schema.enum) {
    const values = schema.enum;
    if (!values.every((v): v is string => typeof v === "string"))
      throw new UnsupportedSchemaError(path, "enum 은 문자열만");
    if (values.length === 0)
      throw new UnsupportedSchemaError(path, "빈 enum");
    out = z.enum(values as [string, ...string[]]);
  } else if (type === "string") out = z.string();
  else if (type === "number") out = z.number();
  else if (type === "integer") out = z.number().int();
  else if (type === "boolean") out = z.boolean();
  else if (type === "array") {
    if (!schema.items) throw new UnsupportedSchemaError(path, "items 없는 배열");
    out = z.array(schemaToZod(schema.items, `${path}[]`));
  } else if (type === "object" || (type === undefined && schema.properties)) {
    out = z.object(schemaToShape(schema, path));
  } else {
    throw new UnsupportedSchemaError(path, `type=${String(type)}`);
  }
  if (Array.isArray(schema.type) && schema.type.includes("null"))
    out = out.nullable();
  return schema.description ? out.describe(schema.description) : out;
}

/** 객체 스키마를 `createSdkMcpServer` 가 받는 raw shape 으로 */
export function schemaToShape(
  schema: JsonSchema,
  path = "$",
): Record<string, ZodType> {
  const required = new Set(schema.required ?? []);
  const shape: Record<string, ZodType> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const field = schemaToZod(prop, `${path}.${key}`);
    shape[key] = required.has(key) ? field : field.optional();
  }
  return shape;
}

/** 인자를 키 순서에 무관하게 같은 문자열로 */
export function canonicalArgs(args: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, sort(val)]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(args));
}

export type ToolResult = { result: unknown; isError?: boolean };

type ObservedCall = { toolUseId: string; toolName: string; key: string | null };

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export type RelayOptions = {
  /** 클라이언트 결과를 기다리는 한도. 지나면 모델에 오류 결과를 돌려준다 */
  resultTimeoutMs?: number;
  /** 브리지가 호출을 관찰할 때까지 기다리는 한도 */
  matchTimeoutMs?: number;
};

/**
 * 요청 하나의 중계 상태. `observeCall` 은 브리지가, `resolve` 는
 * tool-result 라우트가, `waitFor` 는 MCP 핸들러가 부른다.
 */
export class Relay {
  private observed: ObservedCall[] = [];
  private matchWaiters: {
    toolName: string;
    key: string;
    d: Deferred<string>;
  }[] = [];
  private results = new Map<string, ToolResult>();
  private resultWaiters = new Map<string, Deferred<ToolResult>>();
  private aborted: Error | null = null;
  private readonly resultTimeoutMs: number;
  private readonly matchTimeoutMs: number;

  constructor(options: RelayOptions = {}) {
    this.resultTimeoutMs = options.resultTimeoutMs ?? 60_000;
    this.matchTimeoutMs = options.matchTimeoutMs ?? 10_000;
  }

  /** 브리지: 모델이 낸 tool_use 의 id·이름·인자 */
  observeCall(call: { toolUseId: string; toolName: string; argsText: string }) {
    let key: string | null = null;
    try {
      key = canonicalArgs(JSON.parse(call.argsText || "{}"));
    } catch {
      key = null;
    }
    const waiter = this.matchWaiters.findIndex(
      (w) => w.toolName === call.toolName && (key === null || w.key === key),
    );
    if (waiter >= 0) {
      const [w] = this.matchWaiters.splice(waiter, 1);
      w!.d.resolve(call.toolUseId);
      return;
    }
    this.observed.push({ toolUseId: call.toolUseId, toolName: call.toolName, key });
  }

  /** tool-result 라우트: 웹뷰가 실행한 결과 */
  resolve(toolUseId: string, result: ToolResult): boolean {
    const waiter = this.resultWaiters.get(toolUseId);
    if (waiter) {
      this.resultWaiters.delete(toolUseId);
      waiter.resolve(result);
      return true;
    }
    this.results.set(toolUseId, result);
    return false;
  }

  /** MCP 핸들러: 이름·인자로 호출을 찾고 결과를 기다린다 */
  async waitFor(toolName: string, args: unknown): Promise<ToolResult> {
    if (this.aborted) throw this.aborted;
    const toolUseId = await this.match(toolName, canonicalArgs(args));
    // match 가 즉시 풀려도 await 는 한 틱 뒤에 이어지므로, 그 사이에 abort 가
    // 왔으면 대기자를 등록하지 않는다.
    const abortedMeanwhile = this.abortReason();
    if (abortedMeanwhile)
      return { result: abortedMeanwhile.message, isError: true };
    const ready = this.results.get(toolUseId);
    if (ready) {
      this.results.delete(toolUseId);
      return ready;
    }
    const d = deferred<ToolResult>();
    this.resultWaiters.set(toolUseId, d);
    const timer = setTimeout(() => {
      if (this.resultWaiters.delete(toolUseId))
        d.resolve({
          result: `웹뷰가 ${this.resultTimeoutMs / 1000}초 안에 결과를 돌려주지 않았습니다.`,
          isError: true,
        });
    }, this.resultTimeoutMs);
    try {
      return await d.promise;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 제어 흐름 분석이 await 너머까지 null 로 좁히지 않도록 메서드로 읽는다 */
  private abortReason(): Error | null {
    return this.aborted;
  }

  private match(toolName: string, key: string): Promise<string> {
    // 인자가 같은 것 → 인자를 못 읽은 것(key null) → 같은 이름 중 먼저 온 것.
    // 마지막 갈래는 zod 가 모르는 키를 떼어 내 인자가 달라 보이는 경우를 받는다.
    let i = this.observed.findIndex(
      (o) => o.toolName === toolName && o.key === key,
    );
    if (i < 0)
      i = this.observed.findIndex((o) => o.toolName === toolName && o.key === null);
    if (i < 0) i = this.observed.findIndex((o) => o.toolName === toolName);
    if (i >= 0) {
      const [o] = this.observed.splice(i, 1);
      return Promise.resolve(o!.toolUseId);
    }
    const d = deferred<string>();
    const entry = { toolName, key, d };
    this.matchWaiters.push(entry);
    const timer = setTimeout(() => {
      const idx = this.matchWaiters.indexOf(entry);
      if (idx >= 0) {
        this.matchWaiters.splice(idx, 1);
        d.reject(
          new Error(`도구 호출 ${toolName} 을 스트림에서 찾지 못했습니다.`),
        );
      }
    }, this.matchTimeoutMs);
    return d.promise.finally(() => clearTimeout(timer));
  }

  /** 요청이 끊기면 기다리는 핸들러를 전부 깨운다 */
  abort(reason = "요청이 중단됐습니다.") {
    this.aborted = new Error(reason);
    for (const w of this.matchWaiters) w.d.reject(this.aborted);
    this.matchWaiters = [];
    for (const [id, w] of this.resultWaiters) {
      this.resultWaiters.delete(id);
      w.resolve({ result: reason, isError: true });
    }
  }
}

/** MCP `CallToolResult` 로 */
function toCallToolResult(r: ToolResult) {
  const text =
    typeof r.result === "string" ? r.result : JSON.stringify(r.result ?? null);
  return {
    content: [{ type: "text" as const, text }],
    ...(r.isError ? { isError: true } : {}),
  };
}

/**
 * 클라이언트 도구 목록으로 SDK MCP 서버를 만든다. 스키마가 부분집합 밖이면
 * `UnsupportedSchemaError` 를 던진다 — 라우트가 400 으로 바꾼다.
 */
export function createRelayServer(manifest: ToolManifest, relay: Relay) {
  const tools = Object.entries(manifest).map(([name, def]) =>
    tool(
      name,
      def.description ?? name,
      schemaToShape(def.parameters, name),
      async (args) => toCallToolResult(await relay.waitFor(name, args)),
    ),
  );
  return {
    server: createSdkMcpServer({
      name: SERVER_NAME,
      version: "0.1.0",
      tools,
      // 클라이언트 결과 대기(60초)보다 길어야 SDK 가 먼저 끊지 않는다.
      timeout: 90_000,
    }),
    allowedTools: Object.keys(manifest).map((n) => `mcp__${SERVER_NAME}__${n}`),
  };
}
