import { useEffect, useRef, type CSSProperties } from "react";
import { X, MessageSquarePlus } from "lucide-react";
import { Sidebar, SidebarHeader, SidebarContent } from "./ui/sidebar";
import { Button } from "./ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Thread } from "./assistant-ui/elements/thread.aui";
import { cn } from "../lib/utils";
import { useStore } from "../store";

// 우측 에이전트 채팅. 인스펙터가 쓰던 자리·골격(collapsible="none", 헤더 한
// 번)을 그대로 이어받고 내용만 agent-chat-framework 의 Thread 로 바꿨다.
// 열림은 AppShell 이 렌더링 여부로 정한다. 런타임 Provider 안에서 그려야 한다.
export function AgentSidebar({
  className,
  style,
  onClose,
  onNewThread,
}: {
  className?: string;
  style?: CSSProperties;
  onClose: () => void;
  onNewThread: () => void;
}) {
  // "AI에게 질문하기": 채팅이 이미 열려 있으면 입력창에 포커스만 둔다. 이 요청으로
  // 막 열린 경우는 Thread의 autoFocus가 맡는다.
  const root = useRef<HTMLDivElement>(null);
  const chatRequest = useStore((s) => s.chatRequest);
  const seen = useRef(chatRequest);
  useEffect(() => {
    if (chatRequest === seen.current) return;
    seen.current = chatRequest;
    root.current?.querySelector("textarea")?.focus();
  }, [chatRequest]);
  return (
    <Sidebar
      ref={root}
      side="right"
      collapsible="none"
      data-testid="agent-chat"
      className={cn("shrink-0 border-l border-sidebar-border", className)}
      style={style}
    >
      <SidebarHeader className="flex-row items-center justify-between px-4 py-3">
        <span className="eyebrow">AGENT</span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="새 대화"
                  onClick={onNewThread}
                />
              }
            >
              <MessageSquarePlus />
            </TooltipTrigger>
            <TooltipContent>새 대화</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="에이전트 패널 닫기"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent className="min-h-0 flex-1 overflow-hidden">
        <Thread />
      </SidebarContent>
    </Sidebar>
  );
}
