import { useQuery } from "@tanstack/react-query";
import { descendants } from "../views/map/labels";
import { clusterColor } from "../views/map/regions";
import { DataState } from "../components/DataState";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "../components/ui/item";
import { fetchClusterDetail } from "../api";
import { useWorkspace } from "../hooks/use-workspace";
import { WorkList } from "./WorkList";

// 하위 주제 행은 선택 동작이라 button으로 그린다. Item의 hover는 링크에만
// 붙어 있어 버튼에도 같은 피드백을 준다.
const rowClass = "cursor-pointer text-left hover:bg-muted";

// 인스펙터 본문. 래퍼·헤더·닫기 버튼은 Inspector가 그린다.
export default function ClusterPanel() {
  const workspace = useWorkspace();
  const node = workspace.tree?.nodes.find(
    (n) => n.id === workspace.selectedNode,
  );
  const selectedCluster = workspace.selectedCluster ?? node?.cluster_id ?? null;
  const selectCluster = workspace.selectCluster;
  const select = workspace.select;
  const run = workspace.map?.run_id;
  const result = useQuery({
    queryKey: ["cluster-detail", run, selectedCluster],
    queryFn: ({ signal }) => fetchClusterDetail(run!, selectedCluster!, signal),
    enabled: !!run && selectedCluster !== null,
  });
  const d = result.data;
  if (selectedCluster === null && node) {
    const ids = descendants(workspace.tree, node.id);
    return (
      <div className="flex flex-col gap-4">
        <span className="eyebrow">연구 분야</span>
        <h2 className="text-lg leading-snug font-semibold tracking-tight">
          {node.label}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{node.size.toLocaleString()}편</Badge>
          <Badge variant="secondary">{ids.size}개 하위 주제</Badge>
        </div>
        <Separator />
        <span className="eyebrow">하위 연구 주제</span>
        <ItemGroup>
          {workspace.clusters
            .filter((c) => ids.has(c.cluster_id))
            .map((c) => (
              <Item
                key={c.cluster_id}
                size="sm"
                className={rowClass}
                render={
                  <button
                    type="button"
                    onClick={() => selectCluster(c.cluster_id)}
                  />
                }
              >
                <ItemMedia>
                  <span
                    className="size-1.5 rounded-full"
                    style={{
                      background: `rgb(${clusterColor(c.cluster_id).join(",")})`,
                    }}
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{c.label}</ItemTitle>
                  <ItemDescription>{c.size.toLocaleString()}편</ItemDescription>
                </ItemContent>
              </Item>
            ))}
        </ItemGroup>
      </div>
    );
  }
  if (!d)
    return (
      <DataState
        error={result.error}
        loading={result.isPending}
        retry={() => result.refetch()}
      />
    );
  const peak = Math.max(1, ...d.by_year.map((y) => y.n));
  return (
    <div className="flex flex-col gap-4">
      <span className="eyebrow">주제 덩어리 #{d.cluster_id}</span>
      <h2 className="text-lg leading-snug font-semibold tracking-tight">
        {d.label}
      </h2>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{d.size.toLocaleString()}편</Badge>
        {d.year_median && (
          <Badge variant="secondary">중앙연도 {d.year_median}</Badge>
        )}
      </div>
      {d.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.keywords.map((k) => (
            <Badge key={k} variant="outline">
              {k}
            </Badge>
          ))}
        </div>
      )}
      {d.by_year.length > 1 && (
        <>
          <Separator />
          <span className="eyebrow">연도 분포</span>
          <div className="spark">
            {d.by_year.map((y) => (
              <i
                key={y.year}
                style={{ height: `${Math.max(2, (y.n / peak) * 46)}px` }}
                title={`${y.year}년 ${y.n}편`}
              />
            ))}
          </div>
          <div className="spark-ends">
            <span>{d.by_year[0].year}</span>
            <span>{d.by_year[d.by_year.length - 1].year}</span>
          </div>
        </>
      )}
      <Separator />
      <span className="eyebrow">피인용 상위</span>
      <WorkList works={d.top_works} onSelect={select} />
    </div>
  );
}
