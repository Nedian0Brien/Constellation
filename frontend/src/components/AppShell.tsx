import { useEffect, useRef, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelRight, List, FolderOpen } from "lucide-react";
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
import { Inspector } from "./Inspector";
import { ExploreToolbar } from "./ExploreToolbar";
import { PaperListOverlay } from "./PaperListOverlay";
import { DataState } from "./DataState";
import { chooseDatabase, desktop, fetchDbStatus } from "../api";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { usePersistentLayout } from "../hooks/use-persistent-layout";
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
// 우측 인스펙터 폭. 코퍼스에 인스펙터 표본이 없어 이전 값 320px를 유지한다.
const inspectorWidth = { "--sidebar-width": "20rem" } as CSSProperties;
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
  const hasSelection =
    !!state.selected || state.cluster !== undefined || state.node !== undefined;
  const { prefs, save } = usePersistentLayout(hasSelection);
  const isMobile = useIsMobile();
  const selectionRef = useRef(
    `${state.selected ?? ""}|${state.cluster ?? ""}|${state.node ?? ""}`,
  );
  useEffect(() => {
    const selection = `${state.selected ?? ""}|${state.cluster ?? ""}|${state.node ?? ""}`;
    if (selectionRef.current === selection) return;
    selectionRef.current = selection;
    save({ detailOpen: hasSelection });
  }, [state.selected, state.cluster, state.node, hasSelection, save]);
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
            {invalidRegion && (
              <div className="invalid-region" role="status">
                선택한 연구 주제를 찾을 수 없습니다.
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update({ cluster: undefined, node: undefined }, true)
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
        open={prefs.navOpen}
        onOpenChange={(navOpen) => save({ navOpen })}
      >
          <header className="product-header">
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
                aria-label="상세 패널 전환"
                aria-pressed={prefs.detailOpen}
                onClick={() => save({ detailOpen: !prefs.detailOpen })}
              >
                <PanelRight />
              </Button>
            </div>
          </header>
          <div className="shell-body">
            <AppSidebar />
            {stage}
            {prefs.detailOpen && !isMobile && (
              <Inspector style={inspectorWidth} />
            )}
          </div>
          {/* 좁은 창의 인스펙터는 모달이라 선택이 있을 때만 연다. */}
          <Sheet
            open={isMobile && prefs.detailOpen && hasSelection}
            onOpenChange={(detailOpen) => save({ detailOpen })}
          >
            {/* Sidebar의 모바일 Sheet처럼 기본 닫기 버튼을 숨기고 헤더의 ✕만 둔다. */}
            <SheetContent
              className="w-(--sidebar-width) p-0 [&>button]:hidden"
              style={inspectorWidth}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>선택 상세</SheetTitle>
              </SheetHeader>
              <Inspector className="w-full border-l-0" />
            </SheetContent>
          </Sheet>
      </SidebarProvider>
    </TooltipProvider>
  );
}
