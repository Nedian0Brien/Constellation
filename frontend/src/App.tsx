import { useEffect, useState } from "react";
import { fetchClusters, fetchMap, fetchRuns, searchWorks, type SearchHit } from "./api";
import { useStore, type ColorBy } from "./store";
import MapView from "./views/MapView";
import DetailPanel from "./panels/DetailPanel";
import ClusterPanel from "./panels/ClusterPanel";
import "./index.css";

const COLOR_OPTIONS: { key: ColorBy; label: string }[] = [
  { key: "cluster", label: "주제 덩어리" },
  { key: "year", label: "발행연도" },
  { key: "cited", label: "피인용수" },
  { key: "abstract", label: "초록 유무" },
];

export default function App() {
  const { map, loading, error, setMap, setError } = useStore();
  const colorBy = useStore((s) => s.colorBy);
  const setColorBy = useStore((s) => s.setColorBy);
  const yearRange = useStore((s) => s.yearRange);
  const yearBounds = useStore((s) => s.yearBounds);
  const setYearRange = useStore((s) => s.setYearRange);
  const select = useStore((s) => s.select);
  const setHighlighted = useStore((s) => s.setHighlighted);
  const runs = useStore((s) => s.runs);
  const currentRun = useStore((s) => s.currentRun);
  const setRuns = useStore((s) => s.setRuns);
  const setRun = useStore((s) => s.setRun);
  const setClusters = useStore((s) => s.setClusters);

  const [q, setQ] = useState("");

  // 연도 범위에 실제로 남는 편수 — 슬라이더를 움직일 때 즉시 피드백이 있어야 한다.
  const visible = map
    ? map.year.reduce<number>(
        (n, y) => n + (y == null || (y >= yearRange[0] && y <= yearRange[1]) ? 1 : 0),
        0,
      )
    : 0;
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    fetchRuns().then(setRuns).catch(() => setRuns([]));
  }, [setRuns]);

  // currentRun이 바뀌면 그 run의 좌표를 다시 받는다.
  useEffect(() => {
    fetchMap(currentRun ?? undefined)
      .then((m) => {
        setMap(m);
        // 클러스터는 run에 딸린 것이라 좌표를 받은 뒤에 그 run으로 받는다.
        fetchClusters(m.run_id).then(setClusters).catch(() => setClusters([]));
      })
      .catch((e) => setError(String(e.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRun]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      setHighlighted([]);
      return;
    }
    const t = setTimeout(() => {
      searchWorks(q.trim())
        .then((r) => {
          setHits(r);
          setHighlighted(r.map((h) => h.id));
        })
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, setHighlighted]);

  if (error) {
    return (
      <div className="fatal">
        <h1>지도를 불러오지 못했다</h1>
        <pre>{error}</pre>
        <p>
          백엔드가 떠 있는지 확인하라: <code>constellation serve</code>
          <br />
          좌표가 없다면: <code>constellation embed</code> → <code>constellation project</code>
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="bar">
        <span className="brand">Constellation</span>
        <span className="sub">
          {map ? `${map.n.toLocaleString()}편` : loading ? "불러오는 중…" : ""}
        </span>

        {runs.length > 1 && (
          <select
            className="runsel"
            value={currentRun ?? ""}
            onChange={(e) => setRun(e.target.value)}
            title="임베딩 모델별 지도"
          >
            {runs.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {r.model ?? r.run_id}
              </option>
            ))}
          </select>
        )}

        <input
          className="search"
          placeholder="제목·초록 검색…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="seg">
          {COLOR_OPTIONS.map((o) => (
            <button
              key={o.key}
              className={colorBy === o.key ? "on" : ""}
              onClick={() => setColorBy(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>

        {map && (
          <div className="years">
            <span>{yearRange[0]}</span>
            <input
              type="range"
              min={yearBounds[0]}
              max={yearBounds[1]}
              value={yearRange[0]}
              onChange={(e) =>
                setYearRange([Math.min(+e.target.value, yearRange[1]), yearRange[1]])
              }
            />
            <input
              type="range"
              min={yearBounds[0]}
              max={yearBounds[1]}
              value={yearRange[1]}
              onChange={(e) =>
                setYearRange([yearRange[0], Math.max(+e.target.value, yearRange[0])])
              }
            />
            <span>{yearRange[1]}</span>
            <span className="count">
              {visible === map.n ? "전체" : `${visible.toLocaleString()}편`}
            </span>
          </div>
        )}
      </header>

      <main>
        <MapView />

        {hits.length > 0 && (
          <div className="hits">
            <div className="hits-head">검색 결과 {hits.length}건</div>
            <ul>
              {hits.map((h) => (
                <li key={h.id}>
                  <button onClick={() => select(h.id)}>
                    <span className="ht">{h.title}</span>
                    <span className="hm">
                      {h.year ?? "—"} · {(h.cited_by_count ?? 0).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ClusterPanel />
        <DetailPanel />
      </main>
    </div>
  );
}
