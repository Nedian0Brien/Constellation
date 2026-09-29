import recording from "../recording/agent-thread.json";

// 실제 에이전트 기록(recording/agent-thread.json)을 화면 블록으로 묶고, 채팅 장면 안에서
// 각 블록이 나타나는 프레임을 정한다. 문장과 도구 호출은 기록 그대로다. 실제 응답은
// 22초 걸렸고 영상은 7초라, 시간만 줄인다(보고에 적는다).

type Part =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-call";
      toolName: string;
      args: Record<string, unknown>;
      result?: unknown;
    };
interface Recording {
  messages: { role: "user" | "assistant"; content: Part[] }[];
}

export type Block =
  | { kind: "text"; text: string; start: number; end: number }
  | { kind: "tools"; names: string[]; start: number; end: number }
  | { kind: "reasoning"; start: number; end: number };

export interface ToolEvent {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  /** 이 도구가 끝나는(결과가 화면에 반영되는) 채팅 장면 안 프레임. */
  frame: number;
}

export interface ChatSchedule {
  question: string;
  /** 질문을 입력하는 구간과 보내는 프레임. */
  typeStart: number;
  typeEnd: number;
  send: number;
  blocks: Block[];
  events: ToolEvent[];
  /** 답이 끝나는 프레임. */
  done: number;
}

// 속도(프레임당 글자 수, 프레임). 사람이 읽을 수 있는 한도에서 앞 문장은 느리게,
// 마지막 긴 답은 빠르게 흘린다.
const TYPE_CPF = 2.6, // 질문 입력
  SHORT_CPF = 2.5, // 짧은 안내 문장
  LONG_CPF = 12, // 마지막 답(845자 — 읽히라고 흘리는 속도가 아니다. 답이 흘러나오는 모습을 보인다)
  TOOL_FRAMES = 6, // 도구 호출 하나가 도는 시간
  GAP = 2;

export function chatSchedule(start = 8): ChatSchedule {
  const rec = recording as unknown as Recording;
  const question = rec.messages
    .find((m) => m.role === "user")!
    .content.map((p) => (p.type === "text" ? p.text : ""))
    .join("");
  const parts = rec.messages.find((m) => m.role === "assistant")!.content;
  const typeStart = start + 2,
    typeEnd = typeStart + Math.ceil(question.length / TYPE_CPF),
    send = typeEnd + 3;

  const blocks: Block[] = [];
  const events: ToolEvent[] = [];
  let t = send + 4;
  const lastText = parts.map((p) => p.type).lastIndexOf("text");
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    if (p.type === "text") {
      const cpf = k === lastText ? LONG_CPF : SHORT_CPF;
      const len = Math.ceil(p.text.trim().length / cpf);
      blocks.push({
        kind: "text",
        text: p.text.trim(),
        start: t,
        end: t + len,
      });
      t += len + GAP;
    } else if (p.type === "reasoning") {
      blocks.push({ kind: "reasoning", start: t, end: t + 4 });
      t += 4 + GAP;
    } else {
      // 이어지는 도구 호출은 앱처럼 한 묶음("도구 호출 N건")이다.
      const prev = blocks[blocks.length - 1];
      const group =
        prev && prev.kind === "tools" && parts[k - 1]?.type === "tool-call"
          ? prev
          : (blocks[
              blocks.push({ kind: "tools", names: [], start: t, end: t }) - 1
            ] as Extract<Block, { kind: "tools" }>);
      group.names.push(p.toolName);
      t += TOOL_FRAMES;
      group.end = t;
      events.push({
        name: p.toolName,
        args: p.args,
        result: p.result,
        frame: t,
      });
      if (parts[k + 1]?.type !== "tool-call") t += GAP;
    }
  }
  return { question, typeStart, typeEnd, send, blocks, events, done: t };
}
