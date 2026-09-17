import { useState } from "react";
import { Orbit, Network, GitBranch, Waypoints, Sparkles } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "./ui/sidebar";
import { Badge } from "./ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "./ui/empty";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { clusterColor } from "../views/map/regions";
import type { View, Exploration } from "../app/navigation";
export const viewNames: Record<View, string> = {
  map: "연구 지도",
  tree: "계층 트리",
  flow: "갈래 흐름",
  lineage: "인용 계보",
  sky: "3D 별자리",
};
const icons = {
  map: Orbit,
  tree: Network,
  flow: GitBranch,
  lineage: Waypoints,
  sky: Sparkles,
};
export function AppSidebar() {
  const a = useAnalysis(),
    { state, update } = useExploration(),
    { isMobile, setOpenMobile } = useSidebar();
  const [filter, setFilter] = useState("");
  const clusters = a.clusters.data ?? [];
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? clusters.filter((c) => c.label.toLowerCase().includes(needle))
    : clusters;
  // 좁은 창에서는 Sheet로 열리므로 항목을 고르면 닫는다.
  const go = (patch: Partial<Exploration>) => {
    update(patch);
    if (isMobile) setOpenMobile(false);
  };
  return (
    <Sidebar
      collapsible="icon"
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>EXPLORE</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {(Object.keys(viewNames) as View[]).map((view) => {
                const Icon = icons[view];
                return (
                  <SidebarMenuItem key={view}>
                    <SidebarMenuButton
                      isActive={state.view === view}
                      tooltip={viewNames[view]}
                      onClick={() => go({ view })}
                    >
                      <Icon />
                      <span>{viewNames[view]}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>
            RESEARCH CLUSTERS
            <Badge variant="secondary" className="ml-auto tabular-nums">
              {clusters.length}
            </Badge>
          </SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-2">
            {clusters.length > 0 && (
              <SidebarInput
                type="search"
                placeholder="주제 이름 검색"
                aria-label="주제 이름 검색"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            )}
            {visible.length > 0 ? (
              <SidebarMenu>
                {visible.map((c) => (
                  <SidebarMenuItem key={c.cluster_id}>
                    <SidebarMenuButton
                      isActive={state.cluster === c.cluster_id}
                      title={c.label}
                      aria-label={c.label}
                      className="pr-12"
                      onClick={() =>
                        go({
                          cluster:
                            state.cluster === c.cluster_id
                              ? undefined
                              : c.cluster_id,
                          node: undefined,
                          selected: undefined,
                          view: "map",
                        })
                      }
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{
                          background: `rgb(${clusterColor(c.cluster_id).join(",")})`,
                        }}
                      />
                      <span>{c.label}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{c.size.toLocaleString()}</SidebarMenuBadge>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : (
              <Empty className="py-6">
                <EmptyHeader>
                  <EmptyTitle>
                    {clusters.length === 0
                      ? "주제 분석 결과 없음"
                      : "일치하는 주제 없음"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {clusters.length === 0
                      ? "이 모델에는 주제 분석 결과가 없습니다."
                      : "다른 이름으로 검색해 보세요."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden border-t border-sidebar-border px-4 py-4">
        <span className="eyebrow">OPENALEX</span>
        <span className="text-xs text-muted-foreground">
          {a.map.data?.n.toLocaleString() ?? "—"}편의 논문 · 로컬 데이터
        </span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
