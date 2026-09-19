import { useEffect, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, List, FolderOpen } from "lucide-react";
import { Button } from "./ui/button";
import { SidebarProvider, SidebarTrigger, useSidebar } from "./ui/sidebar";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./ui/tooltip";
import { Sheet, SheetContent, SheetTitle, SheetHeader } from "./ui/sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "./ui/select";
import { AppSidebar, viewNames } from "./AppSidebar";
import { AgentSidebar } from "./AgentSidebar";
import { InspectorDialog } from "./InspectorDialog";
import { AgentProvider } from "../agent/AgentProvider";
import { useAgentThread } from "../agent/use-agent-thread";
import { providerOf, useModelSelection } from "../agent/settings";
import { ExploreToolbar } from "./ExploreToolbar";
import { PaperListOverlay } from "./PaperListOverlay";
import { DataState } from "./DataState";
import { chooseDatabase, desktop, fetchDbStatus } from "../api";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { usePersistentLayout } from "../hooks/use-persistent-layout";
import { useStore } from "../store";
import { useIsMobile } from "../hooks/use-mobile";
import MapView from "../views/MapView";
import TreeView from "../views/TreeView";
import FlowView from "../views/FlowView";
import LineageView from "../views/LineageView";
import SkyView from "../views/SkyView";
// 데스크톱 앱에서 DB가 없을 때. 기본 경로를 보여 주고 파일을 고르게 한다.
function DatabasePicker() {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ["db-status"], queryFn: fetchDbStatus });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {status.data?.exists === false
          ? `찾는 위치: ${status.data.path}`
          : "파이프라인이 만든 constellation.duckdb 파일을 고르세요."}
      </p>
      <Button
        variant="outline"
        className="w-fit"
        onClick={async () => {
          const next = await chooseDatabase();
          client.setQueryData(["db-status"], next);
          if (next.exists) await client.invalidateQueries();
        }}
      >
        <FolderOpen data-icon="inline-start" />
        데이터베이스 열기
      </Button>
    </div>
  );
}
// 우측 에이전트 채팅 폭. 코퍼스에 채팅 패널 표본이 없어 저자 판단(A)이다.
// 마크다운·도구 카드에 20rem은 좁고, 1440px 창에서 지도가 800px 남는다.
const chatWidth = { "--sidebar-width": "24rem" } as CSSProperties;
// 헤더 버튼은 Provider 안에서만 사이드바 상태를 읽을 수 있다.
function NavToggle() {
  const { open, openMobile, isMobile } = useSidebar();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarTrigger
            aria-label="탐색 패널 전환"
            aria-pressed={isMobile ? openMobile : open}
          />
        }
      />
      <TooltipContent>탐색 패널</TooltipContent>
    </Tooltip>
  );
}
export function AppShell() {
  const a = useAnalysis(),
    { state, update } = useExploration();
  const { prefs, save } = usePersistentLayout();
  const isMobile = useIsMobile();
  // 대화는 run·프로바이더 단위다. 선택기에서 프로바이더를 바꾸면 그 대화로 갈아탄다.
  const agent = useAgentThread(a.run, providerOf(useModelSelection().modelName));
  useEffect(() => {
    if (a.run && !state.run) update({ run: a.run }, true);
  }, [a.run, state.run, update]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.list) update({ list: false });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [state.list, update]);
  const map = a.map.data;
  // "AI에게 질문하기"(지도의 선택 버튼). 채팅을 연다 — 포커스는 AgentSidebar가 둔다.
  const chatRequest = useStore((s) => s.chatRequest);
  useEffect(() => {
    if (chatRequest > 0) save({ chatOpen: true });
  }, [chatRequest, save]);
  // 지도에 없는 논문 id(딥링크·다른 run). 논문 상세는 지도의 선택 모드가 여는데
  // 노드가 없으니 주제·분야처럼 안내와 해제 버튼을 보인다.
  const invalidPaper =
    state.selected !== undefined && !!map && !map.id.includes(state.selected);
  const invalidRegion =
    (state.cluster !== undefined &&
      a.clusters.isSuccess &&
      !a.clusters.data.some((c) => c.cluster_id === state.cluster)) ||
    (state.node !== undefined &&
      a.tree.isSuccess &&
      !a.tree.data.nodes.some((n) => n.id === state.node));
  const error = a.runs.error ?? a.map.error;
  const stage = (
    <div className="workspace-stage">
      <ExploreToolbar />
      <div className="analysis-stage">
        {error ? (
          <div className="stage-notice">
            <DataState
              error={error}
              retry={() => {
                if (a.runs.isError) void a.runs.refetch();
                else void a.map.refetch();
              }}
              title="분석 결과를 찾을 수 없습니다"
            />
            {desktop && <DatabasePicker />}
          </div>
        ) : a.runs.data?.length === 0 ? (
          <DataState title="아직 투영된 연구 지도가 없습니다" />
        ) : !map ? (
          <DataState loading />
        ) : map.n === 0 ? (
          <DataState title="분석에 포함된 논문이 없습니다" />
        ) : (
          <>
            <div className="view-surface" hidden={state.view !== "map"}>
              <MapView key={map.run_id} />
            </div>
            {state.view === "tree" && <TreeView key={map.run_id} />}
            {state.view === "flow" && <FlowView key={map.run_id} />}
            {state.view === "lineage" && <LineageView key={map.run_id} />}
            {state.view === "sky" && <SkyView key={map.run_id} />}
            {state.list && <PaperListOverlay />}
            {(invalidRegion || invalidPaper) && (
              <div className="invalid-region" role="status">
                {invalidPaper
                  ? "선택한 논문은 현재 분석에 포함되지 않았습니다."
                  : "선택한 연구 주제를 찾을 수 없습니다."}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update(
                      invalidPaper
                        ? { selected: undefined }
                        : { cluster: undefined, node: undefined },
                      true,
                    )
                  }
                >
                  선택 해제
                </Button>
              </div>
            )}
            {a.matches.isError && (
              <div className="filter-error">
                <DataState
                  error={a.matches.error}
                  retry={() => a.matches.refetch()}
                />
              </div>
            )}
          </>
        )}
      </div>
      <footer className="workspace-status">
        <span>
          {viewNames[state.view]} <span className="status-dot" />{" "}
          {a.matches.data?.total.toLocaleString() ?? "—"} /{" "}
          {map?.n.toLocaleString() ?? "—"}편
        </span>
        <span>
          {a.run?.includes("scincl")
            ? "SciNCL"
            : (a.runs.data?.find((r) => r.run_id === a.run)?.model ??
              "분석 준비 중")}{" "}
          · LOCAL
        </span>
      </footer>
    </div>
  );
  return (
    <TooltipProvider>
      <SidebarProvider
        className="product-shell"
        data-desktop={desktop || undefined}
        open={prefs.navOpen}
        onOpenChange={(navOpen) => save({ navOpen })}
      >
          {/* 데스크톱 앱에서 헤더가 타이틀 바를 대신한다. deep: 하위 어디를 눌러도
              끌리되 버튼·Select 같은 클릭 가능 요소는 drag.js가 제외한다. */}
          <header className="product-header" data-tauri-drag-region="deep">
            <div className="product-brand">
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path
                  d="M6 22 12 7l13 6-7 13L6 22Zm6-15 6 19M6 22l19-9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth=".8"
                />
                <g fill="currentColor">
                  <circle cx="6" cy="22" r="2" />
                  <circle cx="12" cy="7" r="2.3" />
                  <circle cx="25" cy="13" r="1.8" />
                  <circle cx="18" cy="26" r="1.6" />
                </g>
              </svg>
              <span>Constellation</span>
            </div>
            <span className="header-divider" />
            <span className="collection-name">연구 라이브러리</span>
            <div className="header-tools">
              <Select
                value={a.run ?? ""}
                onValueChange={(run) => {
                  if (run) update({ run });
                }}
              >
                <SelectTrigger aria-label="임베딩 모델">
                  <SelectValue>
                    {a.runs.data?.find((r) => r.run_id === a.run)?.model ??
                      (state.run ? "알 수 없는 분석" : "모델 선택")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {a.runs.data?.map((r) => (
                      <SelectItem key={r.run_id} value={r.run_id}>
                        {r.model ?? r.run_id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <NavToggle />
              <Button
                id="paper-list-toggle"
                variant={state.list ? "secondary" : "ghost"}
                aria-label="논문 목록 열기"
                aria-expanded={state.list}
                disabled={!map}
                onClick={() => update({ list: !state.list, view: "map" })}
              >
                <List data-icon="inline-start" />
                <span className="list-toggle-label">논문 목록</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="에이전트 패널 전환"
                aria-pressed={prefs.chatOpen}
                onClick={() => save({ chatOpen: !prefs.chatOpen })}
              >
                <Bot />
              </Button>
            </div>
          </header>
          <div className="shell-body">
            <AppSidebar />
            {stage}
            {/* 채팅은 run 이 있어야 맥락과 세션을 만들 수 있다. */}
            {prefs.chatOpen && !isMobile && a.run && (
              <AgentProvider key={agent.key} run={a.run} thread={agent.thread}>
                <AgentSidebar
                  style={chatWidth}
                  onClose={() => save({ chatOpen: false })}
                  onNewThread={agent.reset}
                />
              </AgentProvider>
            )}
          </div>
          <InspectorDialog />
          <Sheet
            open={isMobile && prefs.chatOpen && !!a.run}
            onOpenChange={(chatOpen) => save({ chatOpen })}
          >
            {/* Sidebar의 모바일 Sheet처럼 기본 닫기 버튼을 숨기고 헤더의 ✕만 둔다. */}
            <SheetContent
              className="w-(--sidebar-width) p-0 [&>button]:hidden"
              style={chatWidth}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>에이전트</SheetTitle>
              </SheetHeader>
              {a.run && (
                <AgentProvider key={agent.key} run={a.run} thread={agent.thread}>
                  <AgentSidebar
                    className="w-full border-l-0"
                    onClose={() => save({ chatOpen: false })}
                    onNewThread={agent.reset}
                  />
                </AgentProvider>
              )}
            </SheetContent>
          </Sheet>
      </SidebarProvider>
    </TooltipProvider>
  );
}
