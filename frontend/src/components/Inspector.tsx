import type { CSSProperties } from "react";
import { X, Orbit } from "lucide-react";
import { Sidebar, SidebarHeader, SidebarContent } from "./ui/sidebar";
import { Button } from "./ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "./ui/empty";
import { useExploration } from "../hooks/use-exploration";
import DetailPanel from "../panels/DetailPanel";
import ClusterPanel from "../panels/ClusterPanel";
import { cn } from "../lib/utils";

// 우측 인스펙터. 공식 좌·우 사이드바 블록(sidebar-15)처럼 collapsible="none"으로
// 두고 열림은 AppShell이 렌더링 여부로 정한다. 논문이 주제·분야보다 우선한다.
export function Inspector({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const { state, update } = useExploration();
  const kind = state.selected
    ? "paper"
    : state.cluster !== undefined || state.node !== undefined
      ? "region"
      : "empty";
  return (
    <Sidebar
      side="right"
      collapsible="none"
      data-testid="inspector"
      className={cn("shrink-0 border-l border-sidebar-border", className)}
      style={style}
    >
      <SidebarHeader className="flex-row items-center justify-between px-4 py-3">
        <span className="eyebrow">INSPECTOR</span>
        {kind !== "empty" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="선택 해제"
            onClick={() =>
              update({ selected: undefined, cluster: undefined, node: undefined })
            }
          >
            <X />
          </Button>
        )}
      </SidebarHeader>
      <SidebarContent className="px-4 pb-6">
        {kind === "paper" ? (
          <DetailPanel />
        ) : kind === "region" ? (
          <ClusterPanel />
        ) : (
          <Empty className="pt-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Orbit />
              </EmptyMedia>
              <EmptyTitle>별 하나에서 시작하세요</EmptyTitle>
              <EmptyDescription>
                논문이나 연구 주제를 선택하면 초록과 연결 정보를 확인할 수
                있습니다.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
