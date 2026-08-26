import { useEffect, useState } from "react";
import { fetchClusterDetail, type ClusterDetail } from "../api";
import { useStore } from "../store";

export default function ClusterPanel() {
  const selectedCluster = useStore((s) => s.selectedCluster);
  const selectCluster = useStore((s) => s.selectCluster);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const run = useStore((s) => s.map?.run_id);
  const [d, setD] = useState<ClusterDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCluster == null || !run) {
      setD(null);
      return;
    }
    let alive = true;
    setErr(null);
    setD(null);
    fetchClusterDetail(run, selectedCluster)
      .then((r) => alive && setD(r))
      .catch((e) => alive && setErr(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, [selectedCluster, run]);

  // 논문을 고르면 논문 패널이 우선한다. 둘이 겹치지 않게 한다.
  if (selectedCluster == null || selected) return null;

  const peak = d ? Math.max(1, ...d.by_year.map((y) => y.n)) : 1;

  return (
    <aside className="detail cluster">
      <button className="close" onClick={() => selectCluster(null)} aria-label="닫기">
        ✕
      </button>

      {err && <p className="err">불러오지 못했다: {err}</p>}
      {!d && !err && <p className="dim">불러오는 중…</p>}

      {d && (
        <>
          <div className="cl-eyebrow">주제 덩어리 #{d.cluster_id}</div>
          <h2>{d.label}</h2>

          <div className="meta-row">
            <span className="tag">{d.size.toLocaleString()}편</span>
            {d.year_median && <span className="tag">중앙연도 {d.year_median}</span>}
          </div>

          {d.keywords.length > 0 && (
            <div className="topics">
              {d.keywords.map((k) => (
                <span key={k} className="topic topic--facet">{k}</span>
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
