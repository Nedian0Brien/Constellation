import { descendants } from "../views/map/labels";
import { useQuery } from "@tanstack/react-query";
import { DataState } from "../components/DataState";
import { fetchClusterDetail } from "../api";
import { useWorkspace } from "../hooks/use-workspace";

export default function ClusterPanel() {
  const workspace = useWorkspace();
  const node = workspace.tree?.nodes.find(
    (n) => n.id === workspace.selectedNode,
  );
  const selectedCluster = workspace.selectedCluster ?? node?.cluster_id ?? null;
  const selectCluster = workspace.selectCluster;
  const selected = workspace.selected;
  const select = workspace.select;
  const run = workspace.map?.run_id;
  const result = useQuery({
    queryKey: ["cluster-detail", run, selectedCluster],
    queryFn: ({ signal }) => fetchClusterDetail(run!, selectedCluster!, signal),
    enabled: !!run && selectedCluster !== null,
  });
  const d = result.data;
  // 논문을 고르면 논문 패널이 우선한다. 둘이 겹치지 않게 한다.
  if (selected) return null;
  if (selectedCluster === null && node) {
    const ids = descendants(workspace.tree, node.id);
    return (
      <aside className="detail cluster">
        <button
          className="close"
          aria-label="닫기"
          onClick={() => selectCluster(null)}
        >
          ✕
        </button>
        <span className="cl-eyebrow">연구 분야</span>
        <h2>{node.label}</h2>
        <p>
          {node.size.toLocaleString()}편 · {ids.size}개 하위 주제
        </p>
        <div className="cl-sec">하위 연구 주제</div>
        <ol className="cl-works">
          {workspace.clusters
            .filter((c) => ids.has(c.cluster_id))
            .map((c) => (
              <li key={c.cluster_id}>
                <button onClick={() => selectCluster(c.cluster_id)}>
                  <span className="ht">{c.label}</span>
                  <span className="hm">{c.size.toLocaleString()}편</span>
                </button>
              </li>
            ))}
        </ol>
      </aside>
    );
  }
  if (selectedCluster === null) return null;

  const peak = d ? Math.max(1, ...d.by_year.map((y) => y.n)) : 1;

  return (
    <aside className="detail cluster">
      <button
        className="close"
        onClick={() => selectCluster(null)}
        aria-label="닫기"
      >
        ✕
      </button>

      {!d && (
        <DataState
          error={result.error}
          loading={result.isPending}
          retry={() => result.refetch()}
        />
      )}

      {d && (
        <>
          <div className="cl-eyebrow">주제 덩어리 #{d.cluster_id}</div>
          <h2>{d.label}</h2>

          <div className="meta-row">
            <span className="tag">{d.size.toLocaleString()}편</span>
            {d.year_median && (
              <span className="tag">중앙연도 {d.year_median}</span>
            )}
          </div>

          {d.keywords.length > 0 && (
            <div className="topics">
              {d.keywords.map((k) => (
                <span key={k} className="topic topic--facet">
                  {k}
                </span>
              ))}
            </div>
          )}

          {d.by_year.length > 1 && (
            <>
              <div className="cl-sec">연도 분포</div>
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

          <div className="cl-sec">피인용 상위</div>
          <ol className="cl-works">
            {d.top_works.map((w) => (
              <li key={w.id}>
                <button onClick={() => select(w.id)}>
                  <span className="ht">{w.title}</span>
                  <span className="hm">
                    {w.year ?? "—"} · {w.cited.toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
