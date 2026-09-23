import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpIcon,
  BrainIcon,
  ChevronDownIcon,
  LoaderIcon,
  MessageSquarePlus,
  SquareIcon,
  X,
} from "lucide-react";
import type { ChatSchedule } from "./schedule";

// 앱의 에이전트 패널(AgentSidebar + assistant-ui Thread)을 영상용으로 다시 그린다. 실제
// 컴포넌트는 assistant-ui 런타임과 시간 기반 애니메이션에 묶여 프레임 단위로 그릴 수 없다.
// 치수·색은 실행 중인 앱(1440×900)에서 getComputedStyle로 잰 값이다(styles.css `.chat-*`).
// 등장·스피너·반짝임은 모두 `f`(채팅 장면 안 프레임)의 함수다.

export const PANEL_W = 384;

export function ChatPanel({ f, s }: { f: number; s: ChatSchedule }) {
  const typed = Math.floor(
    Math.min(1, Math.max(0, (f - s.typeStart) / (s.typeEnd - s.typeStart))) *
      s.question.length,
  );
  const running = f >= s.send && f < s.done;
  const sent = f >= s.send;
  return (
    <div className="chat-panel">
      <div className="chat-head">
        <span className="chat-eyebrow">AGENT</span>
        <span className="chat-head-icons">
          <MessageSquarePlus size={16} />
          <X size={16} />
        </span>
      </div>
      {sent ? (
        <Thread f={f} s={s} />
      ) : (
        <div className="chat-empty">무엇을 찾아볼까요?</div>
      )}
      {/* 빈 대화에서는 제목과 입력창이 한 묶음으로 세로 가운데(thread.aui.tsx `justify-center`,
          제목 32px + mb-6), 보낸 뒤에는 아래(pb-6)에 붙는다. */}
      <div
        className="chat-composer"
        style={sent ? undefined : { top: 356, bottom: "auto" }}
      >
        <div
          className={
            sent || typed === 0
              ? "chat-input chat-input--placeholder"
              : "chat-input"
          }
        >
          {sent || typed === 0
            ? "연구 지도에 물어보세요…"
            : s.question.slice(0, typed)}
          {!sent && typed > 0 && (
            <span
              className="chat-caret"
              style={{ opacity: Math.floor(f / 8) % 2 ? 0 : 1 }}
            />
          )}
        </div>
        <span className="chat-send">
          {running ? (
            <SquareIcon size={12} fill="currentColor" />
          ) : (
            <ArrowUpIcon size={16} />
          )}
        </span>
      </div>
    </div>
  );
}

function Thread({ f, s }: { f: number; s: ChatSchedule }) {
  const viewport = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  // 앱처럼 내용이 넘치면 맨 아래를 따라간다. 프레임마다 잰 높이로 정하므로 결정적이다.
  useLayoutEffect(() => {
    const v = viewport.current,
      c = content.current;
    if (!v || !c) return;
    setOffset(Math.min(0, v.clientHeight - c.scrollHeight));
  });
  return (
    <div className="chat-viewport" ref={viewport}>
      <div
        className="chat-content"
        ref={content}
        style={{ transform: `translateY(${offset}px)` }}
      >
        <div className="chat-user">
          <div className="chat-bubble">{s.question}</div>
        </div>
        <div className="chat-assistant">
          {s.blocks
            .filter((b) => f >= b.start)
            .map((b, k) => {
              if (b.kind === "text") {
                const n = Math.floor(
                  ((f - b.start) / Math.max(1, b.end - b.start)) *
                    b.text.length,
                );
                return (
                  <Markdown
                    key={k}
                    text={b.text.slice(0, Math.min(b.text.length, n))}
                  />
                );
              }
              if (b.kind === "reasoning")
                return (
                  <div key={k} className="chat-reasoning">
                    <BrainIcon size={16} />
                    <span>사고 과정</span>
                    <ChevronDownIcon size={16} />
                  </div>
                );
              const shown = b.names.filter(
                (_, i) =>
                  f >= b.start + i * ((b.end - b.start) / b.names.length),
              ).length;
              const active = f < b.end;
              return (
                <div key={k} className="chat-tools">
                  {active && (
                    <LoaderIcon
                      size={12}
                      style={{ transform: `rotate(${(f * 360) / 18}deg)` }}
                    />
                  )}
                  <span
                    className={
                      active
                        ? "chat-tools-label chat-shimmer"
                        : "chat-tools-label"
                    }
                    style={
                      active
                        ? { backgroundPositionX: `${150 - ((f * 12) % 250)}%` }
                        : undefined
                    }
                  >
                    도구 호출 {Math.max(1, shown)}건
                  </span>
                  <ChevronDownIcon
                    size={12}
                    style={{ transform: "rotate(-90deg)" }}
                  />
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// 에이전트 답의 마크다운(문단·굵게·목록)만 다룬다. CommonMark처럼 빈 줄이 문단을 나누고,
// `- `로 시작하는 줄은 바로 앞 문단을 끊고 목록이 된다. 흘러나오는 중이라 닫히지 않은
// `**`는 여는 쪽부터 굵게 둔다.
function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  for (const [k, block] of text.split(/\n{2,}/).entries()) {
    let para: string[] = [],
      items: string[] = [];
    const flush = (key: string) => {
      if (para.length)
        out.push(
          <p key={key + "p"} className="chat-p">
            {inline(para.join(" "))}
          </p>,
        );
      if (items.length)
        out.push(
          <ul key={key + "u"} className="chat-ul">
            {items.map((l, i) => (
              <li key={i}>{inline(l)}</li>
            ))}
          </ul>,
        );
      para = [];
      items = [];
    };
    block.split("\n").forEach((line, i) => {
      if (line.startsWith("- ")) {
        if (para.length) flush(`${k}.${i}`);
        items.push(line.slice(2));
      } else {
        if (items.length) flush(`${k}.${i}`);
        para.push(line);
      }
    });
    flush(`${k}.end`);
  }
  return <>{out}</>;
}

function inline(text: string): ReactNode[] {
  return text
    .split("**")
    .map((seg, i) =>
      i % 2 ? <strong key={i}>{seg}</strong> : <span key={i}>{seg}</span>,
    );
}
