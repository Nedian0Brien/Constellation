import type { ToolManifest } from "./relay.ts";

/** assistant-ui `useDataStreamRuntime` 이 보내는 본문 중 이 서버가 읽는 것 */
export type ChatRequest = {
  /** 대화 전체. 마지막 사용자 메시지만 이번 턴의 입력이다 */
  messages?: { role: string; content: unknown }[];
  /** 클라이언트가 등록한 도구의 JSON 스키마 */
  tools?: ToolManifest;
  /** 시스템 프롬프트. 클라이언트가 매 턴 현재 맥락을 넣어 보낸다 */
  system?: string;
  /**
   * 클라이언트가 만든 세션 UUID.
   *
   * Agent SDK 는 `sessionId` 로 새 대화에 원하는 id 를 붙일 수 있고,
   * 이어갈 때는 `resume` 에 같은 id 를 준다. 둘은 함께 쓸 수 없다.
   * 클라이언트가 id 를 소유하므로 첫 응답을 기다렸다 id 를 알아낼 필요가
   * 없다 — 스트림 프로토콜에 기대지 않고 세션을 이어갈 수 있다.
   */
  sessionId?: string;
};

export type ToolResultRequest = {
  sessionId?: string;
  toolCallId?: string;
  result?: unknown;
  isError?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * 히스토리 전체를 다시 보내지 않는다. Agent SDK 가 세션 안에 대화를 들고
 * 있으므로 이번 턴의 입력만 뽑는다. 이어가기는 `resume` 이 맡는다.
 */
export function lastUserText(messages: ChatRequest["messages"]): string {
  if (!messages?.length) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .map((p) => {
          const part = p as { type?: string; text?: string };
          return part.type === "text" ? (part.text ?? "") : "";
        })
        .filter(Boolean)
        .join("\n");
    }
  }
  return "";
}
