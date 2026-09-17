import { Orbit, Network, GitBranch, Waypoints, Sparkles } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "./ui/sidebar";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { clusterColor } from "../views/map/regions";
import type { View } from "../app/navigation";
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
export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const a = useAnalysis(),
    { state, update } = useExploration();
  return (
    <Sidebar collapsible="none" className="app-sidebar">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>EXPLORE</SidebarGroupLabel>
          <SidebarMenu>
            {(Object.keys(viewNames) as View[]).map((view) => {
              const Icon = icons[view];
              return (
                <SidebarMenuItem key={view}>
                  <SidebarMenuButton
                    isActive={state.view === view}
                    onClick={() => {
                      update({ view });
                      onNavigate?.();
                    }}
                  >
                    <Icon />
                    <span>{viewNames[view]}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>
            RESEARCH CLUSTERS{" "}
            <span className="cluster-count">
              {a.clusters.data?.length ?? 0}
            </span>
          </SidebarGroupLabel>
          <SidebarMenu>
            {a.clusters.data?.map((c) => (
              <SidebarMenuItem key={c.cluster_id}>
                <SidebarMenuButton
                  isActive={state.cluster === c.cluster_id}
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => {
                    update({
                      cluster:
                        state.cluster === c.cluster_id
                          ? undefined
                          : c.cluster_id,
                      node: undefined,
                      selected: undefined,
                      view: "map",
                    });
                    onNavigate?.();
                  }}
                >
                  <span
                    className="topic-dot"
                    style={{
                      background: `rgb(${clusterColor(c.cluster_id).join(",")})`,
                    }}
                  />
                  <span className="truncate">{c.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          {a.clusters.data?.length === 0 && (
            <p className="sidebar-note">이 모델의 주제 분석 결과가 없습니다.</p>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <span className="eyebrow">OPENALEX</span>
        <span className="sidebar-note">
          {a.map.data?.n.toLocaleString() ?? "—"}편의 논문 · 로컬 데이터
        </span>
      </SidebarFooter>
    </Sidebar>
  );
}
