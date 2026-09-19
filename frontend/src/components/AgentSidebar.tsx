import { useEffect, useRef, type CSSProperties } from "react";
import { X, MessageSquarePlus, PlugZap } from "lucide-react";
import { Sidebar, SidebarHeader, SidebarContent } from "./ui/sidebar";
import { Button } from "./ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Thread } from "./assistant-ui/elements/thread.aui";
import { AgentModelSelector } from "../agent/AgentModelSelector";
import { useAgentHealth } from "../agent/use-agent-health";
import { cn } from "../lib/utils";
import { useStore } from "../store";

const THREAD_COMPONENTS = { ComposerLeading: AgentModelSelector };

/**
 * 에이전트 서버가 꺼져 있을 때 채팅 자리에 보이는 안내. "Load failed" 대신
 * 무엇이 없는지와 켜는 방법을 말한다. 다시 시도가 성공하면 대화가 그대로
 * 돌아온다(런타임은 그대로이고 이 컴포넌트만 바뀐다).
 */
function AgentOffline({ retry }: { retry: () => void }) {
  return (
    <div
      data-testid="agent-offline"
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <PlugZap className="text-muted-foreground size-6" aria-hidden />
      <p className="text-sm font-medium">에이전트 서버가 꺼져 있습니다</p>
      <p className="text-muted-foreground text-xs leading-5">
        저장소에서 <code className="font-mono">npm --prefix agent start</code>
        로 서버를 띄운 뒤 다시 시도하세요.
      </p>
      <Button variant="outline" size="sm" onClick={retry}>
        다시 시도
      </Button>
    </div>
  );
}

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
  const { health, retry } = useAgentHealth();
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
        {health === "offline" ? (
          <AgentOffline retry={retry} />
        ) : (
          <Thread components={THREAD_COMPONENTS} />
        )}
      </SidebarContent>
    </Sidebar>
  );
}
