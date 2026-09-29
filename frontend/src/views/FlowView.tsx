import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { DataState } from "../components/DataState";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "../components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "../components/ui/empty";
import { WorkList } from "../panels/WorkList";
import { fetchFlow, fetchFlowPapers } from "../api";
import {
  flowLayout,
  hsl,
  SIGNALS,
  COL_W,
  NODE_W,
  PAD_L,
  type Signal,
} from "./flow/layout";
import { useWorkspace } from "../hooks/use-workspace";

export default function FlowView() {
  const workspace = useWorkspace();
  const run = workspace.map?.run_id;
  const result = useQuery({
    queryKey: ["flow", run],
    queryFn: ({ signal }) => fetchFlow(run!, signal),
    enabled: !!run,
  });
  const data = result.data;
  const [signal, setSignal] = useState<Signal>("all");
  const [sel, setSel] = useState<{ w: number; c: number } | null>(null);
  const paperResult = useQuery({
    queryKey: ["flow-papers", run, sel],
    queryFn: ({ signal }) => fetchFlowPapers(run!, sel!.w, sel!.c, signal),
    enabled: !!run && !!sel,
  });
  const papers = paperResult.data;
  const [hoverFlow, setHoverFlow] = useState<number | null>(null);

  const layout = useMemo(() => flowLayout(data, signal), [data, signal]);

  if (result.isError || !data || !layout)
    return (
      <DataState
        error={result.error}
        loading={result.isPending}
        retry={() => result.refetch()}
        title="갈래 흐름 결과가 없습니다"
      />
    );

  const { byWin, node, ribbons, H, width } = layout;
  const selKey = sel ? `${sel.w}:${sel.c}` : null;
  const lit = (k: string) => {
    if (!selKey) return true;
    if (k === selKey) return true;
    return ribbons.some(
      (r) =>
        (`${r.from_window}:${r.from_cluster}` === selKey &&
          `${r.to_window}:${r.to_cluster}` === k) ||
        (`${r.to_window}:${r.to_cluster}` === selKey &&
          `${r.from_window}:${r.from_cluster}` === k),
    );
  };

  return (
    <div className="flow-wrap">
      <div className="tree-head">
        <span>
          창 {data.windows.length}개 · 클러스터 {data.clusters.length}개 · 흐름{" "}
          {ribbons.length}개
        </span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="흐름 신호"
          value={[signal]}
          onValueChange={(value) => {
            // 같은 항목을 다시 누르면 빈 배열이 온다. 신호는 항상 하나여야 한다.
            const next = value[0] as Signal | undefined;
            if (next) setSignal(next);
          }}
        >
          {SIGNALS.map((s) => (
            <ToggleGroupItem key={s.key} value={s.key}>
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="dim">
          리본 굵기 = 뒤 클러스터로 들어온 몫. 노드를 누르면 그 갈래만 남는다.
        </span>
      </div>

      <div className="flow-scroll">
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="시간 창별 연구 갈래 흐름도"
        >
          {data.windows.map((w) => (
            <g key={w.idx}>
              <text x={PAD_L + w.idx * COL_W} y={24} className="fv-win">
                {w.year_from}–{w.year_to}
              </text>
              <text x={PAD_L + w.idx * COL_W} y={38} className="fv-winsub">
                {w.n_works.toLocaleString()}편 · {w.n_clusters}개
              </text>
            </g>
          ))}

          {ribbons.map((r, i) => {
            const k1 = `${r.from_window}:${r.from_cluster}`;
            const k2 = `${r.to_window}:${r.to_cluster}`;
            const on = !selKey || k1 === selKey || k2 === selKey;
            const mx = (r.x0 + r.x1) / 2;
            const d =
              `M${r.x0},${r.sy0} C${mx},${r.sy0} ${mx},${r.dy0} ${r.x1},${r.dy0}` +
              ` L${r.x1},${r.dy1} C${mx},${r.dy1} ${mx},${r.sy1} ${r.x0},${r.sy1} Z`;
            return (
              <path
                key={i}
                d={d}
                fill={hsl(r.hue, 55, 58)}
                opacity={hoverFlow === i ? 0.75 : on ? 0.3 : 0.05}
                onMouseEnter={() => setHoverFlow(i)}
                onMouseLeave={() => setHoverFlow(null)}
              />
            );
          })}

          {byWin.map((ns) =>
            ns.map((n: any) => {
              const k = `${n.window}:${n.id}`;
              const on = lit(k);
              return (
                <g
                  key={k}
                  opacity={on ? 1 : 0.22}
                  onClick={() =>
                    setSel(selKey === k ? null : { w: n.window, c: n.id })
                  }
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    x={PAD_L + n.window * COL_W}
                    y={n.y}
                    width={NODE_W}
                    height={n.h}
                    rx="2"
                    fill={
                      k === selKey
                        ? "var(--accent)"
                        : hsl((n.id * 47 + n.window * 91) % 360, 50, 60)
                    }
                  />
                  {n.h >= 11 && (
                    <text
                      x={PAD_L + n.window * COL_W + NODE_W + 5}
                      y={n.y + n.h / 2 + 3.5}
                      className={k === selKey ? "fv-lab fv-lab--on" : "fv-lab"}
                    >
                      {n.label.length > 30
                        ? n.label.slice(0, 29) + "…"
                        : n.label}
                      <tspan className="fv-sz"> {n.size}</tspan>
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>

      {hoverFlow != null &&
        ribbons[hoverFlow] &&
        (() => {
          const r = ribbons[hoverFlow];
          const s = node.get(`${r.from_window}:${r.from_cluster}`);
          const d = node.get(`${r.to_window}:${r.to_cluster}`);
          return (
            <div className="flow-tip">
              <div className="ft-pair">
                {s?.label} <b>→</b> {d?.label}
              </div>
              <div className="ft-sig">
                <span>
                  인용 <b>{(r.citation * 100).toFixed(0)}%</b> ({r.n_papers}건)
                </span>
                <span>
                  의미 <b>{(r.semantic * 100).toFixed(0)}%</b>
                </span>
                <span>
                  저자 <b>{(r.author * 100).toFixed(0)}%</b>
                </span>
                <span className="ft-tot">
                  유입 몫 <b>{(r.w * 100).toFixed(0)}%</b>
                </span>
              </div>
            </div>
          );
        })()}

      {sel && (
        <Card
          role="region"
          aria-label="갈래 상세"
          className="absolute top-3 right-3 z-10 max-h-[calc(100%-24px)] w-80 gap-3"
        >
          <CardHeader>
            <span className="eyebrow">
              {data.windows[sel.w].year_from}–{data.windows[sel.w].year_to}
            </span>
            <CardTitle>{node.get(`${sel.w}:${sel.c}`)?.label}</CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="갈래 선택 해제"
                onClick={() => setSel(null)}
              >
                <X />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-col gap-3 overflow-auto">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">
                {node.get(`${sel.w}:${sel.c}`)?.size.toLocaleString()}편
              </Badge>
              {(node.get(`${sel.w}:${sel.c}`)?.keywords ?? []).map(
                (x: string) => (
                  <Badge key={x} variant="outline">
                    {x}
                  </Badge>
                ),
              )}
            </div>
            <Separator />
            <span className="eyebrow">피인용 상위</span>
            {paperResult.isError ? (
              <DataState
                error={paperResult.error}
                retry={() => paperResult.refetch()}
              />
            ) : paperResult.isPending ? (
              <DataState loading />
            ) : papers && papers.length > 0 ? (
              <WorkList works={papers} onSelect={workspace.select} />
            ) : (
              <Empty className="py-4">
                <EmptyHeader>
                  <EmptyTitle>논문 없음</EmptyTitle>
                  <EmptyDescription>
                    이 갈래에 연결된 논문을 찾지 못했습니다.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
