import { useEffect, useRef, useState } from "react";
import { PanelLeft, PanelRight, List, Orbit } from "lucide-react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { Button } from "./ui/button";
import { SidebarProvider } from "./ui/sidebar";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./ui/tooltip";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "./ui/resizable";
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
import { ExploreToolbar } from "./ExploreToolbar";
import { PaperListOverlay } from "./PaperListOverlay";
import { DataState } from "./DataState";
import { useAnalysis } from "../hooks/use-analysis";
import { useExploration } from "../hooks/use-exploration";
import { usePersistentLayout } from "../hooks/use-persistent-layout";
import MapView from "../views/MapView";
import TreeView from "../views/TreeView";
import FlowView from "../views/FlowView";
import LineageView from "../views/LineageView";
import SkyView from "../views/SkyView";
import DetailPanel from "../panels/DetailPanel";
import ClusterPanel from "../panels/ClusterPanel";
const mobileQuery = "(max-width: 959px)";
export function AppShell() {
  const a = useAnalysis(),
    { state, update } = useExploration(),
    { prefs, save } = usePersistentLayout();
  const nav = useRef<PanelImperativeHandle>(null),
    detail = useRef<PanelImperativeHandle>(null);
  const [mobile, setMobile] = useState(() => matchMedia(mobileQuery).matches),
    [mobileNav, setMobileNav] = useState(false),
    [mobileDetail, setMobileDetail] = useState(false);
  const [initialLayout] = useState(prefs.layout);
  const selectionRef = useRef(
    `${state.selected ?? ""}|${state.cluster ?? ""}|${state.node ?? ""}`,
  );
  useEffect(() => {
    const m = matchMedia(mobileQuery),
      change = () => setMobile(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!mobile) {
      if (prefs.navOpen) nav.current?.expand();
      else nav.current?.collapse();
      if (prefs.detailOpen) detail.current?.expand();
      else detail.current?.collapse();
    }
  }, [prefs.navOpen, prefs.detailOpen, mobile]);
  useEffect(() => {
    const selection = `${state.selected ?? ""}|${state.cluster ?? ""}|${state.node ?? ""}`;
    if (selectionRef.current === selection) return;
    selectionRef.current = selection;
    if (
      state.selected ||
      state.cluster !== undefined ||
      state.node !== undefined
    ) {
      if (mobile) setMobileDetail(true);
      else save({ detailOpen: true });
    } else {
      setMobileDetail(false);
      save({ detailOpen: false });
    }
  }, [state.selected, state.cluster, state.node, mobile, save]);
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
  const inspector = (
    <div className="inspector-content">
      <span className="eyebrow inspector-heading">INSPECTOR</span>
      {state.selected ? (
        <DetailPanel />
      ) : state.cluster !== undefined || state.node !== undefined ? (
        <ClusterPanel />
      ) : (
        <div className="inspector-empty">
          <Orbit />
          <h2>별 하나에서 시작하세요</h2>
          <p>
            논문이나 연구 주제를 선택하면 초록과 연결 정보를 확인할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
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
          <DataState
            error={error}
            retry={() => {
              if (a.runs.isError) void a.runs.refetch();
              else void a.map.refetch();
            }}
            title="분석 결과를 찾을 수 없습니다"
          />
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
      <SidebarProvider className="shell-provider">
        <div className="product-shell">
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
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="탐색 패널 전환"
                      aria-pressed={mobile ? mobileNav : prefs.navOpen}
                      onClick={() =>
                        mobile
                          ? setMobileNav(!mobileNav)
                          : save({ navOpen: !prefs.navOpen })
                      }
                    />
                  }
                >
                  <PanelLeft />
                </TooltipTrigger>
                <TooltipContent>탐색 패널</TooltipContent>
              </Tooltip>
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
                size="icon"
                aria-label="상세 패널 전환"
                aria-pressed={mobile ? mobileDetail : prefs.detailOpen}
                onClick={() =>
                  mobile
                    ? setMobileDetail(!mobileDetail)
                    : save({ detailOpen: !prefs.detailOpen })
                }
              >
                <PanelRight />
              </Button>
            </div>
          </header>
          <div className="shell-body">
            {mobile ? (
              stage
            ) : (
              <ResizablePanelGroup
                orientation="horizontal"
                id="workspace-panels"
                defaultLayout={initialLayout}
                onLayoutChanged={(layout, meta) => {
                  if (meta.isUserInteraction)
                    save({
                      layout,
                      navOpen: layout.nav > 0,
                      detailOpen: layout.detail > 0,
                    });
                }}
              >
                <ResizablePanel
                  id="nav"
                  panelRef={nav}
                  defaultSize={prefs.navOpen ? 224 : 0}
                  minSize={165}
                  maxSize="28%"
                  collapsible
                  collapsedSize={0}
                >
                  <AppSidebar />
                </ResizablePanel>
                <ResizableHandle aria-label="탐색 패널 크기 조절" />
                <ResizablePanel id="workspace" minSize={300}>
                  {stage}
                </ResizablePanel>
                <ResizableHandle aria-label="상세 패널 크기 조절" />
                <ResizablePanel
                  id="detail"
                  panelRef={detail}
                  defaultSize={prefs.detailOpen ? 320 : 0}
                  minSize={250}
                  maxSize="40%"
                  collapsible
                  collapsedSize={0}
                >
                  {inspector}
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
          <Sheet open={mobile && mobileNav} onOpenChange={setMobileNav}>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>연구 탐색</SheetTitle>
              </SheetHeader>
              <AppSidebar onNavigate={() => setMobileNav(false)} />
            </SheetContent>
          </Sheet>
          <Sheet open={mobile && mobileDetail} onOpenChange={setMobileDetail}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>선택 상세</SheetTitle>
              </SheetHeader>
              {inspector}
            </SheetContent>
          </Sheet>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
