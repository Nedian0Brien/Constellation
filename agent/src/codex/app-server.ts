import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { ServerNotification, ServerRequest } from "./protocol.ts";

/**
 * NOTE(constellation): agent-chat-framework 의 `src/lib/agent/codex/app-server.ts`
 * 를 옮긴 것이다. 다른 점은 기본 `CODEX_HOME` 이 `agent/.codex-home` 이고
 * (사이드카에서는 `CODEX_ISOLATED_HOME` 으로 앱 데이터 폴더를 준다) 클라이언트
 * 이름이 `constellation` 인 것뿐이다.
 *
 * `codex app-server` 프로세스 하나를 서버 수명 동안 붙들고 JSON-RPC 로 말한다.
 *
 * - 요청은 `id` 를 붙여 stdin 에 한 줄씩 쓰고, 같은 `id` 의 응답을 기다린다.
 * - 알림(`id` 없음)은 `threadId` 로 구독자를 찾아 넘긴다. 스레드 여럿이 한
 *   프로세스를 나눠 쓰므로 여기서 갈라 주어야 브리지가 남의 스레드 이벤트를
 *   받지 않는다.
 * - 서버 요청(`id` 와 `method` 가 같이 옴)은 토큰 갱신만 답하고 나머지(승인
 *   등)는 거절한다. `approvalPolicy: never` 로 잠그므로 오지 않아야 하지만,
 *   오면 프로세스가 답을 기다리다 멈추기 때문에 막아 둔다.
 * - 프로세스가 죽으면 대기 중인 요청과 구독을 모두 오류로 끝내고, 다음
 *   `ready()` 에서 다시 띄운다.
 *
 * ## 격리 — Claude 의 `settingSources: []` 에 해당
 *
 * app-server 는 `$CODEX_HOME/config.toml` 을 읽어 그 기계의 MCP 서버·플러그인을
 * 스레드마다 띄운다. `thread/start.config` 로 `mcp_servers` 를 비워도, `-c` 로
 * 덮어도 테이블이 병합만 되어 빠지지 않는다(2026-09-19 확인 — 원격 플러그인
 * `build-ios-apps@openai-curated-remote` 의 MCP 서버까지 붙었다). 그래서
 * `CODEX_HOME` 을 이 서버 전용 폴더로 바꿔 사용자 설정을 아예 읽지 않는다.
 *
 * 로그인은 사용자의 `~/.codex/auth.json` 을 **읽기만** 해서 access token 을
 * `account/login/start { type: "chatgptAuthTokens" }` 로 넘긴다. 파일을
 * 심볼릭 링크로 나눠 쓰면 app-server 가 토큰을 갱신할 때 링크를 파일로
 * 바꿔 두 사본이 갈라지고, refresh token 이 회전하면 한쪽 로그인이 깨진다.
 * 토큰이 만료되면 app-server 가 `account/chatgptAuthTokens/refresh` 를
 * 요청하고, 그때 파일을 다시 읽어 준다. 갱신 자체는 사용자의 codex 가 한다
 * (access token 수명 10일).
 *
 * `codex exec --json` 을 쓰지 않는 이유: 완성된 메시지만 주고 토큰 단위
 * 델타가 없다. app-server 의 `item/agentMessage/delta` 만 스트리밍이 된다.
 */

/** 모든 스레드에 얹는 설정. ChatGPT 앱 커넥터(`codex_apps`, 도구 339개)를 끄고 웹 검색을 켠다. */
export const CODEX_THREAD_CONFIG = {
  features: { apps: false },
  web_search: "live",
} as const;

export type CodexAppServerOptions = {
  /** `codex` 실행 파일. 기본은 PATH 의 `codex` 또는 `CODEX_PATH`. */
  executable?: string;
  /** 이 서버 전용 `CODEX_HOME`. 기본 `<cwd>/.codex-home`. */
  home?: string;
  /** 사용자의 codex 로그인 파일. 기본 `~/.codex/auth.json`. */
  authFile?: string;
  clientName?: string;
};

type AuthFile = {
  auth_mode?: string;
  OPENAI_API_KEY?: string | null;
  tokens?: { access_token?: string; account_id?: string } | null;
};

export class CodexAppServer {
  private proc: ChildProcess | undefined;
  private starting: Promise<void> | undefined;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly listeners = new Map<
    string,
    Set<(notification: ServerNotification) => void>
  >();

  private readonly executable: string;
  private readonly home: string;
  private readonly authFile: string;
  private readonly clientName: string;

  constructor(options: CodexAppServerOptions = {}) {
    this.executable = options.executable ?? process.env.CODEX_PATH ?? "codex";
    this.home =
      options.home ??
      process.env.CODEX_ISOLATED_HOME ??
      path.join(import.meta.dirname, "..", "..", ".codex-home");
    this.authFile =
      options.authFile ??
      process.env.CODEX_AUTH_FILE ??
      path.join(os.homedir(), ".codex", "auth.json");
    this.clientName = options.clientName ?? "constellation";
  }

  /** 프로세스를 띄우고 `initialize` 를 마친다. 이미 떠 있으면 바로 돌아온다. */
  ready(): Promise<void> {
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      return this.starting ?? Promise.resolve();
    }
    this.starting = this.start().catch((error) => {
      this.starting = undefined;
      throw error;
    });
    return this.starting;
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    await this.ready();
    return this.send<T>(method, params);
  }

  /**
   * 스레드의 알림을 받는다. `thread/started` 처럼 `params.thread.id` 로 오는
   * 것도 같은 키로 전달된다. 반환값으로 구독을 끊는다.
   */
  subscribe(
    threadId: string,
    handler: (notification: ServerNotification) => void,
  ): () => void {
    let set = this.listeners.get(threadId);
    if (!set) {
      set = new Set();
      this.listeners.set(threadId, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(threadId);
    };
  }

  private send<T>(method: string, params?: unknown): Promise<T> {
    const proc = this.proc;
    if (!proc?.stdin?.writable) {
      return Promise.reject(new Error("codex app-server 가 떠 있지 않습니다."));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      proc.stdin!.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) +
          "\n",
      );
    });
  }

  private async start(): Promise<void> {
    fs.mkdirSync(this.home, { recursive: true });
    const proc = spawn(this.executable, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CODEX_HOME: this.home },
    });
    this.proc = proc;

    const spawned = new Promise<void>((resolve, reject) => {
      proc.once("spawn", () => resolve());
      proc.once("error", (error) => reject(this.describeSpawnError(error)));
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      // app-server 는 진단을 stderr 로 쓴다. 조용히 삼키면 왜 멈췄는지 알 수 없다.
      const text = chunk.toString().trim();
      if (text) console.warn("[codex app-server]", text);
    });

    readline
      .createInterface({ input: proc.stdout! })
      .on("line", (line) => this.onLine(line));

    proc.once("exit", (code, signal) => {
      if (this.proc !== proc) return;
      this.proc = undefined;
      this.starting = undefined;
      const error = new Error(
        `codex app-server 가 종료됐습니다 (code ${code ?? "?"}, signal ${signal ?? "-"}).`,
      );
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
      for (const [threadId, set] of this.listeners) {
        for (const handler of set) {
          handler({
            method: "error",
            params: {
              threadId,
              turnId: "",
              error: { message: error.message, additionalDetails: null },
              willRetry: false,
            },
          });
        }
      }
      this.listeners.clear();
    });

    await spawned;
    await this.send("initialize", {
      clientInfo: { name: this.clientName, title: null, version: "0.1.0" },
      // serviceTierForTurn 등 새 필드는 experimental 로 잠겨 있다.
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    // 알림이므로 id 없이 보낸다.
    proc.stdin!.write(
      JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} }) +
        "\n",
    );
    await this.send("account/login/start", this.loginParams());
  }

  /** `~/.codex/auth.json` 을 읽어 로그인 파라미터를 만든다. 쓰지 않는다. */
  private readAuth(): AuthFile {
    let raw: string;
    try {
      raw = fs.readFileSync(this.authFile, "utf8");
    } catch {
      throw new Error(
        `codex 로그인 정보(${this.authFile})가 없습니다. \`codex login\` 을 먼저 하세요.`,
      );
    }
    return JSON.parse(raw) as AuthFile;
  }

  private loginParams():
    | { type: "apiKey"; apiKey: string }
    | { type: "chatgptAuthTokens"; accessToken: string; chatgptAccountId: string } {
    const auth = this.readAuth();
    if (auth.OPENAI_API_KEY) return { type: "apiKey", apiKey: auth.OPENAI_API_KEY };
    const tokens = auth.tokens;
    if (tokens?.access_token && tokens.account_id) {
      return {
        type: "chatgptAuthTokens",
        accessToken: tokens.access_token,
        chatgptAccountId: tokens.account_id,
      };
    }
    throw new Error(
      `codex 로그인 정보(${this.authFile})에 토큰이 없습니다. \`codex login\` 을 다시 하세요.`,
    );
  }

  private describeSpawnError(error: NodeJS.ErrnoException): Error {
    if (error.code === "ENOENT") {
      return new Error(
        `\`${this.executable}\` 를 찾지 못했습니다. codex CLI 를 설치하고 로그인하거나 CODEX_PATH 를 지정하세요.`,
      );
    }
    return error;
  }

  private onLine(line: string) {
    let message: {
      id?: number | string;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: { code?: number; message?: string; data?: unknown };
    };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    // 응답
    if (message.id !== undefined && message.method === undefined) {
      const waiter =
        typeof message.id === "number" ? this.pending.get(message.id) : undefined;
      if (!waiter) return;
      this.pending.delete(message.id as number);
      if (message.error) {
        waiter.reject(
          new Error(
            `${message.error.message ?? "app-server 오류"}${
              message.error.data ? ` — ${JSON.stringify(message.error.data)}` : ""
            }`,
          ),
        );
      } else {
        waiter.resolve(message.result);
      }
      return;
    }

    // 서버 요청. 토큰 갱신만 답하고 나머지(승인 등)는 거절한다.
    if (message.id !== undefined && message.method !== undefined) {
      const request = message as ServerRequest;
      if (request.method === "account/chatgptAuthTokens/refresh") {
        let result: unknown;
        let error: { code: number; message: string } | undefined;
        try {
          const login = this.loginParams();
          if (login.type !== "chatgptAuthTokens") throw new Error("ChatGPT 토큰이 아닙니다.");
          result = {
            accessToken: login.accessToken,
            chatgptAccountId: login.chatgptAccountId,
            chatgptPlanType: null,
          };
        } catch (e) {
          error = { code: -32000, message: e instanceof Error ? e.message : String(e) };
        }
        this.proc?.stdin?.write(
          JSON.stringify({ jsonrpc: "2.0", id: request.id, ...(error ? { error } : { result }) }) +
            "\n",
        );
        return;
      }
      this.proc?.stdin?.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32601,
            message: `이 클라이언트는 ${request.method} 에 답하지 않습니다.`,
          },
        }) + "\n",
      );
      return;
    }

    // 알림
    if (message.method === undefined) return;
    const notification = message as ServerNotification;
    const params = notification.params as
      | { threadId?: string; thread?: { id?: string } }
      | undefined;
    const threadId = params?.threadId ?? params?.thread?.id;
    if (!threadId) return;
    const set = this.listeners.get(threadId);
    if (!set) return;
    for (const handler of set) handler(notification);
  }
}

let singleton: CodexAppServer | undefined;

export function getCodexAppServer(): CodexAppServer {
  singleton ??= new CodexAppServer();
  return singleton;
}
