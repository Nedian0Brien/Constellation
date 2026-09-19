/**
 * `codex app-server` JSON-RPC 프로토콜 가운데 이 프레임워크가 쓰는 부분.
 *
 * 전체 타입은 `codex app-server generate-ts --out <dir>` 로 뽑을 수 있다
 * (codex-cli 0.155.0-alpha.2.6, 2026-09-19). 여기에는 그 출력에서 실제로
 * 읽고 쓰는 필드만 옮겼다. 프로토콜이 experimental 이라 새 필드는 무시하고
 * 없는 필드는 `null` 로 온다고 가정한다.
 */

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra";

/** `model/list` 의 한 행. */
export type CodexModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportedReasoningEfforts: { reasoningEffort: ReasoningEffort; description: string }[];
  defaultReasoningEffort: ReasoningEffort;
  /** speed 티어. 이 기계에서는 `{ id: "priority", name: "Fast" }` 하나다. */
  serviceTiers: { id: string; name: string; description: string }[];
  defaultServiceTier: string | null;
  isDefault: boolean;
};

export type ModelListResponse = { data: CodexModel[]; nextCursor: string | null };

export type ThreadStartParams = {
  model?: string | null;
  cwd?: string | null;
  approvalPolicy?: "untrusted" | "on-request" | "never" | null;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access" | null;
  /** `~/.codex/config.toml` 위에 얹는 값. 키는 config.toml 의 키 그대로. */
  config?: Record<string, unknown> | null;
  developerInstructions?: string | null;
  ephemeral?: boolean | null;
};

export type ThreadResumeParams = {
  threadId: string;
  model?: string | null;
  approvalPolicy?: ThreadStartParams["approvalPolicy"];
  sandbox?: ThreadStartParams["sandbox"];
  config?: Record<string, unknown> | null;
  developerInstructions?: string | null;
  excludeTurns?: boolean;
};

export type ThreadResponse = {
  thread: { id: string; sessionId: string };
  model: string;
  modelProvider: string;
  serviceTier: string | null;
  reasoningEffort: ReasoningEffort | null;
};

export type UserInput = { type: "text"; text: string };

export type TurnStartParams = {
  threadId: string;
  input: UserInput[];
  /** 이 턴과 이후 턴의 모델. */
  model?: string | null;
  /** 이 턴과 이후 턴의 effort. */
  effort?: ReasoningEffort | null;
  /**
   * 이 턴에만 적용하는 speed 티어. `"default"` 가 표준 속도, 생략하면 스레드
   * 티어를 따른다. `serviceTier` 는 스레드에 남으므로 쓰지 않는다.
   */
  serviceTierForTurn?: string | null;
  summary?: "auto" | "concise" | "detailed" | "none" | null;
};

export type TurnStatus = "completed" | "interrupted" | "failed" | "inProgress";

export type TurnError = { message: string; additionalDetails: string | null };

export type Turn = {
  id: string;
  status: TurnStatus;
  error: TurnError | null;
  durationMs: number | null;
};

export type TurnStartResponse = { turn: Turn };

/** `item/started`·`item/completed` 가 실어 오는 아이템. 쓰는 갈래만 적었다. */
export type ThreadItem =
  | { type: "agentMessage"; id: string; text: string }
  | { type: "reasoning"; id: string; summary: string[]; content: string[] }
  | {
      type: "webSearch";
      id: string;
      query: string;
      action:
        | { type: "search"; query?: string; queries?: string[] }
        | { type: "open_page"; url?: string }
        | { type: "find_in_page"; url?: string; pattern?: string }
        | { type: "other" }
        | null;
      results: unknown[] | null;
    }
  | {
      type: "mcpToolCall";
      id: string;
      server: string;
      tool: string;
      status: "inProgress" | "completed" | "failed";
      arguments: unknown;
      result: { content: unknown[]; structuredContent: unknown } | null;
      error: { message: string } | null;
      durationMs: number | null;
    }
  | {
      type: "commandExecution";
      id: string;
      command: string;
      status: string;
      aggregatedOutput: string | null;
      exitCode: number | null;
      durationMs: number | null;
    }
  | { type: string; id: string };

export type TokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

/** 서버 → 클라이언트 알림. `threadId` 로 구독자를 가른다. */
export type ServerNotification =
  | { method: "thread/started"; params: { thread: { id: string } } }
  | { method: "turn/started"; params: { threadId: string; turn: Turn } }
  | { method: "turn/completed"; params: { threadId: string; turn: Turn } }
  | {
      method: "item/started" | "item/completed";
      params: { threadId: string; turnId: string; item: ThreadItem };
    }
  | {
      method: "item/agentMessage/delta";
      params: { threadId: string; turnId: string; itemId: string; delta: string };
    }
  | {
      method: "item/reasoning/summaryTextDelta" | "item/reasoning/textDelta";
      params: { threadId: string; turnId: string; itemId: string; delta: string };
    }
  | {
      method: "thread/tokenUsage/updated";
      params: {
        threadId: string;
        turnId: string;
        tokenUsage: { total: TokenUsageBreakdown; last: TokenUsageBreakdown };
      };
    }
  | {
      method: "error";
      params: { threadId: string; turnId: string; error: TurnError; willRetry: boolean };
    }
  | { method: string; params?: { threadId?: string } & Record<string, unknown> };

/** 서버가 클라이언트에 답을 요구하는 요청(승인 등). 이 프레임워크는 전부 거절한다. */
export type ServerRequest = {
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
};
